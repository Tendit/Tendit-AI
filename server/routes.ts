import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerSchema, loginSchema, PLANS, MODEL_COSTS, MODELS, ADMIN_EMAIL, ADMIN_PASSWORD, applyMargin, DEFAULT_RATE_LIMITS, AGENT_TOOLS, REAL_TOOLS, buildAgentSystemPrompt } from "@shared/schema";
import type { AgentToolConfig, AgentToolRule } from "@shared/schema";
import { seedCalendarEvents, buildTimelineContext, buildTimelinePrompt } from "./calendar-engine";
import { buildRequestContext, evaluateRules, applyRuleActions, getDefaultRules } from "./rule-engine";
import { captureUserEvent, buildUserStoryArc, buildStoryArcContextForChat } from "./story-arc";
import { runAgentLoop } from "./agent-orchestrator";
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

// Session management
const sessions = new Map<string, number>();

function generateToken(): string {
  return randomUUID() + "-" + randomUUID();
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.replace("Bearer ", "");
  const userId = sessions.get(token);
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
  const userId = sessions.get(token);
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
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
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
      sessions.set(token, user.id);

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
      sessions.set(token, user.id);

      return res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, credits: user.credits, plan: user.plan, role: user.role },
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", authMiddleware, (req, res) => {
    sessions.delete((req as any).token);
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
        const applied = applyRuleActions(matchedRules, messagesForApi);
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

  return httpServer;
}
