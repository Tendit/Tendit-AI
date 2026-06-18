import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerSchema, loginSchema, PLANS, MODEL_COSTS, MODELS, ADMIN_EMAIL, ADMIN_PASSWORD, applyMargin, DEFAULT_RATE_LIMITS, AGENT_TOOLS, REAL_TOOLS, buildAgentSystemPrompt, sessions as sessionsTable, MEDIA_COSTS, buildAgentChatPrompt, users, PRODUCT_CATALOG } from "@shared/schema";
import type { AgentToolConfig, AgentToolRule, PlatformAgent } from "@shared/schema";
import { seedCalendarEvents, buildTimelineContext, buildTimelinePrompt } from "./calendar-engine";
import { buildRequestContext, evaluateRules, applyRuleActions, getDefaultRules } from "./rule-engine";
import { captureUserEvent, buildUserStoryArc, buildStoryArcContextForChat } from "./story-arc";
import { runAgentLoop } from "./agent-orchestrator";
import { handleTelegramUpdate, notifyOwnerFromWeb, setCallProvider, initTelegramBots, setTelegramWebhook, getTelegramBotInfo, sendTelegramMessage, sendApprovalCard } from "./telegram";
import { webSearch, fetchPage, transcribeAudio } from "./web-tools";
import { getRuntime } from "./runtime";
import { uploadAudio } from "./r2-storage";
import { getStripe, getWebhookSecret } from "./stripe-client";
import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer config for file uploads
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image|audio|video)\//;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image, audio, and video files are allowed"));
    }
  },
});

// Session management — DB-backed, survives server restarts
import { eq } from "drizzle-orm";
import { db } from "./storage";

const SESSION_TTL_DAYS = 30; // sessions last 30 days

function generateToken(): string {
  return randomUUID() + "-" + randomUUID();
}

function getSessionUserId(token: string): number | undefined {
  const session = db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).get();
  if (!session) return undefined;
  // Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    db.delete(sessionsTable).where(eq(sessionsTable.token, token)).run();
    return undefined;
  }
  return session.userId;
}

function createSession(token: string, userId: number): void {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.insert(sessionsTable).values({ token, userId, expiresAt }).run();
}

function deleteSession(token: string): void {
  db.delete(sessionsTable).where(eq(sessionsTable.token, token)).run();
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.replace("Bearer ", "");
  const userId = getSessionUserId(token);
  if (!userId) {
    return res.status(401).json({ message: "Invalid session" });
  }
  (req as any).userId = userId;
  (req as any).token = token;
  next();
}

async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.replace("Bearer ", "");
  const userId = getSessionUserId(token);
  if (!userId) {
    return res.status(401).json({ message: "Invalid session" });
  }
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  (req as any).userId = userId;
  (req as any).token = token;
  next();
}

async function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer pxk-")) {
    return res.status(401).json({ message: "Invalid API key" });
  }
  const key = authHeader.replace("Bearer ", "");
  const apiKey = await storage.getApiKeyByKey(key);
  if (!apiKey) {
    return res.status(401).json({ message: "Invalid API key" });
  }
  await storage.updateApiKeyLastUsed(apiKey.id);
  (req as any).userId = apiKey.userId;
  (req as any).apiKeyId = apiKey.id;
  next();
}

// Rate limit checker
async function checkRateLimit(userId: number, userPlan: string): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  // Get rule from DB or fall back to defaults
  const rule = await storage.getRateLimitRuleForPlan(userPlan);
  const limits = rule || DEFAULT_RATE_LIMITS[userPlan] || DEFAULT_RATE_LIMITS.free;

  // Check cooldown
  const cooldownSec = rule?.cooldownSeconds ?? (limits as any).cooldownSeconds ?? 0;
  if (cooldownSec > 0) {
    const lastReq = await storage.getLastRequestTime(userId);
    if (lastReq) {
      const elapsed = (Date.now() - new Date(lastReq).getTime()) / 1000;
      if (elapsed < cooldownSec) {
        return { allowed: false, reason: `Please wait ${Math.ceil(cooldownSec - elapsed)}s between requests`, retryAfter: Math.ceil(cooldownSec - elapsed) };
      }
    }
  }

  // Check per-minute limit
  const maxPerMin = rule?.maxRequestsPerMinute ?? (limits as any).maxRequestsPerMinute;
  if (maxPerMin) {
    const countMin = await storage.getUserRequestCount(userId, 1);
    if (countMin >= maxPerMin) {
      return { allowed: false, reason: `Rate limit: max ${maxPerMin} requests per minute`, retryAfter: 60 };
    }
  }

  // Check per-hour limit
  const maxPerHour = rule?.maxRequestsPerHour ?? (limits as any).maxRequestsPerHour;
  if (maxPerHour) {
    const countHour = await storage.getUserRequestCount(userId, 60);
    if (countHour >= maxPerHour) {
      return { allowed: false, reason: `Rate limit: max ${maxPerHour} requests per hour`, retryAfter: 3600 };
    }
  }

  // Check per-day limit
  const maxPerDay = rule?.maxRequestsPerDay ?? (limits as any).maxRequestsPerDay;
  if (maxPerDay) {
    const countDay = await storage.getUserRequestCount(userId, 1440);
    if (countDay >= maxPerDay) {
      return { allowed: false, reason: `Daily limit: max ${maxPerDay} requests per day`, retryAfter: 86400 };
    }
  }

  // Check daily credits cap
  const maxCreditsPerDay = rule?.maxCreditsPerDay ?? (limits as any).maxCreditsPerDay;
  if (maxCreditsPerDay) {
    const creditsToday = await storage.getUserCreditsUsedToday(userId);
    if (creditsToday >= maxCreditsPerDay) {
      return { allowed: false, reason: `Daily credit limit reached (${maxCreditsPerDay} credits/day)`, retryAfter: 86400 };
    }
  }

  return { allowed: true };
}

// Helper: convert attachments to provider-specific multimodal format
function buildMultimodalContent(text: string, attachments: any[], provider: string): any {
  if (!attachments || attachments.length === 0) return text;

  // Only images are supported for vision models across providers
  const images = attachments.filter((a: any) => a.type === "image");
  if (images.length === 0) return text;

  if (provider === "openai" || provider === "perplexity") {
    // OpenAI vision format: content array with text + image_url parts
    const content: any[] = [];
    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: img.dataUrl || img.url },
      });
    }
    content.push({ type: "text", text });
    return content;
  }

  if (provider === "anthropic") {
    // Anthropic vision: content blocks with source type base64/url
    const content: any[] = [];
    for (const img of images) {
      if (img.dataUrl && img.dataUrl.startsWith("data:")) {
        const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: match[1], data: match[2] },
          });
        }
      }
    }
    content.push({ type: "text", text });
    return content;
  }

  if (provider === "google") {
    // Google Gemini: parts array with inlineData
    const parts: any[] = [];
    for (const img of images) {
      if (img.dataUrl && img.dataUrl.startsWith("data:")) {
        const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    }
    parts.push({ text });
    return parts; // special: return parts array for Google
  }

  return text;
}

// Sanitize messages for Perplexity: requires strict alternation (system?, then user/assistant alternating)
function sanitizeMessagesForPerplexity(messages: any[]): any[] {
  const result: any[] = [];
  
  // Collect all leading "user" messages that are injected context (system prompts, timeline, story arc)
  // and merge them into a single system message
  let systemParts: string[] = [];
  let i = 0;
  
  // Gather consecutive user messages from the beginning (these are injected context)
  while (i < messages.length && messages[i].role === "user" && i < messages.length - 1) {
    // Check if next message is also user (indicating this is injected context, not a real user message)
    if (i + 1 < messages.length && messages[i + 1].role === "user") {
      systemParts.push(typeof messages[i].content === "string" ? messages[i].content : JSON.stringify(messages[i].content));
      i++;
    } else {
      break;
    }
  }
  
  // If we collected system parts, add as a single system message
  if (systemParts.length > 0) {
    result.push({ role: "system", content: systemParts.join("\n\n") });
  }
  
  // Process remaining messages, merging consecutive same-role messages
  for (; i < messages.length; i++) {
    const msg = messages[i];
    const lastResult = result[result.length - 1];
    if (lastResult && lastResult.role === msg.role && msg.role !== "system") {
      // Merge consecutive same-role messages
      const lastContent = typeof lastResult.content === "string" ? lastResult.content : JSON.stringify(lastResult.content);
      const thisContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      lastResult.content = lastContent + "\n\n" + thisContent;
    } else {
      result.push({ ...msg });
    }
  }
  
  // Final safety check: ensure it starts with system or user, and alternates properly
  // If first non-system message is assistant, prepend a user message
  const firstNonSystem = result.find(m => m.role !== "system");
  if (firstNonSystem && firstNonSystem.role === "assistant") {
    const idx = result.indexOf(firstNonSystem);
    result.splice(idx, 0, { role: "user", content: "Continue." });
  }
  
  return result;
}

// Helper to call different AI providers
async function callProvider(provider: string, model: string, messages: any[], attachments?: any[]) {
  const providerKey = await storage.getProviderKey(provider);
  const apiKey = providerKey?.apiKey;

  if (!apiKey) {
    return {
      content: `[Demo] This is a simulated ${provider}/${model} response. Configure the ${provider} API key in Admin > Providers to enable real responses.`,
      citations: null,
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    };
  }

  // Apply multimodal content to the last user message if attachments are present
  let apiMessages = messages;
  if (attachments && attachments.length > 0) {
    apiMessages = messages.map((m: any, i: number) => {
      // Only transform the last user message with attachments
      if (m.role === "user" && i === messages.length - 1) {
        return { ...m, content: buildMultimodalContent(m.content, attachments, provider) };
      }
      return m;
    });
  }

  try {
    if (provider === "perplexity") {
      // Perplexity requires strict message alternation: system?, user, assistant, user...
      const sanitized = sanitizeMessagesForPerplexity(apiMessages);
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: sanitized }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "No response",
        citations: data.citations ? JSON.stringify(data.citations) : null,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
      };
    }

    if (provider === "anthropic") {
      const systemMsg = apiMessages.find((m: any) => m.role === "system");
      const nonSystemMsgs = apiMessages.filter((m: any) => m.role !== "system");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          ...(systemMsg ? { system: systemMsg.content } : {}),
          messages: nonSystemMsgs,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return {
        content: data.content?.[0]?.text || "No response",
        citations: null,
        usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0 },
      };
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return {
        content: data.choices?.[0]?.message?.content || "No response",
        citations: null,
        usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
      };
    }

    if (provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: apiMessages.map((m: any) => {
            // If content is already a parts array (multimodal), use it directly
            if (Array.isArray(m.content)) {
              return { role: m.role === "assistant" ? "model" : "user", parts: m.content };
            }
            return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
          }),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response",
        citations: null,
        usage: { prompt_tokens: data.usageMetadata?.promptTokenCount || 0, completion_tokens: data.usageMetadata?.candidatesTokenCount || 0 },
      };
    }

    return { content: `Provider ${provider} not supported`, citations: null, usage: { prompt_tokens: 0, completion_tokens: 0 } };
  } catch (e: any) {
    return { content: `Error from ${provider}: ${e.message}`, citations: null, usage: { prompt_tokens: 0, completion_tokens: 0 } };
  }
}

// Part X — Direct Groq call for arm AI managers (Tier 1).
// callProvider does not natively route Groq; arm inference uses the free Groq pool
// (NOT Base44 — explicitly excluded). Rotates auth_profiles via storage.pickAuthProfile.
async function callGroqArm(messages: any[], model = "llama-3.3-70b-versatile"): Promise<{ content: string; usage: any }> {
  const apiKey = process.env.GROQ_API_KEY;
  // Rotation cue across the 5-entity round-robin pool (label-only; real key from env).
  const profile = storage.pickAuthProfile("groq");
  if (profile) storage.incrementProfileUsage(profile.id);
  if (!apiKey) {
    return {
      content: "[Demo] Groq key not configured. Set GROQ_API_KEY to enable arm AI manager replies. (Free Groq pool covers arm inference — not routed through Base44.)",
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    };
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 1500 }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || "No response",
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 },
    };
  } catch (e: any) {
    return { content: `Error from groq: ${e.message}`, usage: { prompt_tokens: 0, completion_tokens: 0 } };
  }
}

// Generate follow-up suggestions using a cheap model
async function generateFollowUps(userMessage: string, assistantResponse: string, model: string): Promise<string[]> {
  const settings = await storage.getAllSettings();
  if (settings.smart_followups_enabled !== "true") return [];

  const maxFollowups = parseInt(settings.max_followups || "3");
  const followupModel = settings.followup_model || "sonar";
  const modelDef = MODELS.find((m) => m.id === followupModel);
  const provider = modelDef?.provider || "perplexity";

  try {
    const result = await callProvider(provider, followupModel, [
      {
        role: "system",
        content: `You generate follow-up questions. Given a conversation, suggest ${maxFollowups} concise follow-up questions the user might want to ask next. Return ONLY a JSON array of strings, nothing else. Make questions specific and actionable. Example: ["What are the pricing tiers?","How does it compare to competitors?","Can you show code examples?"]`
      },
      {
        role: "user",
        content: `User asked: "${userMessage.substring(0, 500)}"\n\nAssistant answered: "${assistantResponse.substring(0, 1000)}"\n\nGenerate ${maxFollowups} follow-up questions as a JSON array:`
      }
    ]);

    // Parse JSON array from response
    const content = result.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, maxFollowups).map((q: any) => String(q).trim()).filter(Boolean);
      }
    }
    return [];
  } catch {
    return [];
  }
}

// Agent tool system prompts (including timeline-aware)
async function getToolSystemPrompt(toolId: string, userMessage?: string): Promise<string> {
  if (toolId === "timeline") {
    // Build dynamic timeline context
    const useCase = detectUseCase(userMessage || "");
    const ctx = await buildTimelineContext();

    // Try to extract date range from user message
    const dateRangeMatch = userMessage?.match(/(\d{4})/);
    if (dateRangeMatch) {
      const year = parseInt(dateRangeMatch[1]);
      ctx.dateRange = { start: `${year}-01-01`, end: `${year}-12-31` };
      const yearEvents = await buildTimelineContext(`${year}-01-01`, { start: `${year}-01-01`, end: `${year}-12-31` });
      ctx.relevantEvents = yearEvents.relevantEvents;
    }

    return buildTimelinePrompt(ctx, useCase);
  }

  const toolPrompts: Record<string, string> = {
    search: "You are a research assistant with web search capabilities. When answering, cite your sources clearly. Structure your response with clear sections. If you're from Perplexity, you have real search - use it. For other providers, provide your best knowledge with clear caveats about what may need verification.",
    document: `You are a professional document generator. Create well-structured documents with:
- Clear title and sections with headers
- Professional formatting using markdown
- Table of contents for longer documents
- Executive summary when appropriate
- Actionable conclusions and recommendations
Always produce complete, ready-to-use content.`,
    code: `You are an expert programming assistant. When writing code:
- Always include complete, runnable code examples
- Add comments explaining key logic
- Handle edge cases and errors
- Suggest best practices and optimizations
- If asked to debug, explain the issue clearly before the fix`,
    analyze: `You are a data analysis expert. When analyzing:
- Present findings in clear, structured format
- Use tables for comparisons
- Highlight key insights and trends
- Provide actionable recommendations
- Include methodology notes when relevant`,
    creative: `You are a creative content specialist. When creating:
- Match the requested tone and style
- Be original and engaging
- Provide multiple options when asked
- Consider the target audience
- Include calls-to-action when appropriate`,
  };
  return toolPrompts[toolId] || "";
}

function detectUseCase(message: string): "book" | "marketing" | "personal" | "general" {
  const lower = message.toLowerCase();
  if (lower.match(/book|story|novel|chapter|character|narrative|plot|fiction|memoir|autobiography/)) return "book";
  if (lower.match(/marketing|campaign|content.?calendar|social.?media|brand|launch|promotion|advertising|sales/)) return "marketing";
  if (lower.match(/personal|self.?improvement|habit|goal|resolution|growth|develop|fitness|wellness|routine/)) return "personal";
  return "general";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Seed admin user on startup ===
  const existingAdmin = await storage.getUserByEmail(ADMIN_EMAIL);
  if (!existingAdmin) {
    const hashedPw = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await storage.createUser({ username: "admin", email: ADMIN_EMAIL, password: hashedPw, role: "admin" });
    await storage.updateUserCredits(1, 99999);
    console.log("Admin user created:", ADMIN_EMAIL);
  } else if (existingAdmin.password === "pending-bootstrap") {
    // Bootstrap admin was created early by storage.ts seed (so projects could be owned).
    // Now we set the real hashed password.
    const hashedPw = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.update(users).set({ password: hashedPw }).where(eq(users.id, existingAdmin.id));
    await storage.updateUserCredits(existingAdmin.id, 99999);
    console.log("Admin user password set:", ADMIN_EMAIL);
  }

  // === Seed calendar events ===
  await seedCalendarEvents();

  // === Seed default AI rules ===
  const existingAiRules = await storage.getAiRules();
  if (existingAiRules.length === 0) {
    const defaults = getDefaultRules();
    for (const rule of defaults) {
      await storage.createAiRule(rule);
    }
    console.log(`Seeded ${defaults.length} default AI rules`);
  }

  // === Seed default rate limit rules ===
  const existingRules = await storage.getRateLimitRules();
  if (existingRules.length === 0) {
    for (const [plan, limits] of Object.entries(DEFAULT_RATE_LIMITS)) {
      await storage.createRateLimitRule({
        name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Limits`,
        plan,
        ...limits,
        isActive: true,
      });
    }
    console.log("Default rate limit rules seeded");
  }

  // === Seed agent tools config ===
  await storage.seedAgentTools();
  console.log("Agent tools config ready");

  // ===== FILE UPLOAD =====
  // Serve uploaded files statically
  app.use("/api/uploads", (await import("express")).default.static(UPLOADS_DIR));

  // Upload endpoint (authenticated)
  app.post("/api/upload", authMiddleware, (req, res, next) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "File too large (max 20MB)" });
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      next();
    });
  }, async (req: Request, res: Response) => {
    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    const result = files.map((f) => {
      const mediaType = f.mimetype.startsWith("image") ? "image" : f.mimetype.startsWith("audio") ? "audio" : "video";
      return {
        type: mediaType,
        name: f.originalname,
        url: `/api/uploads/${f.filename}`,
        mimetype: f.mimetype,
        size: f.size,
      };
    });

    return res.json({ files: result });
  });

  // ===== AUTH =====
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { username, email, password } = parsed.data;

      if (await storage.getUserByEmail(email)) return res.status(400).json({ message: "Email already exists" });
      if (await storage.getUserByUsername(username)) return res.status(400).json({ message: "Username already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, email, password: hashedPassword });
      await storage.updateUserCredits(user.id, PLANS.free.credits);

      const token = generateToken();
      createSession(token, user.id);

      return res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, credits: PLANS.free.credits, plan: user.plan, role: user.role },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(400).json({ message: "Invalid credentials" });
      if (!user.isActive) return res.status(403).json({ message: "Account is disabled" });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ message: "Invalid credentials" });

      const token = generateToken();
      createSession(token, user.id);

      return res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, credits: user.credits, plan: user.plan, role: user.role },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", authMiddleware, (req, res) => {
    deleteSession((req as any).token);
    return res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    return res.json({
      id: user.id, username: user.username, email: user.email,
      credits: user.credits, plan: user.plan, role: user.role,
    });
  });

  // ===== CONVERSATIONS =====
  app.get("/api/conversations", authMiddleware, async (req, res) => {
    return res.json(await storage.getConversations((req as any).userId));
  });

  app.post("/api/conversations", authMiddleware, async (req, res) => {
    return res.json(await storage.createConversation((req as any).userId, req.body.title || "New Conversation"));
  });

  app.get("/api/conversations/:id/messages", authMiddleware, async (req, res) => {
    const conv = await storage.getConversation(parseInt(req.params.id), (req as any).userId);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });
    return res.json(await storage.getMessages(conv.id));
  });

  app.delete("/api/conversations/:id", authMiddleware, async (req, res) => {
    await storage.deleteConversation(parseInt(req.params.id), (req as any).userId);
    return res.json({ message: "Deleted" });
  });

  // ===== ARTIFACTS (serve generated files) =====
  const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // Named routes must come BEFORE the static middleware
  app.get("/api/artifacts/list", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const arts = await storage.getUserArtifacts(userId);
    return res.json(arts);
  });

  // Get conversation artifacts
  app.get("/api/conversations/:convId/artifacts", authMiddleware, async (req, res) => {
    const convId = parseInt(req.params.convId);
    const arts = await storage.getConversationArtifacts(convId);
    return res.json(arts);
  });

  // Static file serving for artifact downloads
  app.use("/api/artifacts", (await import("express")).default.static(ARTIFACTS_DIR));

  // ===== REAL TOOLS CONFIG (from DB) =====
  app.get("/api/tools", async (_req, res) => {
    try {
      const dbTools = await storage.getEnabledAgentTools();
      const tools = dbTools.map(t => ({ id: t.toolId, name: t.name, description: t.description, icon: t.icon, creditMultiplier: t.creditMultiplier }));
      return res.json({ tools: tools.length > 0 ? tools : REAL_TOOLS });
    } catch {
      return res.json({ tools: REAL_TOOLS });
    }
  });

  // ===== ADMIN: AGENT TOOLS MANAGEMENT =====
  app.get("/api/admin/agent-tools", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const tools = await storage.getAllAgentTools();
    const rules = await storage.getAllToolRules();
    return res.json({ tools, rules });
  });

  app.put("/api/admin/agent-tools/:id", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const id = parseInt(req.params.id);
    const updated = await storage.updateAgentTool(id, req.body);
    if (!updated) return res.status(404).json({ message: "Tool not found" });
    return res.json(updated);
  });

  app.post("/api/admin/agent-tools", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const tool = await storage.createAgentTool(req.body);
      return res.json(tool);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Failed to create tool" });
    }
  });

  app.delete("/api/admin/agent-tools/:id", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    await storage.deleteAgentTool(parseInt(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // Agent tool rules
  app.post("/api/admin/agent-tool-rules", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    try {
      const rule = await storage.createToolRule(req.body);
      return res.json(rule);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || "Failed to create rule" });
    }
  });

  app.put("/api/admin/agent-tool-rules/:id", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const updated = await storage.updateToolRule(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ message: "Rule not found" });
    return res.json(updated);
  });

  app.delete("/api/admin/agent-tool-rules/:id", authMiddleware, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
    await storage.deleteToolRule(parseInt(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // ===== AGENT CHAT (SSE streaming with tool execution) =====
  app.post("/api/agent/chat", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Rate limit check
    if (user.role !== "admin") {
      const rateCheck = await checkRateLimit(userId, user.plan);
      if (!rateCheck.allowed) {
        return res.status(429).json({ message: rateCheck.reason, retryAfter: rateCheck.retryAfter });
      }
    }

    const { message, conversationId, model = "sonar", attachments: rawAttachments, agentMode = false } = req.body;
    if (!message) return res.status(400).json({ message: "Message is required" });

    const chatAttachments: any[] = Array.isArray(rawAttachments) ? rawAttachments : [];
    const modelDef = MODELS.find((m) => m.id === model);
    const baseCost = modelDef?.cost || MODEL_COSTS[model] || 1;
    const provider = modelDef?.provider || "perplexity";
    const multiplier = await storage.getMarginMultiplier();
    // Agent mode costs 2x base
    let creditCost = applyMargin(baseCost * 2, multiplier);

    if (user.credits < creditCost) {
      return res.status(402).json({ message: "Insufficient credits" });
    }

    let convId = conversationId;
    if (!convId) {
      const conv = await storage.createConversation(userId, message.substring(0, 50));
      convId = conv.id;
    }

    // Save user message
    const attachmentsJson = chatAttachments.length > 0 ? JSON.stringify(chatAttachments) : undefined;
    await storage.createMessage(convId, "user", message, undefined, undefined, undefined, undefined, undefined, attachmentsJson);

    // Get history
    const history = await storage.getMessages(convId);
    const messagesForApi = history.slice(-10).map((m) => ({ role: m.role as string, content: m.content }));

    // Setup SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendSSE = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Get Perplexity key for search tool
    const pxKey = await storage.getProviderKey("perplexity");

    try {
      // For images, read file and convert to base64 data URLs for vision models
      let visionAttachments = chatAttachments;
      if (chatAttachments.length > 0) {
        visionAttachments = chatAttachments.map((a: any) => {
          if (a.type === "image" && a.url && !a.dataUrl) {
            try {
              const filePath = path.join(UPLOADS_DIR, path.basename(a.url));
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath);
                const b64 = data.toString("base64");
                return { ...a, dataUrl: `data:${a.mimetype};base64,${b64}` };
              }
            } catch {}
          }
          return a;
        });
      }

      const result = await runAgentLoop(message, messagesForApi, visionAttachments, {
        userId,
        conversationId: convId,
        model,
        provider,
        perplexityKey: pxKey?.apiKey,
        callProvider: callProvider,
        onStep: (step) => sendSSE("step", step),
      });

      // Additional credits for tool calls (each tool call costs extra)
      const toolCreditCost = result.totalToolCalls * applyMargin(baseCost, multiplier);
      const totalCreditCost = creditCost + toolCreditCost;

      // Save assistant message with steps metadata
      const assistantMsg = await storage.createMessage(
        convId, "assistant", result.finalResponse, model, provider, totalCreditCost,
        null, "agent", JSON.stringify({
          steps: result.steps,
          artifacts: result.artifacts,
          toolCalls: result.totalToolCalls,
        })
      );

      await storage.updateUserCredits(userId, user.credits - totalCreditCost);

      await storage.createUsageLog({
        userId,
        apiKeyId: null,
        model,
        provider,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        creditsUsed: totalCreditCost,
        endpoint: "agent",
      });

      // Capture user event
      try {
        await captureUserEvent({
          userId,
          conversationId: convId,
          messageId: assistantMsg.id,
          userMessage: message,
          aiResponse: result.finalResponse,
          toolUsed: "agent",
          model,
          creditsUsed: totalCreditCost,
        });
      } catch {}

      // Send final result
      sendSSE("done", {
        message: assistantMsg,
        conversationId: convId,
        creditsUsed: totalCreditCost,
        creditsRemaining: user.credits - totalCreditCost,
        artifacts: result.artifacts,
        totalToolCalls: result.totalToolCalls,
        steps: result.steps,
      });

    } catch (e: any) {
      sendSSE("error", { message: e.message });
    }

    res.end();
  });

  // ===== CHAT (Multi-provider with agent tools + follow-ups + rate limiting) =====
  app.post("/api/chat", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Rate limit check (admin is exempt)
    if (user.role !== "admin") {
      const rateCheck = await checkRateLimit(userId, user.plan);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          message: rateCheck.reason,
          retryAfter: rateCheck.retryAfter,
        });
      }
    }

    const { message, conversationId, model = "sonar", tool, attachments: rawAttachments } = req.body;
    if (!message) return res.status(400).json({ message: "Message is required" });

    // Parse attachments if provided
    const chatAttachments: any[] = Array.isArray(rawAttachments) ? rawAttachments : [];

    const modelDef = MODELS.find((m) => m.id === model);
    const baseCost = modelDef?.cost || MODEL_COSTS[model] || 1;
    const provider = modelDef?.provider || "perplexity";

    // Apply admin-configured margin multiplier
    const multiplier = await storage.getMarginMultiplier();
    let creditCost = applyMargin(baseCost, multiplier);

    // Apply tool credit multiplier if agent tool is used
    const agentTool = tool ? AGENT_TOOLS.find((t) => t.id === tool) : null;
    if (agentTool) {
      creditCost = applyMargin(creditCost, agentTool.creditMultiplier);
    }

    if (user.credits < creditCost) {
      return res.status(402).json({ message: "Insufficient credits" });
    }

    let convId = conversationId;
    if (!convId) {
      const conv = await storage.createConversation(userId, message.substring(0, 50));
      convId = conv.id;
    }

    const attachmentsJson = chatAttachments.length > 0 ? JSON.stringify(chatAttachments) : undefined;
    await storage.createMessage(convId, "user", message, undefined, undefined, undefined, undefined, undefined, attachmentsJson);

    const history = await storage.getMessages(convId);
    const messagesForApi = history.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // If agent tool selected, inject system prompt (timeline tool is always injected for timeline use-case)
    const detectedUseCase = detectUseCase(message);
    const shouldInjectTimeline = agentTool?.id === "timeline" || (detectedUseCase !== "general" && !agentTool);

    if (agentTool) {
      const systemPrompt = await getToolSystemPrompt(agentTool.id, message);
      if (systemPrompt) {
        messagesForApi.unshift({ role: "user" as const, content: `[System instruction - act as follows]: ${systemPrompt}` });
      }
    }

    // Auto-inject timeline context when topic is detected
    if (shouldInjectTimeline && !agentTool) {
      const ctx = await buildTimelineContext();
      const timelinePrompt = buildTimelinePrompt(ctx, detectedUseCase);
      messagesForApi.unshift({ role: "user" as const, content: `[Calendar & Timeline context for accuracy]: ${timelinePrompt}` });
    }

    // === USER STORY ARC: inject context from user's history ===
    try {
      const storyCtx = await buildStoryArcContextForChat(userId);
      if (storyCtx) {
        messagesForApi.unshift({ role: "user" as const, content: storyCtx });
      }
    } catch (e) {
      console.error("Story arc context error:", e);
    }

    // === AI RULE ENGINE: evaluate and inject ===
    let activeModel = model;
    let ruleDisclaimers: string[] = [];
    let matchedRuleNames: string[] = [];
    try {
      const ruleCtx = await buildRequestContext({
        message,
        userPlan: user.plan,
        userRole: user.role,
        model,
        provider,
        tool: agentTool?.id,
        endpoint: "chat",
      });
      const matchedRules = await evaluateRules(ruleCtx);
      if (matchedRules.length > 0) {
        const applied = applyRuleActions(matchedRules, [...messagesForApi]);
        if (applied.blocked) {
          return res.status(403).json({ message: applied.blocked });
        }
        // Replace messagesForApi with rule-modified version
        messagesForApi.length = 0;
        messagesForApi.push(...applied.messages);
        if (applied.modelOverride) activeModel = applied.modelOverride;
        ruleDisclaimers = applied.disclaimers;
        matchedRuleNames = matchedRules.map(r => r.ruleName);
      }
    } catch (e) {
      // Rule engine errors should not block requests
      console.error("Rule engine error:", e);
    }

    // Resolve final provider from potentially overridden model
    const finalModelDef = activeModel !== model ? MODELS.find((m) => m.id === activeModel) : modelDef;
    const finalProvider = finalModelDef?.provider || provider;

    try {
      // For images, read file and convert to base64 data URLs for vision models
      let visionAttachments = chatAttachments;
      if (chatAttachments.length > 0) {
        visionAttachments = chatAttachments.map((a: any) => {
          if (a.type === "image" && a.url && !a.dataUrl) {
            try {
              const filePath = path.join(UPLOADS_DIR, path.basename(a.url));
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath);
                const b64 = data.toString("base64");
                return { ...a, dataUrl: `data:${a.mimetype};base64,${b64}` };
              }
            } catch {}
          }
          return a;
        });
      }

      const result = await callProvider(finalProvider, activeModel, messagesForApi, visionAttachments);

      const assistantMsg = await storage.createMessage(
        convId, "assistant", result.content, model, provider, creditCost, result.citations,
        agentTool?.id || null, attachmentsJson
      );

      await storage.updateUserCredits(userId, user.credits - creditCost);

      await storage.createUsageLog({
        userId,
        apiKeyId: null,
        model,
        provider,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        creditsUsed: creditCost,
        endpoint: tool ? `chat:${tool}` : "chat",
      });

      // Generate follow-up suggestions (async, don't block response)
      let followUps: string[] = [];
      try {
        followUps = await generateFollowUps(message, result.content, model);
      } catch {}

      // === AUTO-CAPTURE: Log user event for timeline (async, don't block) ===
      try {
        await captureUserEvent({
          userId,
          conversationId: convId,
          messageId: assistantMsg.id,
          userMessage: message,
          aiResponse: result.content,
          toolUsed: agentTool?.id,
          model,
          creditsUsed: creditCost,
        });
      } catch (e) {
        console.error("Event capture error:", e);
      }

      return res.json({
        message: assistantMsg,
        conversationId: convId,
        creditsUsed: creditCost,
        creditsRemaining: user.credits - creditCost,
        citations: result.citations ? JSON.parse(result.citations) : [],
        followUps,
        toolUsed: agentTool?.id || null,
        rulesApplied: matchedRuleNames,
        disclaimers: ruleDisclaimers,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ===== EXTERNAL API PROXY =====
  app.post("/api/v1/chat/completions", apiKeyMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const apiKeyId = (req as any).apiKeyId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    // Rate limit check
    const rateCheck = await checkRateLimit(userId, user.plan);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: { message: rateCheck.reason, type: "rate_limit_exceeded" },
        retryAfter: rateCheck.retryAfter,
      });
    }

    const { model = "sonar", messages: msgs } = req.body;
    const modelDef = MODELS.find((m) => m.id === model);
    const baseCost = modelDef?.cost || 1;
    const provider = modelDef?.provider || "perplexity";

    // Apply admin-configured margin multiplier
    const multiplier = await storage.getMarginMultiplier();
    const creditCost = applyMargin(baseCost, multiplier);

    if (user.credits < creditCost) {
      return res.status(402).json({ error: { message: "Insufficient credits", type: "insufficient_credits" } });
    }

    // === AI RULE ENGINE for API proxy ===
    let activeModel = model;
    try {
      const ruleCtx = await buildRequestContext({
        message: msgs?.map((m: any) => m.content).join(" ").substring(0, 2000) || "",
        userPlan: user.plan,
        userRole: user.role,
        model,
        provider,
        endpoint: "api",
      });
      const matchedRules = await evaluateRules(ruleCtx);
      if (matchedRules.length > 0) {
        const applied = applyRuleActions(matchedRules, msgs);
        if (applied.blocked) {
          return res.status(403).json({ error: { message: applied.blocked, type: "blocked_by_rules" } });
        }
        msgs.length = 0;
        msgs.push(...applied.messages);
        if (applied.modelOverride) activeModel = applied.modelOverride;
      }
    } catch (e) {
      console.error("Rule engine error (API):", e);
    }

    const finalModelDef = activeModel !== model ? MODELS.find((m) => m.id === activeModel) : modelDef;
    const finalProvider = finalModelDef?.provider || provider;

    try {
      const result = await callProvider(finalProvider, activeModel, msgs);

      await storage.updateUserCredits(userId, user.credits - creditCost);
      await storage.createUsageLog({
        userId, apiKeyId, model: activeModel, provider: finalProvider,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
        creditsUsed: creditCost,
        endpoint: "api",
      });

      return res.json({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        model,
        choices: [{ index: 0, message: { role: "assistant", content: result.content }, finish_reason: "stop" }],
        usage: { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens, total_tokens: result.usage.prompt_tokens + result.usage.completion_tokens },
      });
    } catch (e: any) {
      return res.status(500).json({ error: { message: e.message } });
    }
  });

  // ===== RATE LIMIT STATUS (for users to check their own limits) =====
  app.get("/api/rate-limit/status", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });

    const rule = await storage.getRateLimitRuleForPlan(user.plan);
    const limits = rule || DEFAULT_RATE_LIMITS[user.plan] || DEFAULT_RATE_LIMITS.free;

    const maxPerMin = rule?.maxRequestsPerMinute ?? (limits as any).maxRequestsPerMinute;
    const maxPerHour = rule?.maxRequestsPerHour ?? (limits as any).maxRequestsPerHour;
    const maxPerDay = rule?.maxRequestsPerDay ?? (limits as any).maxRequestsPerDay;
    const maxCreditsDay = rule?.maxCreditsPerDay ?? (limits as any).maxCreditsPerDay;

    const reqsMin = await storage.getUserRequestCount(userId, 1);
    const reqsHour = await storage.getUserRequestCount(userId, 60);
    const reqsDay = await storage.getUserRequestCount(userId, 1440);
    const creditsDay = await storage.getUserCreditsUsedToday(userId);

    return res.json({
      plan: user.plan,
      limits: {
        requestsPerMinute: { used: reqsMin, max: maxPerMin },
        requestsPerHour: { used: reqsHour, max: maxPerHour },
        requestsPerDay: { used: reqsDay, max: maxPerDay },
        creditsPerDay: { used: Math.round(creditsDay * 100) / 100, max: maxCreditsDay },
      },
      cooldownSeconds: rule?.cooldownSeconds ?? (limits as any).cooldownSeconds ?? 0,
    });
  });

  // ===== API KEYS =====
  app.get("/api/keys", authMiddleware, async (req, res) => {
    const keys = await storage.getApiKeys((req as any).userId);
    return res.json(keys.map((k) => ({ ...k, key: undefined })));
  });

  app.post("/api/keys", authMiddleware, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });
    const fullKey = `pxk-${randomUUID().replace(/-/g, "")}`;
    const prefix = fullKey.substring(0, 12);
    const key = await storage.createApiKey((req as any).userId, name, fullKey, prefix);
    return res.json({ ...key, fullKey });
  });

  app.delete("/api/keys/:id", authMiddleware, async (req, res) => {
    await storage.deleteApiKey(parseInt(req.params.id), (req as any).userId);
    return res.json({ message: "Key revoked" });
  });

  // ===== USAGE =====
  app.get("/api/usage", authMiddleware, async (req, res) => {
    return res.json(await storage.getUsageLogs((req as any).userId, 100));
  });

  app.get("/api/usage/stats", authMiddleware, async (req, res) => {
    return res.json(await storage.getUsageStats((req as any).userId));
  });

  // ===== BILLING =====
  app.get("/api/plans", (_req, res) => res.json(PLANS));

  // Public product catalog — used by /buy landing page
  app.get("/api/products", (_req, res) => {
    res.json(Object.values(PRODUCT_CATALOG));
  });

  // Customer: list MY product orders (matched by email)
  app.get("/api/my/orders", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      if (!user?.email) return res.json([]);
      const { sqlite } = await import("./storage");
      const rows = sqlite.prepare(
        `SELECT id, product_sku as productSku, product_name as productName, amount_usd as amountUsd,
                status, notes, created_at as createdAt, paid_at as paidAt
         FROM product_orders WHERE customer_email = ? ORDER BY created_at DESC`
      ).all(user.email);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: impersonate another user (returns a new session token for that user)
  app.post("/api/admin/impersonate", adminMiddleware, async (req, res) => {
    try {
      const { email, userId: targetUserId } = req.body || {};
      let user;
      if (targetUserId) {
        user = await storage.getUser(parseInt(targetUserId));
      } else if (email) {
        user = await storage.getUserByEmail(email);
      }
      if (!user) return res.status(404).json({ message: "User not found" });
      // Don't allow admins to impersonate other admins (security guardrail)
      if (user.role === "admin" && user.id !== (req as any).userId) {
        return res.status(403).json({ message: "Cannot impersonate other admins" });
      }
      const newToken = `imp-${Date.now()}-${Math.random().toString(36).slice(2)}-${user.id}`;
      createSession(newToken, user.id);
      console.log(`[impersonate] admin ${(req as any).userId} -> user ${user.id} (${user.email})`);
      return res.json({
        token: newToken,
        user: { id: user.id, email: user.email, username: user.username, role: user.role, credits: user.credits, plan: user.plan },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: list users available for persona switcher (excludes other admins)
  app.get("/api/admin/personas", adminMiddleware, async (_req, res) => {
    try {
      const { sqlite } = await import("./storage");
      const rows = sqlite.prepare(
        `SELECT id, email, username, role FROM users WHERE role != 'admin' ORDER BY id ASC LIMIT 50`
      ).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: list product orders (paid customers from Stripe Payment Links)
  app.get("/api/admin/orders", adminMiddleware, async (_req, res) => {
    try {
      const { sqlite } = await import("./storage");
      const rows = sqlite.prepare(
        `SELECT id, product_sku as productSku, product_name as productName, amount_usd as amountUsd,
                customer_email as customerEmail, customer_name as customerName,
                stripe_session_id as stripeSessionId, status, notes,
                created_at as createdAt, paid_at as paidAt
         FROM product_orders ORDER BY created_at DESC LIMIT 200`
      ).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Admin: manually create a product order (used for demo seeding + offline sales)
  app.post("/api/admin/orders", adminMiddleware, async (req, res) => {
    try {
      const { productSku, customerEmail, customerName, status, notes } = req.body || {};
      if (!productSku || !customerEmail) {
        return res.status(400).json({ message: "productSku and customerEmail required" });
      }
      const product = (PRODUCT_CATALOG as any)[productSku];
      if (!product) return res.status(400).json({ message: `Unknown product sku: ${productSku}` });
      const { sqlite } = await import("./storage");
      const result = sqlite.prepare(
        `INSERT INTO product_orders
          (product_sku, product_name, amount_usd, customer_email, customer_name, stripe_session_id, status, notes, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        productSku,
        product.name,
        product.priceUsd,
        customerEmail,
        customerName || null,
        `manual-${Date.now()}`,
        status || "paid",
        notes || "Manually created by admin",
        (status || "paid") === "paid" ? new Date().toISOString() : null,
      );
      res.json({ id: result.lastInsertRowid, productSku, customerEmail });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/billing/subscribe", authMiddleware, async (req, res) => {
    const { plan } = req.body;
    const userId = (req as any).userId;
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    if (!PLANS[plan as keyof typeof PLANS]) return res.status(400).json({ message: "Invalid plan" });

    const planConfig = PLANS[plan as keyof typeof PLANS];
    await storage.updateUserPlan(userId, plan);
    await storage.updateUserCredits(userId, user.credits + planConfig.credits);

    const updatedUser = await storage.getUser(userId);
    return res.json({
      message: `Subscribed to ${planConfig.name} plan`,
      user: { id: updatedUser!.id, username: updatedUser!.username, email: updatedUser!.email, credits: updatedUser!.credits, plan: updatedUser!.plan, role: updatedUser!.role },
    });
  });

  // ===== PLATFORM SETTINGS (public) =====
  app.get("/api/settings/margin", async (_req, res) => {
    const multiplier = await storage.getMarginMultiplier();
    return res.json({ multiplier });
  });

  app.get("/api/settings/features", async (_req, res) => {
    const settings = await storage.getAllSettings();
    return res.json({
      smartFollowups: settings.smart_followups_enabled === "true",
      agentTools: settings.agent_tools_enabled === "true",
    });
  });

  // ===== MODELS INFO =====
  app.get("/api/models", async (_req, res) => {
    const providerKeys = await storage.getProviderKeys();
    const activeProviders = new Set(providerKeys.filter((k) => k.isActive).map((k) => k.provider));

    const models = MODELS.map((m) => ({
      ...m,
      available: activeProviders.has(m.provider),
    }));

    return res.json({ models });
  });

  // ===== AGENT TOOLS INFO (merged with REAL_TOOLS) =====
  // Duplicate /api/tools route removed — primary one is above with REAL_TOOLS

  // ===== CALENDAR API =====
  app.get("/api/calendar/events", authMiddleware, async (req, res) => {
    const { region, category, subcategory, start, end } = req.query;
    if (start && end) {
      const regions = region ? [region as string, "global"] : undefined;
      const events = await storage.getCalendarEventsInRange(start as string, end as string, regions);
      return res.json(events);
    }
    const events = await storage.getCalendarEvents({
      region: region as string,
      category: category as string,
      subcategory: subcategory as string,
    });
    return res.json(events);
  });

  app.get("/api/calendar/timeline", authMiddleware, async (req, res) => {
    const { date, start, end, regions, useCase } = req.query;
    const regionList = regions ? (regions as string).split(",") : undefined;
    const dateRange = start && end ? { start: start as string, end: end as string } : undefined;
    const ctx = await buildTimelineContext(date as string, dateRange, regionList);
    const prompt = buildTimelinePrompt(ctx, (useCase as any) || "general");
    return res.json({ context: ctx, prompt });
  });

  // ===== ADMIN CALENDAR =====
  app.get("/api/admin/calendar", adminMiddleware, async (req, res) => {
    const events = await storage.getCalendarEvents();
    return res.json(events);
  });

  app.get("/api/admin/calendar/stats", adminMiddleware, async (_req, res) => {
    const events = await storage.getCalendarEvents();
    const byRegion: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const e of events) {
      byRegion[e.region] = (byRegion[e.region] || 0) + 1;
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }
    return res.json({ total: events.length, byRegion, byCategory });
  });

  app.post("/api/admin/calendar", adminMiddleware, async (req, res) => {
    try {
      const event = await storage.createCalendarEvent(req.body);
      return res.json(event);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/calendar/:id", adminMiddleware, async (req, res) => {
    try {
      const event = await storage.updateCalendarEvent(parseInt(req.params.id), req.body);
      return res.json(event);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/calendar/:id", adminMiddleware, async (req, res) => {
    await storage.deleteCalendarEvent(parseInt(req.params.id));
    return res.json({ message: "Event deleted" });
  });

  // ===== ADMIN ROUTES =====
  app.get("/api/admin/stats", adminMiddleware, async (_req, res) => {
    return res.json(await storage.getAdminStats());
  });

  app.get("/api/admin/users", adminMiddleware, async (req, res) => {
    const search = req.query.search as string | undefined;
    const users = await storage.getAllUsers(search);
    return res.json(users.map((u) => ({ ...u, password: undefined })));
  });

  app.patch("/api/admin/users/:id/credits", adminMiddleware, async (req, res) => {
    const { credits } = req.body;
    if (typeof credits !== "number") return res.status(400).json({ message: "Credits must be a number" });
    await storage.updateUserCredits(parseInt(req.params.id), credits);
    return res.json({ message: "Credits updated" });
  });

  app.patch("/api/admin/users/:id/plan", adminMiddleware, async (req, res) => {
    const { plan } = req.body;
    if (!plan) return res.status(400).json({ message: "Plan is required" });
    await storage.updateUserPlan(parseInt(req.params.id), plan);
    return res.json({ message: "Plan updated" });
  });

  app.patch("/api/admin/users/:id/active", adminMiddleware, async (req, res) => {
    const { isActive } = req.body;
    await storage.updateUserActive(parseInt(req.params.id), !!isActive);
    return res.json({ message: isActive ? "User activated" : "User deactivated" });
  });

  app.patch("/api/admin/users/:id/role", adminMiddleware, async (req, res) => {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) return res.status(400).json({ message: "Invalid role" });
    await storage.updateUserRole(parseInt(req.params.id), role);
    return res.json({ message: "Role updated" });
  });

  app.get("/api/admin/usage", adminMiddleware, async (_req, res) => {
    return res.json(await storage.getRecentUsageLogs(100));
  });

  app.get("/api/admin/usage/by-provider", adminMiddleware, async (_req, res) => {
    return res.json(await storage.getUsageByProvider());
  });

  // ===== ADMIN SETTINGS =====
  app.get("/api/admin/settings", adminMiddleware, async (_req, res) => {
    const settings = await storage.getAllSettings();
    return res.json(settings);
  });

  app.patch("/api/admin/settings", adminMiddleware, async (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ message: "Key and value required" });
    if (key === "margin_multiplier") {
      const num = parseFloat(value);
      if (isNaN(num) || num < 1 || num > 10) {
        return res.status(400).json({ message: "Multiplier must be between 1 and 10" });
      }
    }
    await storage.setSetting(key, String(value));
    return res.json({ message: "Setting updated", key, value: String(value) });
  });

  // ===== ADMIN RATE LIMIT RULES =====
  app.get("/api/admin/rate-limits", adminMiddleware, async (_req, res) => {
    return res.json(await storage.getRateLimitRules());
  });

  app.post("/api/admin/rate-limits", adminMiddleware, async (req, res) => {
    try {
      const rule = await storage.createRateLimitRule(req.body);
      return res.json(rule);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/rate-limits/:id", adminMiddleware, async (req, res) => {
    try {
      const rule = await storage.updateRateLimitRule(parseInt(req.params.id), req.body);
      return res.json(rule);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/rate-limits/:id", adminMiddleware, async (req, res) => {
    await storage.deleteRateLimitRule(parseInt(req.params.id));
    return res.json({ message: "Rule deleted" });
  });

  // ===== ADMIN AI RULES =====
  app.get("/api/admin/rules", adminMiddleware, async (req, res) => {
    const { category, active } = req.query;
    const filters: any = {};
    if (category) filters.category = category as string;
    if (active !== undefined) filters.isActive = active === "true";
    return res.json(await storage.getAiRules(filters));
  });

  app.get("/api/admin/rules/stats", adminMiddleware, async (_req, res) => {
    const allRules = await storage.getAiRules();
    const active = allRules.filter(r => r.isActive).length;
    const byCategory: Record<string, number> = {};
    for (const r of allRules) {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }
    return res.json({ total: allRules.length, active, byCategory });
  });

  app.get("/api/admin/rules/:id", adminMiddleware, async (req, res) => {
    const rule = await storage.getAiRule(parseInt(req.params.id));
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    return res.json(rule);
  });

  app.post("/api/admin/rules", adminMiddleware, async (req, res) => {
    try {
      const rule = await storage.createAiRule(req.body);
      return res.json(rule);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/admin/rules/:id", adminMiddleware, async (req, res) => {
    try {
      const rule = await storage.updateAiRule(parseInt(req.params.id), req.body);
      return res.json(rule);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }
  });

  app.delete("/api/admin/rules/:id", adminMiddleware, async (req, res) => {
    await storage.deleteAiRule(parseInt(req.params.id));
    return res.json({ message: "Rule deleted" });
  });

  // Test/preview a rule against a sample message
  app.post("/api/admin/rules/test", adminMiddleware, async (req, res) => {
    const { message, plan, role, model: testModel, provider: testProvider, tool: testTool } = req.body;
    try {
      const ctx = await buildRequestContext({
        message: message || "test message",
        userPlan: plan || "free",
        userRole: role || "user",
        model: testModel || "sonar",
        provider: testProvider || "perplexity",
        tool: testTool,
        endpoint: "chat",
      });
      const matched = await evaluateRules(ctx);
      return res.json({
        totalRulesChecked: (await storage.getActiveAiRules()).length,
        matchedRules: matched,
        contextSnapshot: {
          season: ctx.season,
          upcomingHolidays: ctx.upcomingHolidays.slice(0, 5),
          date: ctx.currentDate.toISOString(),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Provider key management
  app.get("/api/admin/providers", adminMiddleware, async (_req, res) => {
    const keys = await storage.getProviderKeys();
    return res.json(keys.map((k) => ({ ...k, apiKey: k.apiKey.substring(0, 8) + "..." })));
  });

  app.post("/api/admin/providers", adminMiddleware, async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ message: "Provider and API key required" });
    const key = await storage.setProviderKey(provider, apiKey);
    return res.json({ ...key, apiKey: key.apiKey.substring(0, 8) + "..." });
  });

  app.delete("/api/admin/providers/:provider", adminMiddleware, async (req, res) => {
    await storage.deleteProviderKey(req.params.provider);
    return res.json({ message: "Provider key removed" });
  });

  // ===== ADMIN: USER TIMELINE / STORY ARC =====

  // Get all users who have events
  app.get("/api/admin/timeline/users", adminMiddleware, async (_req, res) => {
    const usersWithEvents = await storage.getAllUsersWithEvents();
    return res.json(usersWithEvents);
  });

  // Get user's event list
  app.get("/api/admin/timeline/:userId/events", adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 100;
    const category = req.query.category as string | undefined;
    
    let events;
    if (category) {
      events = await storage.getUserEventsByCategory(userId, category);
    } else {
      events = await storage.getUserEvents(userId, limit);
    }
    return res.json(events);
  });

  // Get user's story arc (full narrative)
  app.get("/api/admin/timeline/:userId/arc", adminMiddleware, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const arc = await buildUserStoryArc(userId);
      return res.json(arc);
    } catch (e: any) {
      return res.status(404).json({ message: e.message });
    }
  });

  // Get user's event stats
  app.get("/api/admin/timeline/:userId/stats", adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const stats = await storage.getUserEventStats(userId);
    return res.json(stats);
  });

  // === PLATFORM AGENTS ===

  // Admin: Create agent
  app.post("/api/admin/agents", adminMiddleware, async (req, res) => {
    try {
      const { name, description, avatar, capabilities, systemPrompt, ownerEmail, ownerPhone, approvalMode } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      const agent = await storage.createAgent({
        name,
        description: description || "",
        avatar: avatar || "🤖",
        capabilities: JSON.stringify(capabilities || ["create_event", "set_reminder", "set_alarm", "create_task", "crm_query"]),
        systemPrompt: systemPrompt || "",
        ownerEmail: ownerEmail || "",
        ownerPhone: ownerPhone || "",
        approvalMode: approvalMode || "auto",
        isActive: true,
      });
      return res.json(agent);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: List all agents
  app.get("/api/admin/agents", adminMiddleware, async (_req, res) => {
    const agents = await storage.getAllAgents();
    return res.json(agents);
  });

  // Admin: Update agent
  app.patch("/api/admin/agents/:id", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      if (updates.capabilities && Array.isArray(updates.capabilities)) {
        updates.capabilities = JSON.stringify(updates.capabilities);
      }
      const agent = await storage.updateAgent(id, updates);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      return res.json(agent);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: Delete agent
  app.delete("/api/admin/agents/:id", adminMiddleware, async (req, res) => {
    await storage.deleteAgent(parseInt(req.params.id));
    return res.json({ message: "Agent deleted" });
  });

  // Admin: Assign agent to user
  app.post("/api/admin/agents/:id/assign", adminMiddleware, async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId is required" });
      const assignment = await storage.assignAgent(agentId, userId);
      return res.json(assignment);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: Unassign agent from user
  app.post("/api/admin/agents/:id/unassign", adminMiddleware, async (req, res) => {
    try {
      const agentId = parseInt(req.params.id);
      const { userId } = req.body;
      await storage.unassignAgent(agentId, userId);
      return res.json({ message: "Agent unassigned" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: Get agent assignments
  app.get("/api/admin/agents/:id/assignments", adminMiddleware, async (req, res) => {
    const assignments = await storage.getAgentAssignments(parseInt(req.params.id));
    return res.json(assignments);
  });

  // Admin: Get all pending requests
  app.get("/api/admin/agent-requests", adminMiddleware, async (req, res) => {
    const agentId = req.query.agentId ? parseInt(req.query.agentId as string) : undefined;
    const requests = await storage.getPendingRequests(agentId);
    return res.json(requests);
  });

  // Admin: Approve/decline request
  app.post("/api/admin/agent-requests/:id/resolve", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body; // "approved" or "declined"
      const adminId = (req as any).userId;
      if (!status || ![ "approved", "declined" ].includes(status)) {
        return res.status(400).json({ message: "Status must be 'approved' or 'declined'" });
      }
      const request = await storage.resolveAgentRequest(id, status, adminId);
      if (!request) return res.status(404).json({ message: "Request not found" });

      // If approved, create the schedule item
      if (status === "approved") {
        const actionData = JSON.parse(request.actionData);
        await storage.createScheduleItem({
          userId: request.userId,
          agentId: request.agentId,
          requestId: request.id,
          type: actionData.action === "create_event" ? "event" : actionData.action === "create_task" ? "task" : actionData.action === "set_alarm" ? "alarm" : "reminder",
          title: actionData.title || "Untitled",
          date: actionData.date || actionData.dueDate || new Date().toISOString().split("T")[0],
          time: actionData.time || actionData.dueTime,
          endTime: actionData.endTime,
          location: actionData.location,
          notes: actionData.notes,
          reminderMinutes: actionData.reminderMinutes || actionData.reminder || 60,
          priority: actionData.priority || "medium",
          status: "active",
          conversationId: request.conversationId,
        });
      }
      return res.json(request);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // User: Get my assigned agents
  app.get("/api/agents", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const agents = await storage.getUserAgents(userId);
    return res.json(agents);
  });

  // User: Chat with agent (processes message through agent, extracts actions)
  app.post("/api/agents/:id/chat", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const agentId = parseInt(req.params.id);
      const { message, conversationId, model = "sonar" } = req.body;

      // Verify user has access to this agent
      const userAgents = await storage.getUserAgents(userId);
      const agent = userAgents.find(a => a.id === agentId);
      if (!agent) return res.status(403).json({ message: "You don't have access to this agent" });

      // Build agent prompt and call AI
      const agentPrompt = buildAgentChatPrompt(agent);
      const result = await callProvider("perplexity", model, [
        { role: "system", content: agentPrompt },
        { role: "user", content: message },
      ]);

      // Parse response for action JSON blocks
      const content = result.content;
      const jsonBlocks: any[] = [];
      const jsonRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
      let match;
      while ((match = jsonRegex.exec(content)) !== null) {
        try {
          jsonBlocks.push(JSON.parse(match[1]));
        } catch {}
      }

      // Process extracted actions
      const actions: any[] = [];
      let crmQueryContext = "";
      for (const block of jsonBlocks) {
        // Handle crm_query capability directly — no schedule item, just data retrieval
        if (block.action === "crm_query") {
          try {
            const connections = storage.getCrmConnections();
            const conn = connections.find(c => c.isActive) || connections[0];
            if (!conn) {
              actions.push({ ...block, status: "no_crm_connection", result: "No CRM connection configured." });
              crmQueryContext += "\n[CRM] No active CRM connection found.\n";
            } else {
              const entity = (block.entity || "").toLowerCase();
              const filters = block.filters || {};
              let crmData: any[] | object = [];
              let label = "";
              switch (entity) {
                case "customers":
                  crmData = storage.getCrmCustomers(conn.id, filters);
                  label = "Customers";
                  break;
                case "leads":
                  crmData = storage.getCrmLeads(conn.id, filters);
                  label = "Leads";
                  break;
                case "invoices":
                  crmData = storage.getCrmInvoices(conn.id, filters);
                  label = "Invoices";
                  break;
                case "projects":
                  crmData = storage.getCrmProjects(conn.id, filters);
                  label = "Projects";
                  break;
                case "tasks":
                  crmData = storage.getCrmTasks(conn.id, filters);
                  label = "Tasks";
                  break;
                case "tickets":
                  crmData = storage.getCrmTickets(conn.id, filters);
                  label = "Tickets";
                  break;
                case "dashboard":
                default:
                  crmData = storage.getCrmDashboardStats(conn.id);
                  label = "Dashboard";
                  break;
              }
              actions.push({ ...block, status: "crm_data_fetched", entity, result: crmData });
              const preview = Array.isArray(crmData)
                ? `${(crmData as any[]).length} ${label} records retrieved.`
                : JSON.stringify(crmData, null, 2);
              crmQueryContext += `\n[CRM ${label}]\n${preview}\n`;
            }
          } catch (crmErr: any) {
            actions.push({ ...block, status: "crm_error", error: crmErr.message });
            crmQueryContext += `\n[CRM Error] ${crmErr.message}\n`;
          }
          continue;
        }

        // Handle project_query — retrieve project data scoped to user's projects
        if (block.action === "project_query") {
          try {
            const scope = (block.scope || "projects").toLowerCase();
            const filters = block.filters || {};
            let projectData: any[] | object = [];
            let label = "";

            switch (scope) {
              case "projects": {
                projectData = storage.listProjects({ memberId: userId, ...filters });
                label = "Projects";
                break;
              }
              case "members": {
                const projId = filters.projectId;
                if (projId && storage.isUserInProject(projId, userId)) {
                  projectData = storage.listProjectMembers(projId);
                } else {
                  projectData = [];
                }
                label = "Members";
                break;
              }
              case "assignments": {
                // Only return assignments for projects the user is in
                const userProjects = storage.listProjects({ memberId: userId });
                const userProjectIds = userProjects.map(p => p.id);
                const rawAssignments = storage.listAssignments(filters);
                projectData = rawAssignments.filter((a: any) => userProjectIds.includes(a.projectId));
                label = "Assignments";
                break;
              }
              case "messages": {
                const projId = filters.projectId;
                if (projId && storage.isUserInProject(projId, userId)) {
                  projectData = storage.listProjectMessages(projId, filters.limit || 20);
                } else {
                  projectData = [];
                }
                label = "Messages";
                break;
              }
              default: {
                // Return summary of user's projects
                const userProjects = storage.listProjects({ memberId: userId });
                projectData = {
                  projectCount: userProjects.length,
                  projects: userProjects.slice(0, 5).map(p => ({ id: p.id, name: p.name, status: p.status })),
                };
                label = "Summary";
              }
            }

            actions.push({ ...block, status: "project_data_fetched", scope, result: projectData });
            const preview = Array.isArray(projectData)
              ? `${(projectData as any[]).length} ${label} records retrieved.`
              : JSON.stringify(projectData, null, 2);
            crmQueryContext += `\n[Project ${label}]\n${preview}\n`;
          } catch (projErr: any) {
            actions.push({ ...block, status: "project_error", error: projErr.message });
            crmQueryContext += `\n[Project Error] ${projErr.message}\n`;
          }
          continue;
        }

        // Handle create_assignment — create a project assignment (manager/owner only)
        if (block.action === "create_assignment") {
          try {
            const projectId = block.projectId;
            if (!projectId) throw new Error("projectId is required for create_assignment");
            if (!storage.isUserInProject(projectId, userId)) throw new Error("You are not a member of this project");
            const members = storage.listProjectMembers(projectId);
            const userMember = members.find(m => m.userId === userId);
            if (!userMember || (userMember.role !== "owner" && userMember.role !== "manager")) {
              throw new Error("Only project owners and managers can create assignments");
            }
            const assignment = storage.createAssignment({
              projectId,
              assignedTo: block.assignedTo || userId,
              createdBy: userId,
              title: block.title || "Untitled Task",
              description: block.description,
              type: block.type || "one_time",
              dueAt: block.dueAt,
              cronExpression: block.cronExpression,
              cronTimezone: block.cronTimezone || "Asia/Jerusalem",
              status: "pending",
              priority: block.priority || "medium",
              reminderMinutes: block.reminderMinutes || 30,
            });
            actions.push({ ...block, status: "assignment_created", result: assignment });
            crmQueryContext += `\n[Project] Assignment created: "${assignment.title}" (id: ${assignment.id})\n`;
          } catch (assignErr: any) {
            actions.push({ ...block, status: "assignment_error", error: assignErr.message });
            crmQueryContext += `\n[Project Error] ${assignErr.message}\n`;
          }
          continue;
        }

        // Handle project_message — post a message to a project chat
        if (block.action === "project_message") {
          try {
            const projectId = block.projectId;
            if (!projectId) throw new Error("projectId is required for project_message");
            if (!storage.isUserInProject(projectId, userId)) throw new Error("You are not a member of this project");
            const msgContent = block.content || block.message || "";
            if (!msgContent) throw new Error("content is required for project_message");
            const msg = storage.createProjectMessage({
              projectId,
              userId,
              role: "user",
              content: msgContent,
              source: "ai",
            });
            actions.push({ ...block, status: "message_posted", result: { id: msg.id } });
            crmQueryContext += `\n[Project] Message posted to project ${projectId}: "${msgContent.slice(0, 80)}..."\n`;
          } catch (msgErr: any) {
            actions.push({ ...block, status: "project_message_error", error: msgErr.message });
            crmQueryContext += `\n[Project Error] ${msgErr.message}\n`;
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Part VII — Web tools: web_search, fetch_page
        // ---------------------------------------------------------------
        if (block.action === "web_search") {
          try {
            const query = (block.query || block.q || "").toString().trim();
            if (!query) throw new Error("query is required for web_search");
            const limit = Math.min(Math.max(parseInt(block.limit, 10) || 8, 1), 15);
            const results = await webSearch(query, limit);
            actions.push({ ...block, status: "search_completed", result: results });
            const preview = results.length
              ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n")
              : "(no results)";
            crmQueryContext += `\n[Web Search: ${query}]\n${preview}\n`;
          } catch (wErr: any) {
            actions.push({ ...block, status: "web_search_error", error: wErr.message });
            crmQueryContext += `\n[Web Search Error] ${wErr.message}\n`;
          }
          continue;
        }

        if (block.action === "fetch_page") {
          try {
            const url = (block.url || "").toString().trim();
            if (!url) throw new Error("url is required for fetch_page");
            const page = await fetchPage(url);
            actions.push({ ...block, status: "page_fetched", result: { url: page.url, title: page.title, status: page.status, truncated: page.truncated } });
            const preview = `${page.title || "(untitled)"} — ${page.url}\n${page.text.slice(0, 4000)}${page.truncated ? "\n…" : ""}`;
            crmQueryContext += `\n[Fetch Page]\n${preview}\n`;
          } catch (fErr: any) {
            actions.push({ ...block, status: "fetch_page_error", error: fErr.message });
            crmQueryContext += `\n[Fetch Page Error] ${fErr.message}\n`;
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Part VIII — Managed sessions: read_session_page, propose_action
        // ---------------------------------------------------------------
        if (block.action === "read_session_page") {
          try {
            const sessionId = parseInt(block.sessionId, 10);
            if (!sessionId) throw new Error("sessionId is required for read_session_page");
            const session = storage.getManagedSession(sessionId);
            if (!session) throw new Error(`Managed session ${sessionId} not found`);
            if (session.userId !== userId) throw new Error("You do not own this managed session");
            if (session.status !== "active") throw new Error(`Session is ${session.status}`);
            const runtime = getRuntime(session.runtime);
            const page = await runtime.readPage(session, { url: block.url });
            storage.touchSessionLastUsed(sessionId);
            actions.push({ ...block, status: "session_page_read", result: { title: page.title, url: page.url, stateHash: page.stateHash } });
            crmQueryContext += `\n[Session ${sessionId} — ${session.site}] ${page.title}\n${page.url}\n${page.visibleText.slice(0, 3000)}\n`;
          } catch (rErr: any) {
            actions.push({ ...block, status: "read_session_page_error", error: rErr.message });
            crmQueryContext += `\n[Session Read Error] ${rErr.message}\n`;
          }
          continue;
        }

        if (block.action === "propose_action") {
          try {
            const sessionId = parseInt(block.sessionId, 10);
            if (!sessionId) throw new Error("sessionId is required for propose_action");
            const session = storage.getManagedSession(sessionId);
            if (!session) throw new Error(`Managed session ${sessionId} not found`);
            if (session.userId !== userId) throw new Error("You do not own this managed session");
            const actionType = (block.actionType || block.type || "").toString();
            if (!actionType) throw new Error("actionType is required for propose_action");
            const payload = block.payload ?? {};
            const reasoning = (block.reasoning || "").toString();
            const pageStateHash = block.pageStateHash ? block.pageStateHash.toString() : null;
            const pending = storage.createPendingAction({
              sessionId,
              actionType,
              payload: typeof payload === "string" ? payload : JSON.stringify(payload),
              reasoning,
              pageStateHash,
              screenshotUrl: block.screenshotUrl || null,
              status: "pending",
              createdBy: "johnny",
              expiresAt: block.expiresAt || null,
            });
            // Audit: action proposed.
            storage.recordAuditEvent({
              actionId: pending.id,
              event: "created",
              beforeStateHash: pageStateHash,
              afterStateHash: null,
              runtimeResponse: null,
            });
            // Fire-and-forget: send Telegram approval card to the session owner.
            // We don't await — failure to deliver shouldn't block Johnny's reply.
            sendApprovalCard(userId, session, pending).catch((err: any) => {
              console.error("[propose_action] approval card send failed", err?.message);
            });
            actions.push({ ...block, status: "action_proposed", result: { id: pending.id } });
            crmQueryContext += `\n[Pending Action ${pending.id}] ${actionType} on session ${sessionId} — awaiting approval.\n`;
          } catch (pErr: any) {
            actions.push({ ...block, status: "propose_action_error", error: pErr.message });
            crmQueryContext += `\n[Propose Action Error] ${pErr.message}\n`;
          }
          continue;
        }

        if (agent.approvalMode === "auto") {
          // Auto-approve: create schedule item immediately
          const request = await storage.createAgentRequest({
            agentId,
            userId,
            conversationId,
            actionType: block.action,
            actionData: JSON.stringify(block),
            status: "auto_approved",
          });
          const item = await storage.createScheduleItem({
            userId,
            agentId,
            requestId: request.id,
            type: block.action === "create_event" ? "event" : block.action === "create_task" ? "task" : block.action === "set_alarm" ? "alarm" : "reminder",
            title: block.title || "Untitled",
            date: block.date || block.dueDate || new Date().toISOString().split("T")[0],
            time: block.time || block.dueTime,
            endTime: block.endTime,
            location: block.location,
            notes: block.notes,
            reminderMinutes: block.reminderMinutes || block.reminder || 60,
            priority: block.priority || "medium",
            status: "active",
            conversationId,
          });
          actions.push({ ...block, status: "created", itemId: item.id, requestId: request.id });
        } else {
          // Request mode: create pending request
          const request = await storage.createAgentRequest({
            agentId,
            userId,
            conversationId,
            actionType: block.action,
            actionData: JSON.stringify(block),
            status: "pending",
          });
          actions.push({ ...block, status: "pending_approval", requestId: request.id });
        }
      }

      // Clean response text (remove JSON blocks for display)
      const cleanContent = content.replace(/```json\s*\n?[\s\S]*?\n?```/g, "").trim();

      // Notify agent owner via Telegram (non-blocking)
      const user = await storage.getUser(userId);
      notifyOwnerFromWeb(agentId, user?.username || "User", message, actions).catch(() => {});

      return res.json({
        content: cleanContent,
        actions,
        agentName: agent.name,
        agentAvatar: agent.avatar,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // User: Get my schedule
  app.get("/api/schedule", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const fromDate = req.query.from as string | undefined;
    const items = await storage.getUserSchedule(userId, fromDate);
    return res.json(items);
  });

  // User: Update schedule item (complete/dismiss)
  app.patch("/api/schedule/:id", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const item = await storage.updateScheduleItem(id, { status });
      if (!item) return res.status(404).json({ message: "Item not found" });
      return res.json(item);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // User: Delete schedule item
  app.delete("/api/schedule/:id", authMiddleware, async (req, res) => {
    await storage.deleteScheduleItem(parseInt(req.params.id));
    return res.json({ message: "Deleted" });
  });

  // === MEDIA GENERATION ===

  // Image generation via OpenAI DALL-E 3
  app.post("/api/generate/image", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { prompt, size = "1024x1024", quality = "standard", conversationId } = req.body;
      if (!prompt) return res.status(400).json({ message: "Prompt is required" });

      const settings = await storage.getAllSettings();
      const marginMultiplier = parseFloat(settings.profit_margin_multiplier || "2");
      const costKey = quality === "hd" ? "image-hd" : "image-standard";
      const baseCost = MEDIA_COSTS[costKey];
      const totalCost = applyMargin(baseCost, marginMultiplier);

      if (user.credits < totalCost) {
        return res.status(402).json({ message: `Not enough credits. Need ${totalCost}, have ${user.credits}` });
      }

      const openaiKey = await storage.getProviderKey("openai");
      if (!openaiKey?.apiKey) {
        return res.status(400).json({ message: "OpenAI API key not configured. Set it in Admin > Providers." });
      }

      const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: ["1024x1024", "1792x1024", "1024x1792"].includes(size) ? size : "1024x1024",
          quality: quality === "hd" ? "hd" : "standard",
          response_format: "url",
        }),
      });

      if (!dalleRes.ok) {
        const err = await dalleRes.text();
        return res.status(500).json({ message: `Image generation failed: ${err}` });
      }

      const dalleData = await dalleRes.json();
      const imageUrl = dalleData.data?.[0]?.url;
      const revisedPrompt = dalleData.data?.[0]?.revised_prompt;

      if (!imageUrl) {
        return res.status(500).json({ message: "No image returned from API" });
      }

      // Download and store the image locally
      const imgResponse = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
      const filename = `gen_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const fs = await import("fs");
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), imgBuffer);

      // Deduct credits
      await storage.updateUserCredits(userId, user.credits - totalCost);

      // Log usage
      await storage.createUsageLog({
        userId,
        model: "dall-e-3",
        provider: "openai",
        inputTokens: 0,
        outputTokens: 0,
        creditsUsed: totalCost,
        endpoint: "generate/image",
      });

      // Save as assistant message in conversation if provided
      if (conversationId) {
        await storage.createMessage(conversationId, "user", `🎨 Generate image: ${prompt}`);
        await storage.createMessage(
          conversationId, "assistant",
          `![Generated Image](/api/uploads/${filename})\n\n${revisedPrompt ? `*${revisedPrompt}*` : ""}`,
          "dall-e-3", "openai", totalCost
        );
      }

      return res.json({
        url: `/api/uploads/${filename}`,
        revisedPrompt,
        cost: totalCost,
        size,
        quality,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Document generation via AI
  app.post("/api/generate/document", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { prompt, format = "markdown", title, conversationId } = req.body;
      if (!prompt) return res.status(400).json({ message: "Prompt is required" });

      const settings = await storage.getAllSettings();
      const marginMultiplier = parseFloat(settings.profit_margin_multiplier || "2");
      const baseCost = MEDIA_COSTS["document-pdf"];
      const totalCost = applyMargin(baseCost, marginMultiplier);

      if (user.credits < totalCost) {
        return res.status(402).json({ message: `Not enough credits. Need ${totalCost}, have ${user.credits}` });
      }

      // Use the best available model to generate the document
      const docPrompt = `You are a professional document writer. Generate a well-structured ${format === "html" ? "HTML" : "Markdown"} document based on the following request. Include proper headings, sections, and formatting. Be thorough and professional.\n\nTitle: ${title || "Document"}\nRequest: ${prompt}\n\n${format === "html" ? "Generate valid HTML with inline CSS styling for a professional look. Wrap in a complete HTML document with proper head/body tags, a clean sans-serif font, and good spacing." : "Generate well-formatted Markdown with proper headings, lists, and sections."}`;

      const result = await callProvider("openai", "gpt-4o", [
        { role: "system", content: docPrompt },
        { role: "user", content: prompt },
      ]);

      const docContent = result.content;
      const ext = format === "html" ? "html" : "md";
      const filename = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const fs = await import("fs");
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), docContent);

      // Deduct credits
      await storage.updateUserCredits(userId, user.credits - totalCost);

      await storage.createUsageLog({
        userId,
        model: "gpt-4o",
        provider: "openai",
        inputTokens: result.usage?.prompt_tokens || 0,
        outputTokens: result.usage?.completion_tokens || 0,
        creditsUsed: totalCost,
        endpoint: "generate/document",
      });

      // Save to conversation if provided
      if (conversationId) {
        await storage.createMessage(conversationId, "user", `📄 Generate document: ${prompt}`);
        await storage.createMessage(
          conversationId, "assistant",
          `Document generated: **${title || "Document"}** ([Download](/api/uploads/${filename}))\n\n${docContent.substring(0, 500)}${docContent.length > 500 ? "..." : ""}`,
          "gpt-4o", "openai", totalCost
        );
      }

      return res.json({
        url: `/api/uploads/${filename}`,
        filename,
        format,
        cost: totalCost,
        preview: docContent.substring(0, 200),
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Video generation (placeholder — future integration)
  app.post("/api/generate/video", authMiddleware, async (_req, res) => {
    return res.status(501).json({
      message: "Video generation coming soon. We're integrating with leading video AI providers.",
      status: "coming_soon",
    });
  });

  // Get media generation pricing
  app.get("/api/generate/pricing", async (_req, res) => {
    const settings = await storage.getAllSettings();
    const marginMultiplier = parseFloat(settings.profit_margin_multiplier || "2");
    return res.json({
      image: {
        standard: applyMargin(MEDIA_COSTS["image-standard"], marginMultiplier),
        hd: applyMargin(MEDIA_COSTS["image-hd"], marginMultiplier),
      },
      document: {
        pdf: applyMargin(MEDIA_COSTS["document-pdf"], marginMultiplier),
        docx: applyMargin(MEDIA_COSTS["document-docx"], marginMultiplier),
      },
      video: { status: "coming_soon", cost: 0 },
    });
  });

  // === HEALTH CHECK ===
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // === RAILWAY DEPLOYMENT MANAGEMENT ===

  // Get deployment settings
  app.get("/api/admin/deploy/settings", adminMiddleware, async (_req, res) => {
    const keys = ["railway_api_token", "railway_project_id", "railway_service_id", "railway_environment_id", "railway_custom_domain"];
    const settings: Record<string, string> = {};
    for (const key of keys) {
      const s = await storage.getSetting(key);
      // Mask the token for security
      if (key === "railway_api_token" && s) {
        settings[key] = s.length > 8 ? "****" + s.slice(-4) : "****";
      } else {
        settings[key] = s || "";
      }
    }
    return res.json(settings);
  });

  // Save deployment settings
  app.put("/api/admin/deploy/settings", adminMiddleware, async (req, res) => {
    const { railway_api_token, railway_project_id, railway_service_id, railway_environment_id, railway_custom_domain } = req.body;
    if (railway_api_token && !railway_api_token.startsWith("****")) {
      await storage.setSetting("railway_api_token", railway_api_token);
    }
    if (railway_project_id !== undefined) await storage.setSetting("railway_project_id", railway_project_id);
    if (railway_service_id !== undefined) await storage.setSetting("railway_service_id", railway_service_id);
    if (railway_environment_id !== undefined) await storage.setSetting("railway_environment_id", railway_environment_id);
    if (railway_custom_domain !== undefined) await storage.setSetting("railway_custom_domain", railway_custom_domain);
    return res.json({ success: true });
  });

  // Proxy Railway GraphQL API
  app.post("/api/admin/deploy/railway", adminMiddleware, async (req, res) => {
    const token = await storage.getSetting("railway_api_token");
    if (!token) {
      return res.status(400).json({ message: "Railway API token not configured" });
    }
    try {
      const response = await fetch("https://backboard.railway.app/graphql/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Trigger a redeploy
  app.post("/api/admin/deploy/redeploy", adminMiddleware, async (_req, res) => {
    const token = await storage.getSetting("railway_api_token");
    const serviceId = await storage.getSetting("railway_service_id");
    const environmentId = await storage.getSetting("railway_environment_id");
    if (!token || !serviceId) {
      return res.status(400).json({ message: "Railway settings not fully configured" });
    }
    try {
      const query = `mutation { serviceInstanceRedeploy(serviceId: "${serviceId}"${environmentId ? `, environmentId: "${environmentId}"` : ""}) }`;
      const response = await fetch("https://backboard.railway.app/graphql/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // === TELEGRAM BOT RELAY ===

  // Inject callProvider into telegram module
  setCallProvider(callProvider);

  // Initialize webhooks for active bots on startup
  const PORT = process.env.PORT || "5000";
  const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
  initTelegramBots(BASE_URL);

  // Telegram webhook endpoint (no auth — verified by secret token)
  app.post("/api/telegram/webhook/:botId", async (req, res) => {
    try {
      const botId = parseInt(req.params.botId);
      const bot = await storage.getTelegramBotById(botId);
      if (!bot || !bot.isActive) return res.status(404).json({ ok: false });

      // Verify secret token if set
      if (bot.webhookSecret) {
        const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
        if (headerSecret !== bot.webhookSecret) {
          return res.status(403).json({ ok: false });
        }
      }

      // Get the agent
      const agent = await storage.getAgent(bot.agentId);
      if (!agent) return res.status(404).json({ ok: false });

      // Process update in background (Telegram expects quick 200)
      res.json({ ok: true });
      handleTelegramUpdate(bot, agent, req.body).catch(e => console.error("Telegram update error:", e.message));
    } catch (e: any) {
      console.error("Telegram webhook error:", e.message);
      return res.status(500).json({ ok: false });
    }
  });

  // Admin: List Telegram bots
  app.get("/api/admin/telegram/bots", adminMiddleware, async (_req, res) => {
    const bots = await storage.getTelegramBots();
    return res.json(bots);
  });

  // Admin: Create Telegram bot config
  app.post("/api/admin/telegram/bots", adminMiddleware, async (req, res) => {
    try {
      const { agentId, botToken } = req.body;
      if (!agentId || !botToken) return res.status(400).json({ message: "agentId and botToken required" });

      // Verify bot token with Telegram API
      const botInfo = await getTelegramBotInfo(botToken);
      if (!botInfo.ok) return res.status(400).json({ message: "Invalid bot token: " + (botInfo.description || "check token") });

      const webhookSecret = randomUUID();
      const bot = await storage.createTelegramBot({
        agentId,
        botToken,
        botUsername: botInfo.result?.username || null,
        webhookSecret,
        isActive: true,
      });

      // Set webhook
      const webhookUrl = `${BASE_URL}/api/telegram/webhook/${bot.id}`;
      const whResult = await setTelegramWebhook(botToken, webhookUrl, webhookSecret);

      return res.json({ ...bot, webhookSet: whResult.ok, botInfo: botInfo.result });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: Update Telegram bot
  app.patch("/api/admin/telegram/bots/:id", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateTelegramBot(id, req.body);
      if (!updated) return res.status(404).json({ message: "Bot not found" });

      // Re-set webhook if token changed or bot was activated
      if (req.body.botToken || req.body.isActive) {
        const bot = updated;
        if (bot.isActive) {
          const webhookUrl = `${BASE_URL}/api/telegram/webhook/${bot.id}`;
          await setTelegramWebhook(bot.botToken, webhookUrl, bot.webhookSecret || undefined);
        }
      }

      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Admin: Delete Telegram bot
  app.delete("/api/admin/telegram/bots/:id", adminMiddleware, async (req, res) => {
    const id = parseInt(req.params.id);
    const bot = await storage.getTelegramBotById(id);
    if (bot) {
      // Remove webhook
      await setTelegramWebhook(bot.botToken, "");
    }
    await storage.deleteTelegramBot(id);
    return res.json({ message: "Deleted" });
  });

  // Admin: Get relay messages for a bot
  app.get("/api/admin/telegram/bots/:id/messages", adminMiddleware, async (req, res) => {
    const botId = parseInt(req.params.id);
    const messages = await storage.getRelayMessages(botId, 100);
    return res.json(messages);
  });

  // Admin: Get telegram links for a bot
  app.get("/api/admin/telegram/bots/:id/links", adminMiddleware, async (req, res) => {
    const botId = parseInt(req.params.id);
    const links = await storage.getTelegramLinksByBot(botId);
    return res.json(links);
  });

  // Admin: Send test message via Telegram
  app.post("/api/admin/telegram/bots/:id/test", adminMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const bot = await storage.getTelegramBotById(id);
      if (!bot) return res.status(404).json({ message: "Bot not found" });
      if (!bot.ownerTelegramChatId) return res.status(400).json({ message: "No owner chat ID. Send /start to the bot first." });

      const { message: msg } = req.body;
      await sendTelegramMessage(bot.botToken, bot.ownerTelegramChatId, msg || "🔔 Test message from Tendit!");
      return res.json({ message: "Sent" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // ===== CRM Integration Routes =====

  // Webhook endpoint (called by PerfexCRM module)
  app.post("/api/crm/webhook", async (req, res) => {
    const secret = req.headers["x-webhook-secret"] as string;
    const { event, data, connectionId } = req.body;
    if (!secret) return res.status(401).json({ error: "Missing webhook secret" });

    // Find connection by webhook secret
    const connections = storage.getCrmConnections();
    const conn = connections.find(c => c.webhookSecret === secret);
    if (!conn) return res.status(401).json({ error: "Invalid webhook secret" });

    const [entity] = event.split(".");
    try {
      switch (entity) {
        case "customer": storage.upsertCrmCustomers(conn.id, [data]); break;
        case "lead": storage.upsertCrmLeads(conn.id, [data]); break;
        case "invoice": storage.upsertCrmInvoices(conn.id, [data]); break;
        case "project": storage.upsertCrmProjects(conn.id, [data]); break;
        case "task": storage.upsertCrmTasks(conn.id, [data]); break;
        case "ticket": storage.upsertCrmTickets(conn.id, [data]); break;
      }
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Batch sync endpoint (called by PerfexCRM full sync)
  app.post("/api/crm/sync/:type", async (req, res) => {
    const secret = req.headers["x-webhook-secret"] as string;
    if (!secret) return res.status(401).json({ error: "Missing secret" });
    const connections = storage.getCrmConnections();
    const conn = connections.find(c => c.webhookSecret === secret);
    if (!conn) return res.status(401).json({ error: "Invalid secret" });

    const { type } = req.params;
    const { data } = req.body; // array of entities
    if (!Array.isArray(data)) return res.status(400).json({ error: "data must be an array" });

    let count = 0;
    switch (type) {
      case "customers": count = storage.upsertCrmCustomers(conn.id, data); break;
      case "leads": count = storage.upsertCrmLeads(conn.id, data); break;
      case "invoices": count = storage.upsertCrmInvoices(conn.id, data); break;
      case "projects": count = storage.upsertCrmProjects(conn.id, data); break;
      case "tasks": count = storage.upsertCrmTasks(conn.id, data); break;
      case "tickets": count = storage.upsertCrmTickets(conn.id, data); break;
      default: return res.status(400).json({ error: "Unknown entity type" });
    }
    storage.updateCrmConnection(conn.id, { lastSyncAt: new Date().toISOString() });
    return res.json({ ok: true, synced: count });
  });

  // Connection status endpoint
  app.get("/api/crm/status", async (req, res) => {
    const secret = (req.headers["x-webhook-secret"] as string) || (req.headers["x-crm-api-key"] as string);
    if (!secret) return res.status(401).json({ error: "Missing secret" });
    const connections = storage.getCrmConnections();
    const conn = connections.find(c => c.webhookSecret === secret || c.apiKey === secret);
    if (!conn) return res.status(401).json({ error: "Invalid secret" });
    return res.json({ ok: true, connected: true, name: conn.name, lastSync: conn.lastSyncAt });
  });

  // Admin CRM management routes
  app.get("/api/admin/crm/connections", adminMiddleware, async (_req, res) => {
    return res.json(storage.getCrmConnections());
  });

  app.post("/api/admin/crm/connections", adminMiddleware, async (req, res) => {
    const { name, type, apiUrl, apiKey } = req.body;
    if (!name || !apiUrl || !apiKey) return res.status(400).json({ error: "name, apiUrl, apiKey required" });
    const crypto = await import("crypto");
    const webhookSecret = crypto.randomBytes(32).toString("hex");
    const conn = storage.createCrmConnection({ name, type: type || "perfex", apiUrl, apiKey, webhookSecret, isActive: true });
    return res.json(conn);
  });

  app.patch("/api/admin/crm/connections/:id", adminMiddleware, async (req, res) => {
    const conn = storage.updateCrmConnection(parseInt(req.params.id), req.body);
    if (!conn) return res.status(404).json({ error: "Connection not found" });
    return res.json(conn);
  });

  app.delete("/api/admin/crm/connections/:id", adminMiddleware, async (req, res) => {
    storage.deleteCrmConnection(parseInt(req.params.id));
    return res.json({ ok: true });
  });

  // Frontend-compatible CRM aliases
  app.get("/api/admin/crm/connection", adminMiddleware, async (_req, res) => {
    const connections = storage.getCrmConnections();
    return res.json(connections.length > 0 ? connections[0] : null);
  });

  app.post("/api/admin/crm/connect", adminMiddleware, async (req, res) => {
    const { name, crmUrl, apiKey } = req.body;
    if (!crmUrl || !apiKey) return res.status(400).json({ error: "crmUrl and apiKey required" });
    const crypto = await import("crypto");
    const webhookSecret = crypto.randomBytes(32).toString("hex");
    const conn = storage.createCrmConnection({
      name: name || "PerfexCRM",
      type: "perfex",
      apiUrl: crmUrl,
      apiKey,
      webhookSecret,
      isActive: true,
    });
    return res.json(conn);
  });

  app.delete("/api/admin/crm/:connectionId/disconnect", adminMiddleware, async (req, res) => {
    storage.deleteCrmConnection(parseInt(req.params.connectionId));
    return res.json({ ok: true });
  });

  app.post("/api/admin/crm/:connectionId/sync", adminMiddleware, async (req, res) => {
    // Trigger sync — for now just update lastSyncAt; actual pull from CRM happens via webhooks
    const conn = storage.updateCrmConnection(parseInt(req.params.connectionId), { lastSyncAt: new Date().toISOString() });
    if (!conn) return res.status(404).json({ error: "Connection not found" });
    return res.json({ ok: true, lastSync: conn.lastSyncAt });
  });

  // CRM data query routes
  app.get("/api/admin/crm/:connectionId/dashboard", adminMiddleware, async (req, res) => {
    const stats = storage.getCrmDashboardStats(parseInt(req.params.connectionId));
    return res.json(stats);
  });

  app.get("/api/admin/crm/:connectionId/customers", adminMiddleware, async (req, res) => {
    const { search, status } = req.query;
    return res.json(storage.getCrmCustomers(parseInt(req.params.connectionId), { search: search as string, status: status as string }));
  });

  app.get("/api/admin/crm/:connectionId/leads", adminMiddleware, async (req, res) => {
    const { search, status } = req.query;
    return res.json(storage.getCrmLeads(parseInt(req.params.connectionId), { search: search as string, status: status as string }));
  });

  app.get("/api/admin/crm/:connectionId/invoices", adminMiddleware, async (req, res) => {
    const { status, overdue } = req.query;
    return res.json(storage.getCrmInvoices(parseInt(req.params.connectionId), { status: status as string, overdue: overdue === "true" }));
  });

  app.get("/api/admin/crm/:connectionId/projects", adminMiddleware, async (req, res) => {
    const { status } = req.query;
    return res.json(storage.getCrmProjects(parseInt(req.params.connectionId), { status: status as string }));
  });

  app.get("/api/admin/crm/:connectionId/tasks", adminMiddleware, async (req, res) => {
    const { status, assignedTo } = req.query;
    return res.json(storage.getCrmTasks(parseInt(req.params.connectionId), { status: status as string, assignedTo: assignedTo as string }));
  });

  app.get("/api/admin/crm/:connectionId/tickets", adminMiddleware, async (req, res) => {
    const { status, priority } = req.query;
    return res.json(storage.getCrmTickets(parseInt(req.params.connectionId), { status: status as string, priority: priority as string }));
  });

  // ===== PROJECT MANAGEMENT ROUTES =====

  // Helper: get project member role for a user (returns null if not a member)
  async function getProjectRole(projectId: number, userId: number): Promise<string | null> {
    const members = storage.listProjectMembers(projectId);
    const m = members.find(m => m.userId === userId);
    return m ? m.role : null;
  }

  // Helper: check if user can manage a project (owner/manager/admin)
  async function canManageProject(projectId: number, userId: number): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (user?.role === "admin") return true;
    const project = storage.getProject(projectId);
    if (!project) return false;
    if (project.ownerId === userId) return true;
    const role = await getProjectRole(projectId, userId);
    return role === "owner" || role === "manager";
  }

  // --- Projects ---

  // GET /api/projects — list projects the user is a member of (or all if admin)
  app.get("/api/projects", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await storage.getUser(userId);
      const { status, search } = req.query;
      let projects;
      if (user?.role === "admin") {
        projects = storage.listProjects({
          status: status as string | undefined,
          search: search as string | undefined,
        });
      } else {
        projects = storage.listProjects({
          memberId: userId,
          status: status as string | undefined,
          search: search as string | undefined,
        });
      }
      return res.json(projects);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // GET /api/projects/:id — get project with members + counts
  app.get("/api/projects/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const user = await storage.getUser(userId);
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }
      const members = storage.listProjectMembers(projectId);
      const assignments = storage.listAssignments({ projectId });
      return res.json({
        ...project,
        members,
        assignmentCount: assignments.length,
        pendingCount: assignments.filter(a => a.status === "pending" || a.status === "in_progress").length,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/projects — create project
  app.post("/api/projects", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const project = storage.createProject({ ...req.body, ownerId: userId });
      // Auto-add owner as member with role "owner"
      storage.addProjectMember({ projectId: project.id, userId, role: "owner" });
      return res.status(201).json(project);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/projects/:id — update project
  app.patch("/api/projects/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      if (!await canManageProject(projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can update this project" });
      }
      const project = storage.updateProject(projectId, req.body);
      if (!project) return res.status(404).json({ message: "Project not found" });
      return res.json(project);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // DELETE /api/projects/:id — delete project (owner/admin only)
  app.delete("/api/projects/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const project = storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const user = await storage.getUser(userId);
      const role = await getProjectRole(projectId, userId);
      if (user?.role !== "admin" && project.ownerId !== userId && role !== "owner") {
        return res.status(403).json({ message: "Only owner/admin can delete this project" });
      }
      const result = storage.deleteProject(projectId);
      return res.json({ message: "Deleted", changes: result.changes });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Project Members ---

  // GET /api/projects/:id/members
  app.get("/api/projects/:id/members", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }
      return res.json(storage.listProjectMembers(projectId));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/projects/:id/members — add member by userId or email
  app.post("/api/projects/:id/members", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      if (!await canManageProject(projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can add members" });
      }
      const { userId: targetUserId, email, role = "contributor" } = req.body;
      if (email) {
        // Check if user already exists
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
          // Add directly
          if (storage.isUserInProject(projectId, existingUser.id)) {
            return res.status(400).json({ message: "User is already a member" });
          }
          const member = storage.addProjectMember({ projectId, userId: existingUser.id, role });
          return res.status(201).json({ member, type: "direct" });
        } else {
          // Create invite
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          const invite = storage.createInvite({
            email,
            invitedBy: userId,
            projectId,
            role,
            status: "pending",
            expiresAt,
          });
          return res.status(201).json({ invite, type: "invite" });
        }
      } else if (targetUserId) {
        if (storage.isUserInProject(projectId, targetUserId)) {
          return res.status(400).json({ message: "User is already a member" });
        }
        const member = storage.addProjectMember({ projectId, userId: targetUserId, role });
        return res.status(201).json({ member, type: "direct" });
      } else {
        return res.status(400).json({ message: "Provide userId or email" });
      }
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/projects/:id/members/:userId — change role
  app.patch("/api/projects/:id/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const targetUserId = parseInt(req.params.memberId);
      if (!await canManageProject(projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can change roles" });
      }
      const { role } = req.body;
      const member = storage.updateProjectMember(projectId, targetUserId, role);
      if (!member) return res.status(404).json({ message: "Member not found" });
      return res.json(member);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // DELETE /api/projects/:id/members/:userId
  app.delete("/api/projects/:id/members/:memberId", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const targetUserId = parseInt(req.params.memberId);
      // Allow self-removal OR owner/manager/admin
      if (targetUserId !== userId && !await canManageProject(projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can remove members" });
      }
      const result = storage.removeProjectMember(projectId, targetUserId);
      return res.json({ message: "Removed", changes: result.changes });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Invites ---

  // GET /api/invites/:token — get invite info (public)
  app.get("/api/invites/:token", async (req, res) => {
    try {
      const invite = storage.getInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      // Return invite without sensitive fields
      return res.json({
        email: invite.email,
        status: invite.status,
        expiresAt: invite.expiresAt,
        projectId: invite.projectId,
        role: invite.role,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/invites/accept — accept invite (creates user if needed, logs in)
  app.post("/api/invites/accept", async (req, res) => {
    try {
      const { token, username, password } = req.body;
      if (!token) return res.status(400).json({ message: "Token is required" });

      const invite = storage.getInviteByToken(token);
      if (!invite) return res.status(404).json({ message: "Invite not found" });
      if (invite.status !== "pending") return res.status(400).json({ message: `Invite is already ${invite.status}` });
      if (new Date(invite.expiresAt) < new Date()) {
        storage.expireInvite(invite.id);
        return res.status(400).json({ message: "Invite has expired" });
      }

      let user = await storage.getUserByEmail(invite.email);
      if (!user) {
        // Create new user
        if (!username || !password) {
          return res.status(400).json({ message: "username and password required to create account" });
        }
        if (await storage.getUserByUsername(username)) {
          return res.status(400).json({ message: "Username already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user = await storage.createUser({ username, email: invite.email, password: hashedPassword });
        await storage.updateUserCredits(user.id, PLANS.free.credits);
      }

      // Accept invite (also adds to project_members)
      storage.acceptInvite(token, user.id);

      // Log the user in
      const sessionToken = generateToken();
      createSession(sessionToken, user.id);

      return res.json({
        token: sessionToken,
        user: { id: user.id, username: user.username, email: user.email, credits: user.credits, plan: user.plan, role: user.role },
        projectId: invite.projectId,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Assignments ---

  // GET /api/projects/:id/assignments
  app.get("/api/projects/:id/assignments", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }
      const { assignedTo, status, overdue, dueBefore } = req.query;
      const assignments = storage.listAssignments({
        projectId,
        assignedTo: assignedTo ? parseInt(assignedTo as string) : undefined,
        status: status as string | undefined,
        overdue: overdue === "true",
        dueBefore: dueBefore as string | undefined,
      });
      return res.json(assignments);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/projects/:id/assignments
  app.post("/api/projects/:id/assignments", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      if (!await canManageProject(projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can create assignments" });
      }
      const assignment = storage.createAssignment({ ...req.body, projectId, createdBy: userId });
      return res.status(201).json(assignment);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/assignments/:id
  app.patch("/api/assignments/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const assignment = storage.getAssignment(id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (!await canManageProject(assignment.projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can update assignments" });
      }
      const updated = storage.updateAssignment(id, req.body);
      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/assignments/:id/complete — mark done
  app.post("/api/assignments/:id/complete", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const assignment = storage.getAssignment(id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (!storage.isUserInProject(assignment.projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }
      const updated = storage.markAssignmentDone(id, userId);
      return res.json(updated);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // DELETE /api/assignments/:id
  app.delete("/api/assignments/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const assignment = storage.getAssignment(id);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (!await canManageProject(assignment.projectId, userId)) {
        return res.status(403).json({ message: "Only owner/manager/admin can delete assignments" });
      }
      const result = storage.deleteAssignment(id);
      return res.json({ message: "Deleted", changes: result.changes });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Project Messages ---

  // GET /api/projects/:id/messages
  app.get("/api/projects/:id/messages", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const messages = storage.listProjectMessages(projectId, limit);
      return res.json(messages);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/projects/:id/messages — post message + optional AI reply if @johnny mentioned
  app.post("/api/projects/:id/messages", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Not a member of this project" });
      }

      const { content, mentionsUserIds, attachments } = req.body;
      if (!content) return res.status(400).json({ message: "content is required" });

      const msg = storage.createProjectMessage({
        projectId,
        userId,
        role: "user",
        content,
        mentionsUserIds: mentionsUserIds ? JSON.stringify(mentionsUserIds) : null,
        attachments: attachments ? JSON.stringify(attachments) : null,
        source: "web",
      });

      // Create notifications for mentioned users
      if (Array.isArray(mentionsUserIds) && mentionsUserIds.length > 0) {
        const project = storage.getProject(projectId);
        for (const mentionedId of mentionsUserIds) {
          if (mentionedId !== userId) {
            storage.createNotification({
              userId: mentionedId,
              type: "mention",
              title: `You were mentioned in ${project?.name || "a project"}`,
              body: content.slice(0, 200),
              link: `#/projects/${projectId}/messages`,
              projectId,
              read: false,
            });
          }
        }
      }

      // Check for @johnny mention — generate AI reply, then send to project owner for approval (Part IX)
      const johnnySays = /@johnny/i.test(content);
      if (johnnySays) {
        // Insert an immediate ack placeholder so the chat UI shows activity right away.
        const ack = storage.createProjectMessage({
          projectId,
          userId: null,
          role: "assistant",
          content: "Johnny is thinking…",
          source: "ai",
          isAck: true,
        } as any);
        (async () => {
          try {
            const project = storage.getProject(projectId);
            const members = storage.listProjectMembers(projectId);
            const recentMessages = storage.listProjectMessages(projectId, 20);
            const activeAssignments = storage.listAssignments({ projectId, status: "pending" });

            const memberNames = members.map(m => `${m.user?.username || `user#${m.userId}`} (${m.role})`).join(", ");
            const assignmentSummary = activeAssignments.slice(0, 10)
              .map(a => `- ${a.title} (assigned to user#${a.assignedTo}, due: ${a.dueAt || a.nextRunAt || "not set"})`)
              .join("\n");
            const recentChat = recentMessages.slice(-10)
              .map(m => `[${m.role}${m.userId ? `#${m.userId}` : ""}]: ${m.content}`)
              .join("\n");

            // Resolve the agent for chat_reply capability on this project (falls back to Johnny default)
            const agent = storage.resolveAgent(projectId, "chat_reply");
            const systemPrompt = (agent?.systemPrompt && agent.systemPrompt.length > 0)
              ? agent.systemPrompt + `\n\nProject: "${project?.name || "Unknown"}".\nMembers: ${memberNames}\nActive assignments:\n${assignmentSummary || "None"}\nRecent chat:\n${recentChat}`
              : `You are Johnny, an AI project assistant helping with project "${project?.name || "Unknown Project"}".\n\nProject members: ${memberNames}\n\nActive assignments:\n${assignmentSummary || "None"}\n\nRecent chat:\n${recentChat}\n\nRespond helpfully and concisely. Focus on the project context.`;

            const provider = agent?.provider || "perplexity";
            const model = agent?.model || "sonar";
            const aiResult = await callProvider(provider, model, [
              { role: "system", content: systemPrompt },
              { role: "user", content },
            ]);

            const draft = aiResult.content || "";
            if (!draft) {
              storage.updateProjectMessageContent(ack.id, "(no reply generated)");
              return;
            }

            // Approval gate: create a pending_action and ping project owner via Telegram.
            const ownerId = project?.ownerId || userId;
            const action = storage.createPendingAction({
              sessionId: 0,
              actionType: "chat_reply",
              payload: JSON.stringify({ projectId, ackMessageId: ack.id, replyText: draft, askedBy: userId }),
              reasoning: `Reply to @johnny mention in project ${project?.name || projectId}`,
              pageStateHash: null,
              screenshotUrl: null,
              status: "pending",
              createdBy: "johnny",
              expiresAt: null,
            } as any);
            try {
              const { sendChatReplyApprovalCard } = await import("./telegram");
              await sendChatReplyApprovalCard(ownerId, project?.name || `Project #${projectId}`, content, draft, action.id);
            } catch (te: any) {
              console.error("[Project AI] Telegram card error:", te?.message);
            }
            // Also notify the owner in-app
            storage.createNotification({
              userId: ownerId,
              type: "chat_reply_approval",
              title: `Johnny drafted a reply in ${project?.name || "a project"}`,
              body: draft.slice(0, 160),
              link: `#/approvals`,
              projectId,
              read: false,
            });
          } catch (aiErr: any) {
            console.error("[Project AI] Error generating Johnny reply:", aiErr?.message || aiErr);
            try { storage.updateProjectMessageContent(ack.id, "(error generating reply)"); } catch { /* */ }
          }
        })();
      }

      return res.status(201).json(msg);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Notifications ---

  // GET /api/notifications
  app.get("/api/notifications", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const unreadOnly = req.query.unreadOnly === "true";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      return res.json(storage.listNotifications(userId, { unreadOnly, limit }));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // GET /api/notifications/unread-count
  app.get("/api/notifications/unread-count", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      return res.json({ count: storage.countUnreadNotifications(userId) });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/notifications/:id/read
  app.post("/api/notifications/:id/read", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      storage.markNotificationRead(parseInt(req.params.id), userId);
      return res.json({ message: "Marked as read" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // POST /api/notifications/mark-all-read
  app.post("/api/notifications/mark-all-read", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      storage.markAllNotificationsRead(userId);
      return res.json({ message: "All notifications marked as read" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // =====================================================
  // Part VIII — Managed Sessions + Pending Actions
  // =====================================================

  // List managed sessions owned by the current user.
  app.get("/api/managed-sessions", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      return res.json(storage.listManagedSessions(userId));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Create a managed session for the current user.
  app.post("/api/managed-sessions", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { name, site, runtime, status, accountLabel } = req.body || {};
      if (!name || !site) return res.status(400).json({ message: "name and site are required" });
      if (!["fiverr", "alibaba", "other"].includes(site)) {
        return res.status(400).json({ message: `Unsupported site: ${site}` });
      }
      const rt = runtime || "mock";
      if (!["mock", "local_chrome", "browserless"].includes(rt)) {
        return res.status(400).json({ message: `Unsupported runtime: ${rt}` });
      }
      const session = storage.createManagedSession({
        userId,
        name,
        site,
        runtime: rt,
        status: status || "active",
        accountLabel: accountLabel || null,
      });
      return res.status(201).json(session);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Get details (session + accounts + recent pending actions) for one session.
  app.get("/api/managed-sessions/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const session = storage.getManagedSession(id);
      if (!session) return res.status(404).json({ message: "Not found" });
      if (session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      return res.json({
        session,
        accounts: storage.listSessionAccounts(id),
        pendingActions: storage.listPendingActions({ sessionId: id }),
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Update session status (active | paused | expired).
  app.patch("/api/managed-sessions/:id/status", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const session = storage.getManagedSession(id);
      if (!session) return res.status(404).json({ message: "Not found" });
      if (session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const { status } = req.body || {};
      if (!["active", "paused", "expired"].includes(status)) {
        return res.status(400).json({ message: "status must be active | paused | expired" });
      }
      return res.json(storage.updateSessionStatus(id, status));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Add an account mapping (profile entity + credentials label) to a session.
  app.post("/api/managed-sessions/:id/accounts", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const session = storage.getManagedSession(id);
      if (!session) return res.status(404).json({ message: "Not found" });
      if (session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const { profileEntity, credentialsRef, notes } = req.body || {};
      if (!profileEntity) return res.status(400).json({ message: "profileEntity is required" });
      const allowed = ["roy_personal", "massive_group", "a3_academy", "orthocare", "launchkit"];
      if (!allowed.includes(profileEntity)) {
        return res.status(400).json({ message: `profileEntity must be one of: ${allowed.join(", ")}` });
      }
      const acct = storage.createSessionAccount({
        sessionId: id,
        profileEntity,
        credentialsRef: credentialsRef || null,
        notes: notes || null,
      });
      return res.status(201).json(acct);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // List pending actions across all sessions the user owns (optionally filter by status).
  app.get("/api/pending-actions", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const status = (req.query.status as string) || undefined;
      const ownSessions = storage.listManagedSessions(userId);
      const ownIds = new Set(ownSessions.map(s => s.id));
      const all = storage.listPendingActions({ status });
      return res.json(all.filter(a => ownIds.has(a.sessionId)));
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Get a single pending action (with its approvals + audit log).
  app.get("/api/pending-actions/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const action = storage.getPendingAction(id);
      if (!action) return res.status(404).json({ message: "Not found" });
      const session = storage.getManagedSession(action.sessionId);
      if (!session || session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      return res.json({
        action,
        session,
        approvals: storage.listActionApprovals(id),
        auditLog: storage.listAuditLog(id),
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Approve a pending action from the web UI (mirror of the Telegram callback path).
  app.post("/api/pending-actions/:id/approve", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const action = storage.getPendingAction(id);
      if (!action) return res.status(404).json({ message: "Not found" });
      const session = storage.getManagedSession(action.sessionId);
      if (!session || session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      if (action.status !== "pending") return res.status(409).json({ message: `Already ${action.status}` });

      const { editedPayload, decisionNote } = req.body || {};
      storage.updatePendingActionStatus(id, "approved");
      storage.createActionApproval({
        actionId: id,
        approverId: userId,
        decision: editedPayload ? "edit" : "approve",
        editedPayload: editedPayload ? (typeof editedPayload === "string" ? editedPayload : JSON.stringify(editedPayload)) : null,
        decisionNote: decisionNote || null,
      });
      storage.recordAuditEvent({
        actionId: id,
        event: "approved",
        beforeStateHash: action.pageStateHash || null,
        afterStateHash: null,
        runtimeResponse: null,
      });

      // Execute via runtime.
      try {
        const runtime = getRuntime(session.runtime);
        const refreshed = storage.getPendingAction(id)!;
        const result = await runtime.executeApprovedAction(session, refreshed);
        if (result.ok) {
          storage.updatePendingActionStatus(id, "executed");
          storage.recordAuditEvent({
            actionId: id, event: "executed",
            beforeStateHash: action.pageStateHash || null,
            afterStateHash: result.afterStateHash || null,
            runtimeResponse: JSON.stringify(result),
          });
          storage.touchSessionLastUsed(session.id);
          return res.json({ status: "executed", result });
        }
        storage.updatePendingActionStatus(id, "failed");
        storage.recordAuditEvent({
          actionId: id, event: "failed",
          beforeStateHash: action.pageStateHash || null,
          afterStateHash: result.afterStateHash || null,
          runtimeResponse: JSON.stringify(result),
        });
        return res.status(502).json({ status: "failed", result });
      } catch (execErr: any) {
        storage.updatePendingActionStatus(id, "failed");
        storage.recordAuditEvent({
          actionId: id, event: "failed",
          beforeStateHash: action.pageStateHash || null,
          afterStateHash: null,
          runtimeResponse: JSON.stringify({ ok: false, error: execErr?.message }),
        });
        return res.status(500).json({ status: "failed", error: execErr?.message });
      }
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // Reject a pending action from the web UI.
  app.post("/api/pending-actions/:id/reject", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id, 10);
      const action = storage.getPendingAction(id);
      if (!action) return res.status(404).json({ message: "Not found" });
      const session = storage.getManagedSession(action.sessionId);
      if (!session || session.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      if (action.status !== "pending") return res.status(409).json({ message: `Already ${action.status}` });

      const { decisionNote } = req.body || {};
      storage.updatePendingActionStatus(id, "rejected");
      storage.createActionApproval({
        actionId: id,
        approverId: userId,
        decision: "reject",
        editedPayload: null,
        decisionNote: decisionNote || null,
      });
      storage.recordAuditEvent({
        actionId: id,
        event: "rejected",
        beforeStateHash: action.pageStateHash || null,
        afterStateHash: null,
        runtimeResponse: null,
      });
      return res.json({ status: "rejected" });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // =====================================================
  // PART IX — Multi-Project Operations
  // (agents, milestones, credits, system queue, voice, billing)
  // =====================================================

  async function adminOnly(req: Request, res: Response): Promise<boolean> {
    const userId = (req as any).userId;
    const user = (await storage.getUser(userId)) as any;
    if (user?.role !== "admin") {
      res.status(403).json({ message: "Admin only" });
      return false;
    }
    return true;
  }

  // --- Agents (admin) ---

  app.get("/api/agents", authMiddleware, async (req, res) => {
    try {
      const user = (await storage.getUser((req as any).userId)) as any;
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      return res.json(storage.listP9Agents());
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/agents", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const { name, slug, provider, model, capabilities, systemPrompt, status } = req.body || {};
      if (!name || !slug || !provider || !model) {
        return res.status(400).json({ message: "name, slug, provider, model required" });
      }
      const agent = storage.createP9Agent({
        name, slug, provider, model,
        capabilities: Array.isArray(capabilities) ? JSON.stringify(capabilities) : (capabilities || "[]"),
        systemPrompt: systemPrompt || "",
        status: status || "active",
      });
      return res.status(201).json(agent);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/agents/:id", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const id = parseInt(req.params.id);
      const patch = { ...req.body };
      if (Array.isArray(patch.capabilities)) patch.capabilities = JSON.stringify(patch.capabilities);
      const updated = storage.updateP9Agent(id, patch);
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/agent-assignments", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const capability = req.query.capability as string | undefined;
      return res.json(storage.listAgentAssignments({ projectId, capability }));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/agent-assignments", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const { agentId, projectId, capability, priority } = req.body || {};
      if (!agentId || !capability) {
        return res.status(400).json({ message: "agentId and capability required" });
      }
      const row = storage.createAgentAssignment({
        agentId, projectId: projectId ?? null, capability,
        priority: priority ?? 100,
      });
      return res.status(201).json(row);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/agent-assignments/:id", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      storage.deleteAgentAssignment(parseInt(req.params.id));
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // --- Milestones ---

  app.get("/api/projects/:id/milestones", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return res.json(storage.listProjectMilestones(projectId));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/projects/:id/milestones", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { name, description, dueDate, status, agentAssignmentId, dependsOn } = req.body || {};
      if (!name) return res.status(400).json({ message: "name required" });
      const m = storage.createMilestone({
        projectId, name, description: description ?? null, dueDate: dueDate ?? null,
        status: status || (Array.isArray(dependsOn) && dependsOn.length > 0 ? "locked" : "ready"),
        agentAssignmentId: agentAssignmentId ?? null,
      });
      if (Array.isArray(dependsOn)) {
        for (const dep of dependsOn) {
          try { storage.addMilestoneDep(m.id, parseInt(dep)); } catch { /* ignore bad deps */ }
        }
      }
      return res.status(201).json(m);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/milestones/:id", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const m = storage.getMilestone(id);
      if (!m) return res.status(404).json({ message: "Not found" });
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(m.projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { status, name, description, dueDate, agentAssignmentId } = req.body || {};
      if (status) {
        storage.updateMilestoneStatus(id, status, status === "done" ? userId : undefined);
      }
      const patch: any = {};
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      if (dueDate !== undefined) patch.dueDate = dueDate;
      if (agentAssignmentId !== undefined) patch.agentAssignmentId = agentAssignmentId;
      if (Object.keys(patch).length > 0) storage.updateMilestone(id, patch);
      return res.json(storage.getMilestone(id));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/milestones/:id/deps", authMiddleware, async (req, res) => {
    try {
      return res.json(storage.getMilestoneDeps(parseInt(req.params.id)));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/milestones/:id/deps", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const id = parseInt(req.params.id);
      const m = storage.getMilestone(id);
      if (!m) return res.status(404).json({ message: "Not found" });
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(m.projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { dependsOnMilestoneId } = req.body || {};
      if (!dependsOnMilestoneId) return res.status(400).json({ message: "dependsOnMilestoneId required" });
      const row = storage.addMilestoneDep(id, parseInt(dependsOnMilestoneId));
      return res.status(201).json(row);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/milestone-deps/:id", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      storage.removeMilestoneDep(parseInt(req.params.id));
      return res.json({ ok: true });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // --- Credits ---

  app.get("/api/credits/me", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      return res.json(storage.getUserCredits(userId));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/projects/:id/credits", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      return res.json(storage.getProjectCredits(projectId));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/credits/grant", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const { userId, projectId, amount, note } = req.body || {};
      if (!userId || !amount) return res.status(400).json({ message: "userId and amount required" });
      const result = storage.creditCredits({
        userId: parseInt(userId), projectId: projectId ? parseInt(projectId) : null,
        amount: parseInt(amount), txnType: "credit", note: note || "admin grant",
      });
      return res.json(result);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.get("/api/credits/ledger", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const targetUserId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      // Non-admins can only see their own ledger
      if (user?.role !== "admin") {
        return res.json(storage.listCreditLedger({ userId, limit }));
      }
      return res.json(storage.listCreditLedger({ userId: targetUserId, projectId, limit }));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // Public: credit packages list
  app.get("/api/credits/packages", async (req, res) => {
    try {
      return res.json(storage.listCreditPackages());
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // --- System credit queue (admin) ---

  app.get("/api/system-queue", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const status = req.query.status as string | undefined;
      return res.json(storage.listSystemQueue(status));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/system-queue/:id/approve", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const adminId = (req as any).userId;
      const row = storage.approveQueuedAction(parseInt(req.params.id), adminId);
      return res.json(row);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  app.post("/api/system-queue/:id/deny", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      const adminId = (req as any).userId;
      const { note } = req.body || {};
      const row = storage.denyQueuedAction(parseInt(req.params.id), adminId, note);
      return res.json(row);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // --- Voice upload (project chat) ---

  app.post("/api/projects/:id/voice", authMiddleware, upload.single("audio"), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const projectId = parseInt(req.params.id);
      const user = (await storage.getUser(userId)) as any;
      if (user?.role !== "admin" && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const f = (req as any).file;
      if (!f) return res.status(400).json({ message: "audio file required" });
      const buffer: Buffer = f.buffer || (f.path ? require("fs").readFileSync(f.path) : null);
      if (!buffer) return res.status(400).json({ message: "could not read audio" });
      const mimeType = f.mimetype || "audio/webm";
      const ext = (mimeType.split("/")[1] || "webm").split(";")[0];
      const key = `voice/${projectId}/${Date.now()}_${userId}.${ext}`;
      const uploaded = await uploadAudio(buffer, key, mimeType);

      let transcript = "";
      let durationSec = 0;
      try {
        const tr = await transcribeAudio(buffer, mimeType);
        transcript = tr.text;
        durationSec = Math.round(tr.durationSec || 0);
      } catch (e: any) {
        console.error("[voice] transcription failed:", e?.message);
      }

      const msg = storage.createProjectMessage({
        projectId, userId, role: "user",
        content: transcript || "[voice message]",
        audioUrl: uploaded.url,
        transcript: transcript || null,
        durationSec: durationSec || null,
        source: "web",
      } as any);
      return res.status(201).json(msg);
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  // --- Billing / Stripe ---

  app.post("/api/billing/checkout", authMiddleware, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ message: "Stripe not configured" });
      const userId = (req as any).userId;
      const { packageSlug, projectId, successUrl, cancelUrl } = req.body || {};
      if (!packageSlug) return res.status(400).json({ message: "packageSlug required" });
      const pkg = storage.getCreditPackageBySlug(packageSlug);
      if (!pkg) return res.status(404).json({ message: "package not found" });
      const user = (await storage.getUser(userId)) as any;
      const lineItem: any = pkg.stripePriceId
        ? { price: pkg.stripePriceId, quantity: 1 }
        : {
            price_data: {
              currency: "usd",
              product_data: { name: pkg.name },
              unit_amount: pkg.priceUsd,
            },
            quantity: 1,
          };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [lineItem],
        success_url: successUrl || `${req.headers.origin || ""}/#/credits?status=success`,
        cancel_url: cancelUrl || `${req.headers.origin || ""}/#/credits?status=cancel`,
        customer_email: user?.email,
        metadata: {
          userId: String(userId),
          projectId: projectId ? String(projectId) : "",
          packageSlug,
          credits: String(pkg.credits),
        },
      });
      return res.json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
      console.error("[billing/checkout] error:", e?.message);
      return res.status(500).json({ message: e.message });
    }
  });

  // Stripe webhook — note: global JSON parser will have already consumed body,
  // so we use a re-encoded raw body fallback. For production correctness, mount
  // raw at the very top of server/index.ts. Here we tolerate both shapes.
  app.post("/api/billing/webhook", async (req: any, res) => {
    try {
      const stripe = getStripe();
      const secret = getWebhookSecret();
      if (!stripe || !secret) return res.status(503).json({ message: "Stripe not configured" });
      const sig = req.headers["stripe-signature"] as string;
      let event: any;
      try {
        const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
        event = stripe.webhooks.constructEvent(raw, sig, secret);
      } catch (err: any) {
        return res.status(400).json({ message: `Webhook signature verification failed: ${err?.message}` });
      }
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as any;
        const metadata = session.metadata || {};

        // BRANCH A — In-app credit purchases (existing flow)
        const userId = parseInt(metadata.userId || "0");
        const projectId = metadata.projectId ? parseInt(metadata.projectId) : null;
        const credits = parseInt(metadata.credits || "0");
        if (userId && credits > 0) {
          const result = storage.creditCredits({
            userId, projectId, amount: credits,
            txnType: "credit", stripeChargeId: session.payment_intent || session.id,
            note: `Stripe purchase: ${metadata.packageSlug || "package"}`,
          });
          console.log(`[stripe webhook] credited user ${userId} ${credits} credits; settled ${result.settled} overdraft`);
        }

        // BRANCH B — Payment Link product orders (FTO / Pitch Site)
        // Stripe Payment Links set metadata on the *Price* level via custom metadata in dashboard,
        // or we match by amount as a fallback since we control the catalog.
        const amountCents = session.amount_total ?? 0;
        const customerEmail = session.customer_email || session.customer_details?.email || null;
        const customerName = session.customer_details?.name || null;

        // Try to identify product: metadata.product_sku (preferred) or amount fallback
        let sku: string | null = metadata.product_sku || null;
        if (!sku) {
          for (const [k, p] of Object.entries(PRODUCT_CATALOG)) {
            if (p.priceUsd * 100 === amountCents) { sku = k; break; }
          }
        }
        const product = sku ? PRODUCT_CATALOG[sku] : null;

        if (product) {
          try {
            const sqliteAny = (storage as any).sqlite || null;
            // Use raw SQL for portability; storage module exports the better-sqlite3 instance.
            const db = (await import("./storage")).sqlite;
            db.prepare(`INSERT OR IGNORE INTO product_orders (product_sku, product_name, amount_usd, customer_email, customer_name, stripe_session_id, stripe_payment_intent_id, status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', datetime('now'))`).run(
              product.sku, product.name, product.priceUsd,
              customerEmail, customerName,
              session.id, session.payment_intent || null,
            );
            console.log(`[stripe webhook] product order recorded: ${product.sku} — ${customerEmail || "no-email"} — $${product.priceUsd}`);
          } catch (e: any) {
            console.error(`[stripe webhook] failed to record product order:`, e?.message);
          }
        }
      }

      // Refund handling
      if (event.type === "refund.created") {
        const refund = event.data.object as any;
        const paymentIntentId = refund.payment_intent;
        if (paymentIntentId) {
          try {
            const db = (await import("./storage")).sqlite;
            const r = db.prepare(`UPDATE product_orders SET status = 'refunded' WHERE stripe_payment_intent_id = ?`).run(paymentIntentId);
            if (r.changes > 0) {
              console.log(`[stripe webhook] refund recorded for PI ${paymentIntentId}`);
            }
          } catch (e: any) {
            console.error(`[stripe webhook] refund handler error:`, e?.message);
          }
        }
      }

      return res.json({ received: true });
    } catch (e: any) {
      console.error("[stripe webhook] error:", e?.message);
      return res.status(500).json({ message: e.message });
    }
  });

  // =====================================================
  // PART X — PROJECT ARMS routes
  // Functional sub-branches per project, each with a named AI manager.
  // Reuses: agents(scope='arm'), pending_actions (gate, type='arm_instruction'),
  // credit_ledger, auth_profiles round-robin, Part IX Whisper voice.
  // =====================================================

  // Pricing (credits)
  const ARM_PRICE = {
    chatT1: 1,      // Groq tier-1 chat reply
    chatT2: 5,      // Claude deep-work
    voicePerMin: 3, // voice transcription
    targetDraft: 3, // target instruction draft
    docAssist: 2,   // document AI-assist
  };

  // Resolve arm + enforce visibility. Returns { arm, user, isAdmin } or sends an error.
  async function loadArmForRead(req: Request, res: Response): Promise<{ arm: any; userId: number; isAdmin: boolean } | null> {
    const userId = (req as any).userId;
    const user = (await storage.getUser(userId)) as any;
    const isAdmin = user?.role === "admin";
    const armId = parseInt(req.params.armId);
    const arm = storage.getArm(armId);
    if (!arm) { res.status(404).json({ message: "Arm not found" }); return null; }
    if (!storage.canViewArm(arm, userId, isAdmin)) {
      res.status(403).json({ message: "Forbidden" }); return null;
    }
    return { arm, userId, isAdmin };
  }

  // Build the arm AI manager system prompt (agent personality + living doc context).
  function buildArmSystemPrompt(arm: any, lang: string): string {
    const agent = storage.getP9Agent(arm.armAgentId);
    const doc = storage.getArmDocument(arm.id);
    let docContext = "";
    if (doc?.currentVersionId) {
      const v = storage.getArmDocumentVersion(doc.currentVersionId);
      if (v?.content) docContext = `\n\nCurrent living document ("${doc.title}"):\n${v.content.slice(0, 4000)}`;
    }
    const base = agent?.systemPrompt || "You are an operations manager AI.";
    const langNote = lang === "he" ? "\nRespond in Hebrew unless the user writes in English." : "";
    return `${base}${langNote}\nYou manage the "${arm.name}" arm of this project. Never send anything outbound without explicit human approval.${docContext}`;
  }

  // GET /api/projects/:projectId/arms — list visible arms in a project
  app.get("/api/projects/:projectId/arms", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const isAdmin = user?.role === "admin";
      const projectId = parseInt(req.params.projectId);
      if (!isAdmin && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const armsList = storage.listArms(projectId, userId, isAdmin).map((a) => {
        const agent = storage.getP9Agent(a.armAgentId);
        return { ...a, agentDisplayName: agent?.displayName ?? null, agentSlug: agent?.slug ?? null };
      });
      return res.json(armsList);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/projects/:projectId/arms — create a new arm (project member/admin)
  app.post("/api/projects/:projectId/arms", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const isAdmin = user?.role === "admin";
      const projectId = parseInt(req.params.projectId);
      if (!isAdmin && !storage.isUserInProject(projectId, userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { name, slug, armAgentId, ownerUserId, visibility } = req.body || {};
      if (!name || !slug || !armAgentId) {
        return res.status(400).json({ message: "name, slug, armAgentId required" });
      }
      if (storage.getArmBySlug(projectId, slug)) {
        return res.status(409).json({ message: "An arm with that slug already exists in this project" });
      }
      const arm = storage.createArm({
        projectId, name, slug, armAgentId,
        ownerUserId: ownerUserId ?? null,
        visibility: visibility || "owner_private",
        isActive: true,
      } as any);
      storage.ensureArmDocument(arm.id, `How we run ${name}`);
      storage.logArmActivity({ armId: arm.id, action: "arm_created", metadata: { by: userId } });
      return res.status(201).json(arm);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/agents — list the 4 arm AI managers (for arm creation UI)
  // NOTE: registered BEFORE /api/arms/:armId so "agents" is not captured as an armId.
  app.get("/api/arms/agents", authMiddleware, async (req, res) => {
    try {
      const all = storage.listP9Agents().filter((a) => (a as any).scope === "arm");
      return res.json(all.map((a) => ({ id: a.id, slug: a.slug, displayName: (a as any).displayName, name: a.name })));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/:armId — arm detail (visibility enforced)
  app.get("/api/arms/:armId", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const agent = storage.getP9Agent(ctx.arm.armAgentId);
      const doc = storage.getArmDocument(ctx.arm.id);
      return res.json({ ...ctx.arm, agent: agent ? { id: agent.id, slug: agent.slug, displayName: agent.displayName, systemPrompt: agent.systemPrompt } : null, documentId: doc?.id ?? null });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // PATCH /api/arms/:armId — update arm (owner or admin); supports claiming ownership
  app.patch("/api/arms/:armId", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      // Only owner or admin can mutate; unassigned arms can be claimed by a project member.
      const canMutate = ctx.isAdmin || ctx.arm.ownerUserId === ctx.userId
        || (ctx.arm.ownerUserId == null && storage.isUserInProject(ctx.arm.projectId, ctx.userId));
      if (!canMutate) return res.status(403).json({ message: "Forbidden" });
      const { name, ownerUserId, visibility, isActive } = req.body || {};
      const patch: any = {};
      if (name !== undefined) patch.name = name;
      if (ownerUserId !== undefined) patch.ownerUserId = ownerUserId;
      if (visibility !== undefined) patch.visibility = visibility;
      if (isActive !== undefined) patch.isActive = isActive;
      const updated = storage.updateArm(ctx.arm.id, patch);
      storage.logArmActivity({ armId: ctx.arm.id, action: "arm_updated", metadata: { by: ctx.userId, patch } });
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/:armId/messages — chat history
  app.get("/api/arms/:armId/messages", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      return res.json(storage.listArmMessages(ctx.arm.id));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/:armId/messages — send a message, get AI manager reply
  // Body: { content, deepWork?: boolean, lang?: 'en'|'he' }
  app.post("/api/arms/:armId/messages", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const { content, deepWork, lang } = req.body || {};
      if (!content || !String(content).trim()) return res.status(400).json({ message: "content required" });
      const arm = ctx.arm;

      // Store user message
      storage.createArmMessage({ armId: arm.id, role: "user", content: String(content), authorUserId: ctx.userId } as any);

      // Deduct credits BEFORE inference (T1 Groq=1, T2 Claude deep-work=5)
      const cost = deepWork ? ARM_PRICE.chatT2 : ARM_PRICE.chatT1;
      const debit = storage.debitCredits({
        userId: ctx.userId, projectId: arm.projectId, amount: cost,
        actionRef: `arm:${arm.id}:chat`, note: `Arm chat (${deepWork ? "T2 deep-work" : "T1"})`,
      });
      if (!debit.ok) {
        return res.status(402).json({ message: "Insufficient credits — queued for approval", queueId: (debit as any).queueId });
      }

      // Build prompt with personality + living doc context + recent history
      const sys = buildArmSystemPrompt(arm, lang || "en");
      const history = storage.listArmMessages(arm.id, 20)
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const messages = [{ role: "system", content: sys }, ...history];

      let replyContent = "";
      let agentId = arm.armAgentId;
      if (deepWork) {
        // Tier 2/3 deep work → Claude via callProvider
        const out = await callProvider("anthropic", "claude-sonnet-4-5", messages);
        replyContent = out.content;
      } else {
        // Tier 1 → Groq free pool (NOT Base44)
        const out = await callGroqArm(messages);
        replyContent = out.content;
      }

      const reply = storage.createArmMessage({ armId: arm.id, role: "assistant", content: replyContent, agentId } as any);
      storage.logArmActivity({ armId: arm.id, agentId, action: "chat_reply", creditsCost: cost, metadata: { deepWork: !!deepWork } });
      return res.status(201).json({ reply, creditsCharged: cost, balanceAfter: (debit as any).balanceAfter });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/:armId/messages/voice — voice message (Whisper transcription, 3 credits/min)
  app.post("/api/arms/:armId/messages/voice", authMiddleware, upload.single("audio"), async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const arm = ctx.arm;
      const f = (req as any).file;
      if (!f) return res.status(400).json({ message: "audio file required" });
      const buffer: Buffer = f.buffer || (f.path ? fs.readFileSync(f.path) : null);
      if (!buffer) return res.status(400).json({ message: "could not read audio" });
      const mimeType = f.mimetype || "audio/webm";
      const ext = (mimeType.split("/")[1] || "webm").split(";")[0];
      const key = `arm-voice/${arm.id}/${Date.now()}_${ctx.userId}.${ext}`;
      const uploaded = await uploadAudio(buffer, key, mimeType);

      let transcript = "";
      let durationSec = 0;
      try {
        const tr = await transcribeAudio(buffer, mimeType);
        transcript = tr.text;
        durationSec = Math.round(tr.durationSec || 0);
      } catch (e: any) { console.error("[arm voice] transcription failed:", e?.message); }

      // Charge 3 credits/minute (min 1 minute billed)
      const minutes = Math.max(1, Math.ceil(durationSec / 60));
      const cost = minutes * ARM_PRICE.voicePerMin;
      const debit = storage.debitCredits({
        userId: ctx.userId, projectId: arm.projectId, amount: cost,
        actionRef: `arm:${arm.id}:voice`, note: `Arm voice transcription (${minutes} min)`,
      });
      if (!debit.ok) return res.status(402).json({ message: "Insufficient credits — queued", queueId: (debit as any).queueId });

      const msg = storage.createArmMessage({
        armId: arm.id, role: "user", content: transcript || "[voice message]",
        authorUserId: ctx.userId, audioUrl: uploaded.url, transcript: transcript || null,
      } as any);
      storage.logArmActivity({ armId: arm.id, action: "voice_transcribed", creditsCost: cost, metadata: { durationSec, minutes } });
      return res.status(201).json({ message: msg, creditsCharged: cost });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/:armId/document — current living document + current version
  app.get("/api/arms/:armId/document", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const doc = storage.ensureArmDocument(ctx.arm.id, `How we run ${ctx.arm.name}`);
      const current = doc.currentVersionId ? storage.getArmDocumentVersion(doc.currentVersionId) : null;
      const versions = storage.listArmDocumentVersions(doc.id);
      return res.json({ document: doc, current, versionCount: versions.length });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/:armId/document — save a new version. Body: { content, changeNote?, aiAssist?: boolean }
  app.post("/api/arms/:armId/document", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const arm = ctx.arm;
      const { content, changeNote, aiAssist, lang } = req.body || {};
      const doc = storage.ensureArmDocument(arm.id, `How we run ${arm.name}`);

      let finalContent = String(content ?? "");
      let authorAgentId: number | null = null;
      if (aiAssist) {
        // AI-assisted edit: 2 credits, run through Groq with the arm personality
        const debit = storage.debitCredits({
          userId: ctx.userId, projectId: arm.projectId, amount: ARM_PRICE.docAssist,
          actionRef: `arm:${arm.id}:doc_assist`, note: "Arm document AI-assist",
        });
        if (!debit.ok) return res.status(402).json({ message: "Insufficient credits — queued", queueId: (debit as any).queueId });
        const sys = buildArmSystemPrompt(arm, lang || "en");
        const out = await callGroqArm([
          { role: "system", content: `${sys}\nYou are revising the living document. Return the full improved markdown document only, no commentary.` },
          { role: "user", content: `Current draft:\n${finalContent}\n\nImprove, tighten, and structure this document.` },
        ]);
        finalContent = out.content;
        authorAgentId = arm.armAgentId;
        storage.logArmActivity({ armId: arm.id, agentId: arm.armAgentId, action: "doc_assist", creditsCost: ARM_PRICE.docAssist });
      }

      const version = storage.createArmDocumentVersion({
        documentId: doc.id, content: finalContent,
        authorUserId: aiAssist ? null : ctx.userId, authorAgentId,
        changeNote: changeNote || (aiAssist ? "AI-assisted revision" : "Manual edit"),
      });
      storage.logArmActivity({ armId: arm.id, action: "doc_edit", metadata: { versionId: version.id, versionNumber: version.versionNumber } });
      return res.status(201).json(version);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/:armId/document/versions — version history
  app.get("/api/arms/:armId/document/versions", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const doc = storage.getArmDocument(ctx.arm.id);
      if (!doc) return res.json([]);
      return res.json(storage.listArmDocumentVersions(doc.id));
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/:armId/document/versions/:versionId/restore — restore an old version
  app.post("/api/arms/:armId/document/versions/:versionId/restore", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const doc = storage.getArmDocument(ctx.arm.id);
      if (!doc) return res.status(404).json({ message: "No document" });
      const restored = storage.restoreArmDocumentVersion(doc.id, parseInt(req.params.versionId), ctx.userId);
      if (!restored) return res.status(404).json({ message: "Version not found" });
      storage.logArmActivity({ armId: ctx.arm.id, action: "doc_restore", metadata: { newVersionId: restored.id } });
      return res.json(restored);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/arms/:armId/targets — list targets for an arm
  app.get("/api/arms/:armId/targets", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const targets = storage.listArmTargets(ctx.arm.id).map((t) => ({
        ...t, instructions: storage.listArmTargetInstructions(t.id),
      }));
      return res.json(targets);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/:armId/targets — add a target counterparty
  app.post("/api/arms/:armId/targets", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadArmForRead(req, res); if (!ctx) return;
      const { name, contactInfo, notes } = req.body || {};
      if (!name) return res.status(400).json({ message: "name required" });
      const target = storage.createArmTarget({
        armId: ctx.arm.id, name,
        contactInfo: contactInfo ? (typeof contactInfo === "string" ? contactInfo : JSON.stringify(contactInfo)) : null,
        notes: notes || null, isActive: true,
      } as any);
      storage.logArmActivity({ armId: ctx.arm.id, action: "target_added", metadata: { targetId: target.id } });
      return res.status(201).json(target);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arms/targets/:targetId/generate-instructions
  // AI-generate an instruction sheet for a target → routed through the approval gate.
  // 3 credits. Creates a pending_actions row (type='arm_instruction').
  app.post("/api/arms/targets/:targetId/generate-instructions", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const isAdmin = user?.role === "admin";
      const target = storage.getArmTarget(parseInt(req.params.targetId));
      if (!target) return res.status(404).json({ message: "Target not found" });
      const arm = storage.getArm(target.armId);
      if (!arm || !storage.canViewArm(arm, userId, isAdmin)) return res.status(403).json({ message: "Forbidden" });
      const { lang, brief } = req.body || {};

      // Charge 3 credits for the draft
      const debit = storage.debitCredits({
        userId, projectId: arm.projectId, amount: ARM_PRICE.targetDraft,
        actionRef: `arm:${arm.id}:target:${target.id}:draft`, note: "Arm target instruction draft",
      });
      if (!debit.ok) return res.status(402).json({ message: "Insufficient credits — queued", queueId: (debit as any).queueId });

      const sys = buildArmSystemPrompt(arm, lang || "en");
      const out = await callGroqArm([
        { role: "system", content: `${sys}\nYou are drafting an instruction sheet to send to the counterparty "${target.name}". Produce a clear, structured instruction sheet in markdown. This is a DRAFT requiring human approval before sending.` },
        { role: "user", content: `Counterparty notes: ${target.notes || "(none)"}\nBrief: ${brief || "Draft a standard instruction sheet for this counterparty."}` },
      ]);

      // Create the instruction (status='draft') and route through Part IX approval gate.
      const instruction = storage.createArmTargetInstruction({
        targetId: target.id, generatedByAgentId: arm.armAgentId,
        content: out.content, status: "draft",
      } as any);
      // pending_actions gate (sessionId=0 for web-originated arm actions, like chat_reply)
      const pending = storage.createPendingAction({
        sessionId: 0,
        actionType: "arm_instruction",
        payload: JSON.stringify({ armId: arm.id, projectId: arm.projectId, targetId: target.id, instructionId: instruction.id, targetName: target.name }),
        reasoning: `Outbound instruction sheet for "${target.name}" drafted by ${storage.getP9Agent(arm.armAgentId)?.displayName || "arm manager"}. Requires approval before sending.`,
        status: "pending",
        createdBy: storage.getP9Agent(arm.armAgentId)?.slug || "arm",
      } as any);
      storage.updateArmTargetInstruction(instruction.id, { pendingActionId: pending.id } as any);
      storage.logArmActivity({ armId: arm.id, agentId: arm.armAgentId, action: "target_instruction_drafted", creditsCost: ARM_PRICE.targetDraft, metadata: { targetId: target.id, instructionId: instruction.id, pendingActionId: pending.id } });
      return res.status(201).json({ instruction: { ...instruction, pendingActionId: pending.id }, pendingActionId: pending.id });
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arm-instructions/:instructionId/approve — approve a drafted instruction (gate)
  app.post("/api/arm-instructions/:instructionId/approve", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const isAdmin = user?.role === "admin";
      const instruction = storage.getArmTargetInstruction(parseInt(req.params.instructionId));
      if (!instruction) return res.status(404).json({ message: "Instruction not found" });
      const target = storage.getArmTarget(instruction.targetId);
      const arm = target ? storage.getArm(target.armId) : undefined;
      if (!arm) return res.status(404).json({ message: "Arm not found" });
      // Approval gate: only the arm owner or an admin may approve outbound.
      if (!isAdmin && arm.ownerUserId !== userId) return res.status(403).json({ message: "Only the arm owner or an admin may approve" });
      const updated = storage.updateArmTargetInstruction(instruction.id, {
        status: "approved", approvedByUserId: userId, approvedAt: new Date().toISOString(),
      } as any);
      if (instruction.pendingActionId) storage.updatePendingActionStatus(instruction.pendingActionId, "approved");
      storage.logArmActivity({ armId: arm.id, action: "instruction_approved", metadata: { instructionId: instruction.id, by: userId } });
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // POST /api/arm-instructions/:instructionId/reject — reject a drafted instruction
  app.post("/api/arm-instructions/:instructionId/reject", authMiddleware, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = (await storage.getUser(userId)) as any;
      const isAdmin = user?.role === "admin";
      const instruction = storage.getArmTargetInstruction(parseInt(req.params.instructionId));
      if (!instruction) return res.status(404).json({ message: "Instruction not found" });
      const target = storage.getArmTarget(instruction.targetId);
      const arm = target ? storage.getArm(target.armId) : undefined;
      if (!arm) return res.status(404).json({ message: "Arm not found" });
      if (!isAdmin && arm.ownerUserId !== userId) return res.status(403).json({ message: "Only the arm owner or an admin may reject" });
      const updated = storage.updateArmTargetInstruction(instruction.id, { status: "rejected" } as any);
      if (instruction.pendingActionId) storage.updatePendingActionStatus(instruction.pendingActionId, "rejected");
      storage.logArmActivity({ armId: arm.id, action: "instruction_rejected", metadata: { instructionId: instruction.id, by: userId } });
      return res.json(updated);
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  // GET /api/admin/arms/dashboard — manager dashboard aggregates (admin only)
  app.get("/api/admin/arms/dashboard", authMiddleware, async (req, res) => {
    try {
      if (!(await adminOnly(req, res))) return;
      return res.json(storage.getArmsDashboard());
    } catch (e: any) { return res.status(500).json({ message: e.message }); }
  });

  return httpServer;
}
