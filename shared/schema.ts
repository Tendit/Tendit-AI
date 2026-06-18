import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  credits: real("credits").notNull().default(0),
  plan: text("plan").notNull().default("free"),
  role: text("role").notNull().default("user"), // user, admin
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  prefix: text("prefix").notNull(),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  title: text("title").notNull().default("New Conversation"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  provider: text("provider"), // perplexity, openai, anthropic, google
  creditsUsed: real("credits_used").default(0),
  citations: text("citations"),
  // Agent features
  toolUsed: text("tool_used"), // "search", "document", "code", null
  attachments: text("attachments"), // JSON array of generated file refs
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export const usageLogs = sqliteTable("usage_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  apiKeyId: integer("api_key_id"),
  model: text("model").notNull(),
  provider: text("provider").notNull().default("perplexity"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  creditsUsed: real("credits_used").notNull(),
  endpoint: text("endpoint").notNull(),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

// Platform settings (admin-configurable)
export const platformSettings = sqliteTable("platform_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;

// Rate limit rules (admin-configurable)
export const rateLimitRules = sqliteTable("rate_limit_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("all"), // "free", "starter", "pro", "enterprise", "all"
  maxRequestsPerMinute: integer("max_requests_per_minute").notNull().default(10),
  maxRequestsPerHour: integer("max_requests_per_hour").notNull().default(100),
  maxRequestsPerDay: integer("max_requests_per_day").notNull().default(500),
  maxCreditsPerDay: real("max_credits_per_day").notNull().default(100),
  maxTokensPerRequest: integer("max_tokens_per_request").notNull().default(4096),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(0), // forced wait between requests
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type RateLimitRule = typeof rateLimitRules.$inferSelect;

export const insertRateLimitRuleSchema = createInsertSchema(rateLimitRules).omit({
  id: true,
  createdAt: true,
});
export type InsertRateLimitRule = z.infer<typeof insertRateLimitRuleSchema>;

// Default platform settings
export const DEFAULT_SETTINGS = {
  margin_multiplier: "2",    // 2x = user pays double the base cost
  smart_followups_enabled: "true",  // auto-suggest follow-up questions
  agent_tools_enabled: "true",      // enable agent tool capabilities
  followup_model: "sonar",          // cheap model used for generating follow-ups
  max_followups: "3",               // number of follow-up suggestions per response
} as const;

// Default rate limit rules per plan
export const DEFAULT_RATE_LIMITS: Record<string, {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  maxCreditsPerDay: number;
  maxTokensPerRequest: number;
  cooldownSeconds: number;
}> = {
  free: {
    maxRequestsPerMinute: 3,
    maxRequestsPerHour: 20,
    maxRequestsPerDay: 50,
    maxCreditsPerDay: 10,
    maxTokensPerRequest: 2048,
    cooldownSeconds: 5,
  },
  starter: {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 100,
    maxRequestsPerDay: 500,
    maxCreditsPerDay: 100,
    maxTokensPerRequest: 4096,
    cooldownSeconds: 2,
  },
  pro: {
    maxRequestsPerMinute: 30,
    maxRequestsPerHour: 300,
    maxRequestsPerDay: 2000,
    maxCreditsPerDay: 500,
    maxTokensPerRequest: 8192,
    cooldownSeconds: 0,
  },
  enterprise: {
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxRequestsPerDay: 10000,
    maxCreditsPerDay: 5000,
    maxTokensPerRequest: 16384,
    cooldownSeconds: 0,
  },
};

// Provider API keys stored by admin
export const providerKeys = sqliteTable("provider_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().unique(), // perplexity, openai, anthropic, google
  apiKey: text("api_key").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

// Sessions table — persists across server restarts
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  expiresAt: text("expires_at").notNull(), // ISO date string
});

export type Session = typeof sessions.$inferSelect;

// === PERSONAL AI AGENTS ===

// Platform agents — created by admin, assigned to users
export const platformAgents = sqliteTable("platform_agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // "Johnny", "Sarah"
  description: text("description"), // "Personal assistant & scheduler"
  avatar: text("avatar"), // emoji or image URL
  capabilities: text("capabilities").notNull().default("[]"), // JSON: ["create_event", "set_reminder", "set_alarm", "create_task"]
  systemPrompt: text("system_prompt").notNull(), // AI instructions for this agent
  ownerEmail: text("owner_email"), // real person behind the agent (for notifications)
  ownerPhone: text("owner_phone"), // for future SMS/push
  approvalMode: text("approval_mode").notNull().default("auto"), // "auto" = execute immediately, "request" = owner must approve
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type PlatformAgent = typeof platformAgents.$inferSelect;
export const insertPlatformAgentSchema = createInsertSchema(platformAgents).omit({ id: true, createdAt: true });
export type InsertPlatformAgent = z.infer<typeof insertPlatformAgentSchema>;

// Agent ↔ User assignments (which users can talk to which agents)
export const agentAssignments = sqliteTable("agent_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  userId: integer("user_id").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  assignedAt: text("assigned_at").notNull().default(new Date().toISOString()),
});

export type AgentAssignment = typeof agentAssignments.$inferSelect;

// Agent action requests (pending approval or completed)
export const agentRequests = sqliteTable("agent_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  userId: integer("user_id").notNull(), // who made the request
  conversationId: integer("conversation_id"),
  actionType: text("action_type").notNull(), // "create_event", "set_reminder", "set_alarm", "create_task"
  actionData: text("action_data").notNull(), // JSON with all extracted fields
  status: text("status").notNull().default("pending"), // "pending", "approved", "declined", "auto_approved"
  resolvedBy: integer("resolved_by"), // admin/owner userId who approved/declined
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type AgentRequest = typeof agentRequests.$inferSelect;
export const insertAgentRequestSchema = createInsertSchema(agentRequests).omit({ id: true, createdAt: true });
export type InsertAgentRequest = z.infer<typeof insertAgentRequestSchema>;

// User schedule — events, reminders, alarms, tasks created by agents
export const scheduleItems = sqliteTable("schedule_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  agentId: integer("agent_id"), // which agent created it
  requestId: integer("request_id"), // links to agent_requests
  type: text("type").notNull(), // "event", "reminder", "alarm", "task"
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time"), // HH:MM
  endTime: text("end_time"), // HH:MM
  location: text("location"),
  notes: text("notes"),
  reminderMinutes: integer("reminder_minutes").default(60),
  priority: text("priority").default("medium"), // high, medium, low
  status: text("status").notNull().default("active"), // active, completed, dismissed
  conversationId: integer("conversation_id"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type ScheduleItem = typeof scheduleItems.$inferSelect;
export const insertScheduleItemSchema = createInsertSchema(scheduleItems).omit({ id: true, createdAt: true });
export type InsertScheduleItem = z.infer<typeof insertScheduleItemSchema>;

// Agent system prompt builder
export function buildAgentChatPrompt(agent: PlatformAgent): string {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toTimeString().split(" ")[0].substring(0, 5);
  return `You are "${agent.name}" — an AI agent assistant. ${agent.description || ""}

Today's date: ${today}, Current time: ${now}

When the user's message contains a request that maps to one of your capabilities, extract the action as a JSON block wrapped in \`\`\`json ... \`\`\`. You can include MULTIPLE json blocks if the request implies multiple actions.

Available actions: ${agent.capabilities}

JSON formats:
- Event: {"action": "create_event", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "endTime": "HH:MM", "location": "...", "reminderMinutes": 60, "notes": "..."}
- Reminder: {"action": "set_reminder", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "notes": "..."}
- Alarm: {"action": "set_alarm", "title": "...", "date": "YYYY-MM-DD", "time": "HH:MM"}
- Task: {"action": "create_task", "title": "...", "dueDate": "YYYY-MM-DD", "dueTime": "HH:MM", "priority": "high|medium|low", "notes": "..."}
- CRM Query: {"action": "crm_query", "entity": "customers|leads|invoices|projects|tasks|tickets|dashboard", "filters": {"status": "...", "search": "...", "overdue": true}}
- Project Query: {"action": "project_query", "scope": "projects|members|assignments|messages|overview", "projectId": null|number, "filters": {"status": "...", "assignedTo": null|number, "overdue": true, "search": "..."}}
- Create Assignment: {"action": "create_assignment", "projectId": number, "title": "...", "assignedTo": number, "type": "one_time|recurring", "dueAt": "YYYY-MM-DDTHH:MM", "cronExpression": "...", "priority": "high|medium|low", "description": "..."}
- Project Message: {"action": "project_message", "projectId": number, "content": "...", "mentionsUserIds": [number]}

Rules:
- Always infer the date if the user says "today", "tomorrow", "next Monday", etc.
- Default reminder: 60 minutes before unless specified.
- ALWAYS respond with BOTH the json block(s) AND a friendly human confirmation message.
- If the message is just conversation (no action needed), respond normally without json.

${agent.systemPrompt || ""}`;
}

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  name: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  title: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  role: true,
  content: true,
  model: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type ProviderKey = typeof providerKeys.$inferSelect;

// Helper: apply margin to base cost
export function applyMargin(baseCost: number, multiplier: number): number {
  return Math.round(baseCost * multiplier * 100) / 100;
}

// Login schema
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Register schema
export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6),
});

// Plans config
export const PLANS = {
  free: { name: "Free", credits: 10, price: 0, requests: 10 },
  starter: { name: "Starter", credits: 500, price: 9, requests: 500 },
  pro: { name: "Pro", credits: 2000, price: 29, requests: 2000 },
  enterprise: { name: "Enterprise", credits: 10000, price: 99, requests: 10000 },
} as const;

// Multi-provider model definitions
export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  cost: number;
  description: string;
  category: "search" | "chat" | "reasoning" | "code" | "creative";
}

export const MODELS: ModelDef[] = [
  // Perplexity (search-augmented)
  { id: "sonar", name: "Sonar", provider: "perplexity", cost: 0.5, description: "Fast search-augmented chat", category: "search" },
  { id: "sonar-pro", name: "Sonar Pro", provider: "perplexity", cost: 1, description: "Advanced search with deeper reasoning", category: "search" },
  { id: "sonar-reasoning", name: "Sonar Reasoning", provider: "perplexity", cost: 2, description: "Multi-step reasoning with search", category: "reasoning" },
  { id: "sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "perplexity", cost: 3, description: "Best reasoning with search", category: "reasoning" },
  // Anthropic
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic", cost: 1, description: "Fast, balanced intelligence", category: "chat" },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", cost: 3, description: "Most capable for complex tasks", category: "reasoning" },
  { id: "claude-haiku-3.5", name: "Claude Haiku 3.5", provider: "anthropic", cost: 0.3, description: "Fastest and cheapest", category: "chat" },
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", cost: 1, description: "Flagship multimodal model", category: "chat" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", cost: 0.3, description: "Fast and affordable", category: "chat" },
  { id: "o1", name: "o1", provider: "openai", cost: 5, description: "Advanced reasoning model", category: "reasoning" },
  { id: "o3-mini", name: "o3-mini", provider: "openai", cost: 2, description: "Efficient reasoning", category: "reasoning" },
  // Google
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", cost: 1.5, description: "Most capable Gemini", category: "reasoning" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", cost: 0.3, description: "Fast and efficient", category: "chat" },
];

export const MODEL_COSTS: Record<string, number> = Object.fromEntries(
  MODELS.map((m) => [m.id, m.cost])
);

// Media generation costs (credits per generation)
export const MEDIA_COSTS = {
  "image-standard": 5,    // DALL-E 3 standard (1024x1024)
  "image-hd": 8,          // DALL-E 3 HD (1792x1024)
  "document-pdf": 3,      // AI-generated document
  "document-docx": 3,     // AI-generated document  
  "video-placeholder": 0, // Coming soon
} as const;

export type MediaType = "image" | "document" | "video";

export const PROVIDERS = [
  { id: "perplexity", name: "Perplexity", color: "#01696F" },
  { id: "anthropic", name: "Anthropic", color: "#D97757" },
  { id: "openai", name: "OpenAI", color: "#10A37F" },
  { id: "google", name: "Google", color: "#4285F4" },
] as const;

// Agent tool definitions
export interface AgentTool {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  creditMultiplier: number; // extra cost multiplier (1 = no extra)
}

export const AGENT_TOOLS: AgentTool[] = [
  { id: "search", name: "Web Search", description: "Search the web for current information and cite sources", icon: "Globe", creditMultiplier: 1.5 },
  { id: "document", name: "Document Generator", description: "Generate reports, summaries, and structured documents", icon: "FileText", creditMultiplier: 2 },
  { id: "code", name: "Code Assistant", description: "Write, analyze, and debug code with explanations", icon: "Code", creditMultiplier: 1.5 },
  { id: "analyze", name: "Data Analyzer", description: "Analyze data, create charts descriptions, and find insights", icon: "BarChart3", creditMultiplier: 2 },
  { id: "creative", name: "Creative Writer", description: "Generate creative content, brainstorm ideas, and write copy", icon: "Sparkles", creditMultiplier: 1.5 },
  { id: "timeline", name: "Timeline Planner", description: "Calendar-aware planning for books, marketing, and personal development with real holiday data", icon: "CalendarDays", creditMultiplier: 2 },
];

// Calendar events table (holidays, observances, marketing dates)
export const calendarEvents = sqliteTable("calendar_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD for multi-day events
  region: text("region").notNull().default("global"), // "global", "US", "IL", "UK", etc.
  category: text("category").notNull().default("holiday"), // holiday, religious, marketing, cultural, business, personal
  subcategory: text("subcategory"), // jewish, christian, islamic, federal, awareness, shopping, etc.
  importance: integer("importance").notNull().default(2), // 1=major, 2=standard, 3=minor
  description: text("description"),
  tags: text("tags"), // JSON array of tags for matching
  isRecurring: integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  recurringRule: text("recurring_rule"), // "yearly-fixed", "yearly-floating", "jewish-calendar", etc.
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type CalendarEvent = typeof calendarEvents.$inferSelect;

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

// Season definitions
export const SEASONS: Record<string, { months: number[]; name: string; hemisphere: string }> = {
  "spring-north": { months: [3, 4, 5], name: "Spring", hemisphere: "north" },
  "summer-north": { months: [6, 7, 8], name: "Summer", hemisphere: "north" },
  "fall-north": { months: [9, 10, 11], name: "Fall", hemisphere: "north" },
  "winter-north": { months: [12, 1, 2], name: "Winter", hemisphere: "north" },
};

// Timeline context interface used by AI prompts
export interface TimelineContext {
  currentDate: string;
  targetDate?: string;
  dateRange?: { start: string; end: string };
  season: string;
  upcomingHolidays: { name: string; date: string; daysAway: number; category: string }[];
  recentHolidays: { name: string; date: string; daysAgo: number; category: string }[];
  monthContext: string;
  quarterContext: string;
  relevantEvents: CalendarEvent[];
}

// === AI RULE ENGINE ===

// Condition types for the rule engine
export type RuleConditionType = "calendar" | "topic" | "user_plan" | "user_role" | "model" | "provider" | "tool" | "time_of_day" | "day_of_week" | "custom";

// A single condition within a rule
export interface RuleCondition {
  type: RuleConditionType;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "in" | "not_in" | "gt" | "lt" | "between" | "near_date" | "regex";
  field: string;       // e.g., "message", "plan", "model", "holiday.name", "season"
  value: string;       // the comparison value (JSON array for "in"/"not_in")
  metadata?: string;   // extra config, e.g., days threshold for near_date
}

// What happens when rule fires
export interface RuleAction {
  type: "inject_system_prompt" | "inject_user_context" | "modify_temperature" | "force_model" | "add_disclaimer" | "block_request";
  value: string;       // the prompt text, model id, temperature, or block reason
  position?: "before" | "after" | "replace"; // where to inject (default: before)
}

// AI Rules table
export const aiRules = sqliteTable("ai_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // Conditions (JSON array of RuleCondition)
  conditions: text("conditions").notNull().default("[]"),
  conditionLogic: text("condition_logic").notNull().default("AND"), // "AND" or "OR"
  // Actions (JSON array of RuleAction)
  actions: text("actions").notNull().default("[]"),
  // Rule metadata
  priority: integer("priority").notNull().default(50), // 1=highest, 100=lowest
  category: text("category").notNull().default("general"), // calendar, topic, user, safety, quality
  // Targeting
  appliesTo: text("applies_to").notNull().default("all"), // "all", "chat", "api", "tool:timeline", etc.
  // Status
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Audit
  createdBy: text("created_by").default("system"), // "system" or admin email
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type AiRule = typeof aiRules.$inferSelect;

export const insertAiRuleSchema = createInsertSchema(aiRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiRule = z.infer<typeof insertAiRuleSchema>;

// Rule evaluation result
export interface RuleEvalResult {
  ruleId: number;
  ruleName: string;
  priority: number;
  actions: RuleAction[];
  matchedConditions: string[]; // human-readable descriptions of what matched
}

// === USER TIMELINE EVENTS ===
// Every chat interaction creates a timeline event, building a "story arc" per user

export const userEvents = sqliteTable("user_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  conversationId: integer("conversation_id"),
  messageId: integer("message_id"),
  // What happened
  topic: text("topic").notNull(),           // short topic label: "Book Writing", "Marketing Plan"
  summary: text("summary").notNull(),       // 1-2 sentence summary of the interaction
  category: text("category").notNull().default("general"), // book, marketing, personal, code, research, general
  subcategory: text("subcategory"),         // e.g., "chapter-outline", "campaign-planning"
  // Progress tracking
  phase: text("phase"),                     // "discovery", "planning", "execution", "review", "completion"
  milestone: text("milestone"),             // "Started book outline", "Completed chapter 3", null if not a milestone
  progressPct: integer("progress_pct"),     // 0-100 if project has trackable progress
  // Sentiment & quality
  sentiment: text("sentiment").default("neutral"), // positive, neutral, negative, frustrated
  complexity: integer("complexity").default(2),     // 1=simple, 2=moderate, 3=complex
  // Context linkage
  toolUsed: text("tool_used"),              // agent tool used if any
  model: text("model"),                     // model used
  creditsUsed: real("credits_used").default(0),
  tags: text("tags"),                       // JSON array of extracted tags
  // Metadata
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type UserEvent = typeof userEvents.$inferSelect;

export const insertUserEventSchema = createInsertSchema(userEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertUserEvent = z.infer<typeof insertUserEventSchema>;

// Story arc summary for a user - computed from their events
export interface UserStoryArc {
  userId: number;
  username: string;
  // Overview
  totalEvents: number;
  firstEventDate: string;
  lastEventDate: string;
  activeDays: number;
  // Topic breakdown
  topTopics: { topic: string; count: number; lastSeen: string }[];
  // Progress arcs (ongoing projects)
  activeProjects: {
    topic: string;
    category: string;
    phase: string;
    progressPct: number;
    eventCount: number;
    lastActivity: string;
    milestones: string[];
  }[];
  // Recent events for context
  recentEvents: UserEvent[];
  // Sentiment trend
  sentimentTrend: { date: string; sentiment: string }[];
  // Narrative summary (for AI injection)
  narrativeSummary: string;
}

// === ARTIFACTS (generated files from tools) ===
export const artifacts = sqliteTable("artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  conversationId: integer("conversation_id"),
  messageId: integer("message_id"),
  // File info
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size: integer("size").notNull().default(0),
  path: text("path").notNull(), // server path
  url: text("url").notNull(),   // /api/artifacts/:filename
  // Metadata
  artifactType: text("artifact_type").notNull().default("file"), // file, code_output, web_snapshot, chart
  description: text("description"),
  metadata: text("metadata"), // JSON - extra info
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type Artifact = typeof artifacts.$inferSelect;
export const insertArtifactSchema = createInsertSchema(artifacts).omit({ id: true, createdAt: true });
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;

// === AGENT TOOLS CONFIG (admin-managed) ===
export const agentToolsConfig = sqliteTable("agent_tools_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: text("tool_id").notNull().unique(), // run_code, browse_web, etc.
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("Zap"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  creditMultiplier: real("credit_multiplier").notNull().default(1.5),
  maxExecutionTime: integer("max_execution_time").notNull().default(30), // seconds
  maxCallsPerRequest: integer("max_calls_per_request").notNull().default(3),
  customInstructions: text("custom_instructions"), // injected into system prompt when tool is used
  inputSchema: text("input_schema"), // JSON — expected input format
  config: text("config"), // JSON — tool-specific settings
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

export type AgentToolConfig = typeof agentToolsConfig.$inferSelect;
export const insertAgentToolConfigSchema = createInsertSchema(agentToolsConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentToolConfig = z.infer<typeof insertAgentToolConfigSchema>;

// === AGENT TOOL RULES (conditions bound to tools) ===
export const agentToolRules = sqliteTable("agent_tool_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: text("tool_id").notNull(), // FK to agent_tools_config.tool_id
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull().default("instruction"), // instruction, guard, transform, restrict
  condition: text("condition"), // JSON — when this rule triggers: { field, operator, value }
  action: text("action").notNull(), // The instruction/guard text or transform logic
  priority: integer("priority").notNull().default(10),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  scope: text("scope").notNull().default("all"), // all, free, pro, enterprise, or specific user plan
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type AgentToolRule = typeof agentToolRules.$inferSelect;
export const insertAgentToolRuleSchema = createInsertSchema(agentToolRules).omit({ id: true, createdAt: true });
export type InsertAgentToolRule = z.infer<typeof insertAgentToolRuleSchema>;

// === TOOL EXECUTION TYPES ===

// Tool call request from AI agent
export interface ToolCall {
  id: string;
  tool: string;
  input: Record<string, any>;
}

// Tool call result
export interface ToolResult {
  toolCallId: string;
  tool: string;
  success: boolean;
  output: string;
  error?: string;
  artifacts?: { filename: string; url: string; mimetype: string }[];
  duration?: number;
}

// Agent step (one turn in the orchestration loop)
export interface AgentStep {
  stepNumber: number;
  type: "thinking" | "tool_call" | "tool_result" | "response";
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: string;
}

// Default tool configs (used to seed the DB)
export const DEFAULT_AGENT_TOOLS: InsertAgentToolConfig[] = [
  { toolId: "run_code", name: "Run Code", description: "Execute Python or JavaScript code in a sandboxed environment", icon: "Terminal", creditMultiplier: 2, maxExecutionTime: 30, maxCallsPerRequest: 3, enabled: true, sortOrder: 1, customInstructions: "Always validate inputs before execution. Never execute code that accesses the network or filesystem outside the sandbox." },
  { toolId: "browse_web", name: "Browse Web", description: "Fetch and read web pages, extract content from URLs", icon: "Globe", creditMultiplier: 1.5, maxExecutionTime: 15, maxCallsPerRequest: 3, enabled: true, sortOrder: 2, customInstructions: "Only fetch publicly accessible URLs. Summarize content rather than returning raw HTML." },
  { toolId: "generate_file", name: "Create File", description: "Generate PDF, Word, PowerPoint, or CSV documents", icon: "FileOutput", creditMultiplier: 2.5, maxExecutionTime: 20, maxCallsPerRequest: 2, enabled: true, sortOrder: 3, customInstructions: "Always use proper formatting. Include a table of contents for long documents. Structure content with headers." },
  { toolId: "search_web", name: "Web Search", description: "Search the web for current information using Perplexity", icon: "Search", creditMultiplier: 1.5, maxExecutionTime: 10, maxCallsPerRequest: 3, enabled: true, sortOrder: 4, customInstructions: "Cite sources when presenting search results. Prefer recent, authoritative sources." },
  { toolId: "analyze_data", name: "Analyze Data", description: "Process data, generate charts, find insights", icon: "BarChart3", creditMultiplier: 2, maxExecutionTime: 30, maxCallsPerRequest: 2, enabled: true, sortOrder: 5, customInstructions: "Always explain methodology. Show key statistics first, then detailed breakdowns." },
];

// Default tool rules (seeded)
export const DEFAULT_AGENT_TOOL_RULES: InsertAgentToolRule[] = [
  { toolId: "run_code", name: "No Network Access", ruleType: "guard", action: "Block any code that imports networking libraries (requests, urllib, http, fetch) or attempts to connect to external servers.", priority: 1, enabled: true, scope: "all" },
  { toolId: "run_code", name: "Free Plan Code Limit", ruleType: "restrict", action: "Limit code execution to 10 seconds and 100 lines for free plan users.", priority: 5, enabled: true, scope: "free" },
  { toolId: "browse_web", name: "Safe Browsing", ruleType: "guard", action: "Only allow fetching from HTTPS URLs. Block known malicious domains and internal/private IP ranges.", priority: 1, enabled: true, scope: "all" },
  { toolId: "generate_file", name: "File Size Limit", ruleType: "restrict", action: "Generated files must not exceed 10MB. Warn the user if content is very large.", priority: 5, enabled: true, scope: "all" },
  { toolId: "search_web", name: "Search Rate Limit", ruleType: "restrict", action: "Maximum 5 searches per conversation for free plan users.", priority: 5, enabled: true, scope: "free" },
  { toolId: "analyze_data", name: "Data Privacy", ruleType: "instruction", action: "Never log or store raw user data. Process in memory only and return aggregated results.", priority: 1, enabled: true, scope: "all" },
];

// Hardcoded fallback REAL_TOOLS (used if DB not yet seeded)
export const REAL_TOOLS: AgentTool[] = [
  { id: "run_code", name: "Run Code", description: "Execute Python or JavaScript code in a sandboxed environment", icon: "Terminal", creditMultiplier: 2 },
  { id: "browse_web", name: "Browse Web", description: "Fetch and read web pages, extract content from URLs", icon: "Globe", creditMultiplier: 1.5 },
  { id: "generate_file", name: "Create File", description: "Generate PDF, Word, PowerPoint, or CSV documents", icon: "FileOutput", creditMultiplier: 2.5 },
  { id: "search_web", name: "Web Search", description: "Search the web for current information using Perplexity", icon: "Search", creditMultiplier: 1.5 },
  { id: "analyze_data", name: "Analyze Data", description: "Process data, generate charts, find insights", icon: "BarChart3", creditMultiplier: 2 },
];

// Build dynamic system prompt from DB tool configs + rules
export function buildAgentSystemPrompt(tools: AgentToolConfig[], rules: AgentToolRule[]): string {
  const enabledTools = tools.filter(t => t.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  if (enabledTools.length === 0) return "You are a helpful AI assistant.";

  let prompt = `You are an AI assistant with real tool execution capabilities. You can:\n\n`;
  enabledTools.forEach((tool, i) => {
    prompt += `${i + 1}. **${tool.toolId}** - ${tool.description}\n`;
  });

  prompt += `\nWhen you need to use a tool, respond with a JSON tool call block:\n\`\`\`tool_call\n{"tool": "tool_name", "input": {"key": "value"}}\n\`\`\`\n\n`;

  prompt += `Tool input formats:\n`;
  enabledTools.forEach(tool => {
    if (tool.inputSchema) {
      prompt += `- ${tool.toolId}: ${tool.inputSchema}\n`;
    } else {
      // Default schemas
      const defaults: Record<string, string> = {
        run_code: '{"language": "python"|"javascript", "code": "..."}',
        browse_web: '{"url": "https://...", "extract": "text"|"summary"|"links"}',
        generate_file: '{"format": "pdf"|"csv"|"html"|"txt"|"json"|"md", "title": "...", "content": "..."}',
        search_web: '{"query": "search terms"}',
        analyze_data: '{"task": "description", "data": "inline data"}',
      };
      prompt += `- ${tool.toolId}: ${defaults[tool.toolId] || '{"input": "..."}'}\n`;
    }
  });

  // Add tool-specific custom instructions
  const toolInstructions = enabledTools.filter(t => t.customInstructions).map(t => `- **${t.name}**: ${t.customInstructions}`);
  if (toolInstructions.length > 0) {
    prompt += `\nTool-specific instructions:\n${toolInstructions.join("\n")}\n`;
  }

  // Add active rules
  const activeRules = rules.filter(r => r.enabled).sort((a, b) => a.priority - b.priority);
  if (activeRules.length > 0) {
    prompt += `\nActive rules:\n`;
    activeRules.forEach(rule => {
      const label = rule.ruleType === "guard" ? "🛡️ GUARD" : rule.ruleType === "restrict" ? "⚠️ RESTRICT" : rule.ruleType === "transform" ? "🔄 TRANSFORM" : "📋 INSTRUCTION";
      prompt += `- [${label}] ${rule.name}: ${rule.action}${rule.scope !== "all" ? ` (applies to: ${rule.scope} plan)` : ""}\n`;
    });
  }

  prompt += `\nAfter receiving a tool result, you can:\n- Use the result to answer the user's question\n- Call another tool if needed (multi-step)\n- Generate a final response\n\nImportant:\n- Think step by step before using tools\n- Use the simplest tool that accomplishes the task\n- Always explain what you're doing and what the result means\n- If a tool fails, try an alternative approach\n- Always produce a final text response after tool execution\n\nContext: The user's story arc and calendar context may be injected. Use them for personalization.\n`;

  return prompt;
}

// Legacy static prompt (fallback)
export const AGENT_SYSTEM_PROMPT = `You are an AI assistant with real tool execution capabilities. You can:

1. **run_code** - Execute Python or JavaScript code.
2. **browse_web** - Fetch and read web pages.
3. **generate_file** - Create documents (PDF, CSV, HTML, TXT, JSON, MD).
4. **search_web** - Search the internet for current information.
5. **analyze_data** - Process uploaded data, generate insights.

When you need to use a tool, respond with a JSON tool call block:
\`\`\`tool_call
{"tool": "tool_name", "input": {"key": "value"}}
\`\`\`

Tool input formats:
- run_code: {"language": "python"|"javascript", "code": "..."}
- browse_web: {"url": "https://...", "extract": "text"|"summary"|"links"}
- generate_file: {"format": "pdf"|"csv"|"html"|"txt"|"json"|"md", "title": "...", "content": "..."}
- search_web: {"query": "search terms"}
- analyze_data: {"task": "description of analysis", "data": "inline data"}

After receiving a tool result, you can use it to answer, call another tool, or produce a final response.
Think step by step. Always explain what you're doing. If a tool fails, try an alternative.
`;

// === TELEGRAM BOT RELAY ===

// Telegram bot configuration (one per agent)
export const telegramBots = sqliteTable("telegram_bots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(), // which platform agent this bot represents
  botToken: text("bot_token").notNull(), // Telegram bot API token from @BotFather
  botUsername: text("bot_username"), // @johnny_tendit_bot etc.
  webhookSecret: text("webhook_secret"), // random secret for webhook verification
  ownerTelegramChatId: text("owner_telegram_chat_id"), // admin/owner's Telegram chat ID (for relay)
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type TelegramBot = typeof telegramBots.$inferSelect;
export const insertTelegramBotSchema = createInsertSchema(telegramBots).omit({ id: true, createdAt: true });
export type InsertTelegramBot = z.infer<typeof insertTelegramBotSchema>;

// Linked Telegram accounts — maps Telegram users to web platform users
export const telegramLinks = sqliteTable("telegram_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramChatId: text("telegram_chat_id").notNull(), // Telegram chat_id (string for safety)
  telegramUsername: text("telegram_username"), // @username if available
  telegramFirstName: text("telegram_first_name"),
  userId: integer("user_id"), // linked web platform user (null = unlinked Telegram-only contact)
  botId: integer("bot_id").notNull(), // which bot this link is through
  role: text("role").notNull().default("contact"), // "owner" = admin, "user" = linked platform user, "contact" = external person
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  linkedAt: text("linked_at").notNull().default(new Date().toISOString()),
});

export type TelegramLink = typeof telegramLinks.$inferSelect;
export const insertTelegramLinkSchema = createInsertSchema(telegramLinks).omit({ id: true, linkedAt: true });
export type InsertTelegramLink = z.infer<typeof insertTelegramLinkSchema>;

// Relay messages — log of all messages passing through the bot
export const relayMessages = sqliteTable("relay_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  botId: integer("bot_id").notNull(),
  direction: text("direction").notNull(), // "telegram_in" | "telegram_out" | "web_in" | "web_out"
  telegramChatId: text("telegram_chat_id"),
  userId: integer("user_id"), // web platform user if applicable
  senderName: text("sender_name"),
  originalMessage: text("original_message").notNull(),
  processedMessage: text("processed_message"), // AI-enhanced version if applicable
  aiSummary: text("ai_summary"), // AI-generated summary for relay notifications
  messageType: text("message_type").notNull().default("text"), // text, action, notification, system
  relatedRequestId: integer("related_request_id"), // if an agent action was extracted
  metadata: text("metadata"), // JSON — extra data (telegram message_id, etc.)
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

export type RelayMessage = typeof relayMessages.$inferSelect;
export const insertRelayMessageSchema = createInsertSchema(relayMessages).omit({ id: true, createdAt: true });
export type InsertRelayMessage = z.infer<typeof insertRelayMessageSchema>;

// Admin credentials
export const ADMIN_EMAIL = "admin@aiproxy.io";
export const ADMIN_PASSWORD = "admin2026!";

// ===== CRM Integration =====
export const crmConnections = sqliteTable("crm_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "PerfexCRM"
  type: text("type").notNull().default("perfex"), // perfex, hubspot, etc.
  apiUrl: text("api_url").notNull(), // e.g. "https://massive-group.io/crm"
  apiKey: text("api_key").notNull(), // API key for authenticating with CRM
  webhookSecret: text("webhook_secret").notNull(), // secret for incoming webhooks
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  syncConfig: text("sync_config"), // JSON: which entities to sync
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmCustomers = sqliteTable("crm_customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(), // ID in PerfexCRM
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  status: text("status"), // active, inactive
  totalInvoiced: text("total_invoiced"),
  metadata: text("metadata"), // JSON extra fields
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmLeads = sqliteTable("crm_leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  status: text("status"),
  source: text("source"),
  assignedTo: text("assigned_to"),
  value: text("value"),
  lastContact: text("last_contact"),
  metadata: text("metadata"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmInvoices = sqliteTable("crm_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  number: text("number"),
  date: text("date"),
  dueDate: text("due_date"),
  total: text("total"),
  amountPaid: text("amount_paid"),
  status: text("status"), // paid, unpaid, overdue, partially_paid, cancelled
  currency: text("currency"),
  items: text("items"), // JSON
  metadata: text("metadata"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmProjects = sqliteTable("crm_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name"),
  customerName: text("customer_name"),
  status: text("status"), // not_started, in_progress, on_hold, cancelled, finished
  startDate: text("start_date"),
  deadline: text("deadline"),
  progress: integer("progress"),
  billingType: text("billing_type"),
  totalCost: text("total_cost"),
  metadata: text("metadata"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmTasks = sqliteTable("crm_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name"),
  projectName: text("project_name"),
  assignedTo: text("assigned_to"),
  status: text("status"), // not_started, in_progress, testing, awaiting_feedback, complete
  priority: text("priority"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  metadata: text("metadata"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const crmTickets = sqliteTable("crm_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectionId: integer("connection_id").notNull(),
  externalId: text("external_id").notNull(),
  subject: text("subject"),
  customerName: text("customer_name"),
  department: text("department"),
  status: text("status"), // open, in_progress, answered, on_hold, closed
  priority: text("priority"),
  lastReply: text("last_reply"),
  metadata: text("metadata"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// CRM insert schemas and types
export const insertCrmConnectionSchema = createInsertSchema(crmConnections).omit({ id: true, createdAt: true });
export type InsertCrmConnection = z.infer<typeof insertCrmConnectionSchema>;
export type CrmConnection = typeof crmConnections.$inferSelect;

export const insertCrmCustomerSchema = createInsertSchema(crmCustomers).omit({ id: true });
export type InsertCrmCustomer = z.infer<typeof insertCrmCustomerSchema>;
export type CrmCustomer = typeof crmCustomers.$inferSelect;

export const insertCrmLeadSchema = createInsertSchema(crmLeads).omit({ id: true });
export type InsertCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeads.$inferSelect;

export const insertCrmInvoiceSchema = createInsertSchema(crmInvoices).omit({ id: true });
export type InsertCrmInvoice = z.infer<typeof insertCrmInvoiceSchema>;
export type CrmInvoice = typeof crmInvoices.$inferSelect;

export const insertCrmProjectSchema = createInsertSchema(crmProjects).omit({ id: true });
export type InsertCrmProject = z.infer<typeof insertCrmProjectSchema>;
export type CrmProject = typeof crmProjects.$inferSelect;

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({ id: true });
export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;

export const insertCrmTicketSchema = createInsertSchema(crmTickets).omit({ id: true });
export type InsertCrmTicket = z.infer<typeof insertCrmTicketSchema>;
export type CrmTicket = typeof crmTickets.$inferSelect;

// =====================================================
// PROJECT MANAGEMENT MODULE
// =====================================================

// Projects — core entity for team collaboration
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  clientId: integer("client_id"), // optional link to crm_customers.id
  ownerId: integer("owner_id").notNull(), // tendit user id
  status: text("status").notNull().default("planning"), // planning, active, on_hold, completed, cancelled
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  startDate: text("start_date"), // YYYY-MM-DD
  deadline: text("deadline"), // YYYY-MM-DD
  budget: real("budget"),
  agentId: integer("agent_id"), // platform_agents.id (defaults to Johnny)
  telegramTopic: text("telegram_topic"), // optional forum topic id for Telegram sync
  color: text("color").default("#0d9488"), // visual accent
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});
export type Project = typeof projects.$inferSelect;
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Project members
export const projectMembers = sqliteTable("project_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("contributor"), // owner, manager, contributor, viewer
  addedAt: text("added_at").notNull().default(new Date().toISOString()),
});
export type ProjectMember = typeof projectMembers.$inferSelect;
export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({ id: true, addedAt: true });
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;

// User invites (for inviting members by email before they have an account)
export const userInvites = sqliteTable("user_invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: integer("invited_by").notNull(), // user id
  projectId: integer("project_id"), // if null, just a platform invite
  role: text("role").default("contributor"),
  status: text("status").notNull().default("pending"), // pending, accepted, expired
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type UserInvite = typeof userInvites.$inferSelect;
export const insertUserInviteSchema = createInsertSchema(userInvites).omit({ id: true, createdAt: true });
export type InsertUserInvite = z.infer<typeof insertUserInviteSchema>;

// Project assignments — tasks with calendar/cron support
export const projectAssignments = sqliteTable("project_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  assignedTo: integer("assigned_to").notNull(), // user id
  createdBy: integer("created_by").notNull(), // user id
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("one_time"), // one_time, recurring
  dueAt: text("due_at"), // ISO timestamp for one-time
  cronExpression: text("cron_expression"), // for recurring
  cronTimezone: text("cron_timezone").default("Asia/Jerusalem"),
  nextRunAt: text("next_run_at"), // computed next firing time
  lastRunAt: text("last_run_at"),
  status: text("status").notNull().default("pending"), // pending, in_progress, done, overdue, cancelled
  priority: text("priority").notNull().default("medium"),
  reminderMinutes: integer("reminder_minutes").default(30),
  reminderSentAt: text("reminder_sent_at"),
  completedAt: text("completed_at"),
  scheduleItemId: integer("schedule_item_id"), // links to platform calendar
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ProjectAssignment = typeof projectAssignments.$inferSelect;
export const insertProjectAssignmentSchema = createInsertSchema(projectAssignments).omit({ id: true, createdAt: true, nextRunAt: true, lastRunAt: true, reminderSentAt: true, completedAt: true });
export type InsertProjectAssignment = z.infer<typeof insertProjectAssignmentSchema>;

// Project chat messages
export const projectMessages = sqliteTable("project_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id"), // null if from system/AI
  role: text("role").notNull().default("user"), // user, assistant, system
  content: text("content").notNull(),
  mentionsUserIds: text("mentions_user_ids"), // JSON array of user ids
  attachments: text("attachments"), // JSON array of {name, url}
  source: text("source").notNull().default("web"), // web, telegram, ai
  telegramMessageId: text("telegram_message_id"),
  // Part IX voice + ack extensions
  audioUrl: text("audio_url"),
  transcript: text("transcript"),
  durationSec: integer("duration_sec"),
  isAck: integer("is_ack", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ProjectMessage = typeof projectMessages.$inferSelect;
export const insertProjectMessageSchema = createInsertSchema(projectMessages).omit({ id: true, createdAt: true });
export type InsertProjectMessage = z.infer<typeof insertProjectMessageSchema>;

// Notifications (in-app bell, free)
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // assignment_due, assignment_overdue, project_invite, mention, project_message
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"), // hash route inside app
  projectId: integer("project_id"),
  assignmentId: integer("assignment_id"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type Notification = typeof notifications.$inferSelect;
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// =====================================================
// PART VIII — MANAGED SESSIONS (Johnny's Hands on the Logged-In Web)
// =====================================================

// Managed Sessions — a real browser session logged in as a user on a site.
export const managedSessions = sqliteTable("managed_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(), // owner of this session (tendit user)
  name: text("name").notNull(),
  site: text("site").notNull(), // fiverr | alibaba | other
  runtime: text("runtime").notNull().default("mock"), // mock | local_chrome | browserless
  status: text("status").notNull().default("active"), // active | paused | expired
  accountLabel: text("account_label"), // "Roy personal Fiverr", etc.
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  lastUsedAt: text("last_used_at"),
});
export type ManagedSession = typeof managedSessions.$inferSelect;
export const insertManagedSessionSchema = createInsertSchema(managedSessions).omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertManagedSession = z.infer<typeof insertManagedSessionSchema>;

// Session ↔ profile entity mapping (which legal entity owns the credentials).
export const sessionAccounts = sqliteTable("session_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  profileEntity: text("profile_entity").notNull(), // roy_personal | massive_group | a3_academy | orthocare | launchkit
  credentialsRef: text("credentials_ref"), // human-readable label only; NEVER actual passwords
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type SessionAccount = typeof sessionAccounts.$inferSelect;
export const insertSessionAccountSchema = createInsertSchema(sessionAccounts).omit({ id: true, createdAt: true });
export type InsertSessionAccount = z.infer<typeof insertSessionAccountSchema>;

// Pending actions awaiting manager approval before runtime executes them.
export const pendingActions = sqliteTable("pending_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  actionType: text("action_type").notNull(), // send_message | request_quote | other
  payload: text("payload").notNull(), // JSON-encoded action payload
  reasoning: text("reasoning"), // Johnny's stated reason for proposing this action
  pageStateHash: text("page_state_hash"), // hash of the page Johnny was looking at
  screenshotUrl: text("screenshot_url"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | executed | failed
  createdBy: text("created_by").notNull(), // "johnny" or numeric user id stringified
  reminderSentAt: text("reminder_sent_at"), // tracks the cron "still waiting" ping
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  expiresAt: text("expires_at"),
});
export type PendingAction = typeof pendingActions.$inferSelect;
export const insertPendingActionSchema = createInsertSchema(pendingActions).omit({ id: true, createdAt: true, reminderSentAt: true });
export type InsertPendingAction = z.infer<typeof insertPendingActionSchema>;

// Manager decisions on pending actions.
export const actionApprovals = sqliteTable("action_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actionId: integer("action_id").notNull(),
  approverId: integer("approver_id").notNull(),
  decision: text("decision").notNull(), // approve | edit | reject
  editedPayload: text("edited_payload"), // JSON if approver edited
  decisionNote: text("decision_note"),
  decidedAt: text("decided_at").notNull().default(new Date().toISOString()),
});
export type ActionApproval = typeof actionApprovals.$inferSelect;
export const insertActionApprovalSchema = createInsertSchema(actionApprovals).omit({ id: true, decidedAt: true });
export type InsertActionApproval = z.infer<typeof insertActionApprovalSchema>;

// Append-only audit log of everything that happened to an action.
export const actionAuditLog = sqliteTable("action_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actionId: integer("action_id").notNull(),
  event: text("event").notNull(), // created | approved | rejected | executed | failed
  beforeStateHash: text("before_state_hash"),
  afterStateHash: text("after_state_hash"),
  runtimeResponse: text("runtime_response"), // JSON-encoded result from the BrowserRuntime
  eventAt: text("event_at").notNull().default(new Date().toISOString()),
});
export type ActionAuditLog = typeof actionAuditLog.$inferSelect;
export const insertActionAuditLogSchema = createInsertSchema(actionAuditLog).omit({ id: true, eventAt: true });
export type InsertActionAuditLog = z.infer<typeof insertActionAuditLogSchema>;

// =====================================================
// PART IX — MULTI-PROJECT OPERATIONS LAYER
// (agents/assignments, milestones, credits ledger, packages, system queue, auth profiles)
// Note: existing tables `platform_agents` and `agent_assignments` predate this; here we
// add Part IX's own `agents` and `p9_agent_assignments` to avoid SQL table name collision.
// =====================================================

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  provider: text("provider").notNull(), // groq|openai|anthropic|sonar|ollama|local
  model: text("model").notNull(),
  capabilities: text("capabilities").notNull().default("[]"), // JSON array
  systemPrompt: text("system_prompt").notNull().default(""),
  status: text("status").notNull().default("active"), // active|paused
  // Part X — reuse agents table for arm AI managers (scope='arm')
  scope: text("scope").notNull().default("global"), // global | arm
  displayName: text("display_name"), // e.g. Shira/Maya/Eitan/Noa
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type Agent = typeof agents.$inferSelect;
export const insertAgentSchema = createInsertSchema(agents).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;

export const p9AgentAssignments = sqliteTable("p9_agent_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  projectId: integer("project_id"), // nullable: null = global default
  capability: text("capability").notNull(), // chat_reply | financial_modeling | exam_grading | ...
  priority: integer("priority").notNull().default(100),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type P9AgentAssignment = typeof p9AgentAssignments.$inferSelect;
export const insertP9AgentAssignmentSchema = createInsertSchema(p9AgentAssignments).omit({ id: true, createdAt: true });
export type InsertP9AgentAssignment = z.infer<typeof insertP9AgentAssignmentSchema>;

export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: text("due_date"), // ISO date
  status: text("status").notNull().default("locked"), // locked|ready|in_progress|done|skipped
  agentAssignmentId: integer("agent_assignment_id"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  completedAt: text("completed_at"),
  completedBy: integer("completed_by"),
});
export type Milestone = typeof milestones.$inferSelect;
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true, createdAt: true, completedAt: true, completedBy: true });
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

export const milestoneDeps = sqliteTable("milestone_deps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  milestoneId: integer("milestone_id").notNull(),
  dependsOnMilestoneId: integer("depends_on_milestone_id").notNull(),
});
export type MilestoneDep = typeof milestoneDeps.$inferSelect;
export const insertMilestoneDepSchema = createInsertSchema(milestoneDeps).omit({ id: true });
export type InsertMilestoneDep = z.infer<typeof insertMilestoneDepSchema>;

export const userCredits = sqliteTable("user_credits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  overdraftBalance: integer("overdraft_balance").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});
export type UserCredits = typeof userCredits.$inferSelect;
export const insertUserCreditsSchema = createInsertSchema(userCredits).omit({ id: true, updatedAt: true });
export type InsertUserCredits = z.infer<typeof insertUserCreditsSchema>;

export const projectCredits = sqliteTable("project_credits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  overdraftBalance: integer("overdraft_balance").notNull().default(0),
  overdraftCeiling: integer("overdraft_ceiling").notNull().default(500),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});
export type ProjectCredits = typeof projectCredits.$inferSelect;
export const insertProjectCreditsSchema = createInsertSchema(projectCredits).omit({ id: true, updatedAt: true });
export type InsertProjectCredits = z.infer<typeof insertProjectCreditsSchema>;

export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id"),
  userId: integer("user_id").notNull(),
  txnType: text("txn_type").notNull(), // debit|credit|overdraft_settle|refund
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  actionRef: text("action_ref"),
  stripeChargeId: text("stripe_charge_id"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type CreditLedger = typeof creditLedger.$inferSelect;
export const insertCreditLedgerSchema = createInsertSchema(creditLedger).omit({ id: true, createdAt: true });
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;

export const creditPackages = sqliteTable("credit_packages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceUsd: integer("price_usd").notNull(), // cents
  priceIls: integer("price_ils").notNull(), // agorot
  stripePriceId: text("stripe_price_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
});
export type CreditPackage = typeof creditPackages.$inferSelect;
export const insertCreditPackageSchema = createInsertSchema(creditPackages).omit({ id: true });
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;

export const systemCreditQueue = sqliteTable("system_credit_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  actionPayload: text("action_payload").notNull(), // JSON
  estimatedCredits: integer("estimated_credits").notNull().default(0),
  requestedAt: text("requested_at").notNull().default(new Date().toISOString()),
  status: text("status").notNull().default("awaiting"), // awaiting|approved|denied|executed
  approvedBy: integer("approved_by"),
  approvedAt: text("approved_at"),
  resultRef: text("result_ref"),
});
export type SystemCreditQueue = typeof systemCreditQueue.$inferSelect;
export const insertSystemCreditQueueSchema = createInsertSchema(systemCreditQueue).omit({ id: true, requestedAt: true, approvedAt: true });
export type InsertSystemCreditQueue = z.infer<typeof insertSystemCreditQueueSchema>;

export const authProfiles = sqliteTable("auth_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(), // groq|openai|anthropic|cloudflare|stripe|...
  entity: text("entity").notNull(), // roy_personal | massive_group | a3_academy | orthocare | launchkit
  credentialsRef: text("credentials_ref").notNull(), // label only — NEVER actual secrets
  dailyQuota: integer("daily_quota").notNull().default(0),
  dailyUsed: integer("daily_used").notNull().default(0),
  quotaResetAt: text("quota_reset_at").notNull().default(new Date().toISOString()),
  status: text("status").notNull().default("active"), // active|exhausted|disabled
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type AuthProfile = typeof authProfiles.$inferSelect;
export const insertAuthProfileSchema = createInsertSchema(authProfiles).omit({ id: true, createdAt: true, lastUsedAt: true });
export type InsertAuthProfile = z.infer<typeof insertAuthProfileSchema>;

// =====================================================
// PART X — PROJECT ARMS (functional sub-branches per project)
// Named AI managers (Shira/Maya/Eitan/Noa) with living docs, targets,
// and an approval-gated outbound flow. p10_ prefix avoids collisions.
// Reuses `agents` (scope='arm'), `pending_actions`, `credit_ledger`,
// `auth_profiles`, and Part IX voice infra.
// =====================================================

export const arms = sqliteTable("p10_arms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // kebab-case, unique within a project
  ownerUserId: integer("owner_user_id"), // human teammate; nullable until assigned
  armAgentId: integer("arm_agent_id").notNull(), // FK agents (scope='arm')
  visibility: text("visibility").notNull().default("owner_private"), // owner_private | project_public
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});
export type Arm = typeof arms.$inferSelect;
export const insertArmSchema = createInsertSchema(arms).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArm = z.infer<typeof insertArmSchema>;

export const armDocuments = sqliteTable("p10_arm_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  armId: integer("arm_id").notNull(),
  title: text("title").notNull(),
  currentVersionId: integer("current_version_id"), // FK arm_document_versions, nullable
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});
export type ArmDocument = typeof armDocuments.$inferSelect;
export const insertArmDocumentSchema = createInsertSchema(armDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArmDocument = z.infer<typeof insertArmDocumentSchema>;

export const armDocumentVersions = sqliteTable("p10_arm_document_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull().default(""), // markdown
  authorUserId: integer("author_user_id"),
  authorAgentId: integer("author_agent_id"),
  changeNote: text("change_note"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ArmDocumentVersion = typeof armDocumentVersions.$inferSelect;
export const insertArmDocumentVersionSchema = createInsertSchema(armDocumentVersions).omit({ id: true, createdAt: true });
export type InsertArmDocumentVersion = z.infer<typeof insertArmDocumentVersionSchema>;

export const armTargets = sqliteTable("p10_arm_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  armId: integer("arm_id").notNull(),
  name: text("name").notNull(),
  contactInfo: text("contact_info"), // JSON {email, phone, telegram, ...}
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ArmTarget = typeof armTargets.$inferSelect;
export const insertArmTargetSchema = createInsertSchema(armTargets).omit({ id: true, createdAt: true });
export type InsertArmTarget = z.infer<typeof insertArmTargetSchema>;

export const armTargetInstructions = sqliteTable("p10_arm_target_instructions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetId: integer("target_id").notNull(),
  generatedByAgentId: integer("generated_by_agent_id").notNull(),
  content: text("content").notNull().default(""), // markdown
  status: text("status").notNull().default("draft"), // draft | approved | sent | rejected
  pendingActionId: integer("pending_action_id"), // FK pending_actions (Part IX gate)
  approvedByUserId: integer("approved_by_user_id"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ArmTargetInstruction = typeof armTargetInstructions.$inferSelect;
export const insertArmTargetInstructionSchema = createInsertSchema(armTargetInstructions).omit({ id: true, createdAt: true, approvedAt: true });
export type InsertArmTargetInstruction = z.infer<typeof insertArmTargetInstructionSchema>;

export const armMessages = sqliteTable("p10_arm_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  armId: integer("arm_id").notNull(),
  role: text("role").notNull().default("user"), // user | assistant
  content: text("content").notNull().default(""),
  authorUserId: integer("author_user_id"), // user messages
  agentId: integer("agent_id"), // assistant messages
  audioUrl: text("audio_url"), // voice (reuses Part IX)
  transcript: text("transcript"),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ArmMessage = typeof armMessages.$inferSelect;
export const insertArmMessageSchema = createInsertSchema(armMessages).omit({ id: true, createdAt: true });
export type InsertArmMessage = z.infer<typeof insertArmMessageSchema>;

export const armActivityLog = sqliteTable("p10_arm_activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  armId: integer("arm_id").notNull(),
  agentId: integer("agent_id"),
  action: text("action").notNull(), // chat_reply | doc_edit | target_instruction_drafted | instruction_approved
  creditsCost: integer("credits_cost").notNull().default(0),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});
export type ArmActivityLog = typeof armActivityLog.$inferSelect;
export const insertArmActivityLogSchema = createInsertSchema(armActivityLog).omit({ id: true, createdAt: true });
export type InsertArmActivityLog = z.infer<typeof insertArmActivityLogSchema>;

// =====================================================
// Product Orders (Stripe Payment Links: FTO, Pitch Site)
// =====================================================
export const productOrders = sqliteTable("product_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productSku: text("product_sku").notNull(), // fto_patent_report | pitch_site_deck
  productName: text("product_name").notNull(),
  amountUsd: integer("amount_usd").notNull(), // cents
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("pending"), // pending | paid | refunded | failed
  notes: text("notes"), // free-text intake
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  paidAt: text("paid_at"),
});
export type ProductOrder = typeof productOrders.$inferSelect;
export const insertProductOrderSchema = createInsertSchema(productOrders).omit({ id: true, createdAt: true, paidAt: true });
export type InsertProductOrder = z.infer<typeof insertProductOrderSchema>;

// ============================================================================
// ACTIONS MARKETPLACE — generic framework for AI-proposed external actions
// ============================================================================

// action_catalog: registry of all available action types (publish_story, send_whatsapp, etc.)
// Seeded at startup. Each row defines an action SCHEMA (input fields, executor type).
export const actionCatalog = sqliteTable("action_catalog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),                 // e.g. "publish_story", "send_whatsapp"
  name: text("name").notNull(),                          // e.g. "Publish Story"
  description: text("description").notNull(),            // What this action does, shown to AI
  category: text("category").notNull(),                  // "content" | "messaging" | "crm" | "other"
  executorType: text("executor_type").notNull(),         // "http_webhook" | "wordpress" | "whatsapp" | "email"
  inputSchema: text("input_schema").notNull(),           // JSON Schema for inputs (validated)
  outputSchema: text("output_schema"),                   // JSON Schema for output (optional)
  requiresApproval: integer("requires_approval", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export type ActionCatalogEntry = typeof actionCatalog.$inferSelect;
export const insertActionCatalogSchema = createInsertSchema(actionCatalog).omit({ id: true, createdAt: true });
export type InsertActionCatalogEntry = z.infer<typeof insertActionCatalogSchema>;

// project_connections: per-project credentials/config for executing actions
// e.g. project 1 (Massive Group) has a "shirhadash_wp" connection with WP URL + token
export const projectConnections = sqliteTable("project_connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  slug: text("slug").notNull(),                          // e.g. "shirhadash_wp", "acme_whatsapp"
  label: text("label").notNull(),                        // human-readable: "Shirhadash WordPress"
  executorType: text("executor_type").notNull(),         // matches action_catalog.executorType
  config: text("config").notNull(),                      // JSON: { baseUrl, authType, token, ... } (encrypted at rest later)
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: integer("created_by").notNull(),            // userId
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});

export type ProjectConnection = typeof projectConnections.$inferSelect;
export const insertProjectConnectionSchema = createInsertSchema(projectConnections).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertProjectConnection = z.infer<typeof insertProjectConnectionSchema>;

// action_proposals: AI suggests an action — waits for human approval
export const actionProposals = sqliteTable("action_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  armId: integer("arm_id"),                              // which arm/agent proposed (nullable for direct calls)
  actionSlug: text("action_slug").notNull(),             // FK -> action_catalog.slug
  connectionId: integer("connection_id"),                // FK -> project_connections.id (nullable until chosen)
  proposedBy: integer("proposed_by").notNull(),          // userId of the chat user OR system
  proposedByAgent: text("proposed_by_agent"),            // e.g. "Shira", "Maya" (if AI proposed)
  input: text("input").notNull(),                        // JSON payload matching action_catalog.inputSchema
  reasoning: text("reasoning"),                          // why AI proposed this
  status: text("status").notNull().default("pending"),   // pending | approved | rejected | executed | failed
  approvedBy: integer("approved_by"),                    // userId who approved
  approvedAt: text("approved_at"),
  rejectedReason: text("rejected_reason"),
  executionId: integer("execution_id"),                  // FK -> action_executions.id (after execution)
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});

export type ActionProposal = typeof actionProposals.$inferSelect;
export const insertActionProposalSchema = createInsertSchema(actionProposals).omit({
  id: true, createdAt: true, approvedAt: true, executionId: true,
});
export type InsertActionProposal = z.infer<typeof insertActionProposalSchema>;

// action_executions: audit log of actually executed actions
export const actionExecutions = sqliteTable("action_executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  proposalId: integer("proposal_id").notNull(),
  actionSlug: text("action_slug").notNull(),
  connectionId: integer("connection_id").notNull(),
  request: text("request").notNull(),                    // JSON: actual HTTP request sent
  response: text("response"),                            // JSON: response (truncated if huge)
  statusCode: integer("status_code"),
  success: integer("success", { mode: "boolean" }).notNull(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  executedAt: text("executed_at").notNull().default("CURRENT_TIMESTAMP"),
});

export type ActionExecution = typeof actionExecutions.$inferSelect;
export const insertActionExecutionSchema = createInsertSchema(actionExecutions).omit({ id: true, executedAt: true });
export type InsertActionExecution = z.infer<typeof insertActionExecutionSchema>;

// Product catalog (single source of truth — Stripe Payment Link URLs)
export const PRODUCT_CATALOG: Record<string, {
  sku: string;
  name: string;
  description: string;
  priceUsd: number;
  stripePaymentLink: string;
  deliveryDays: number;
  highlights: string[];
}> = {
  fto_patent_report: {
    sku: "fto_patent_report",
    name: "FTO Patent Search Report",
    description: "Comprehensive Freedom-to-Operate analysis with prior art search and risk assessment for your innovation.",
    priceUsd: 497,
    stripePaymentLink: "https://buy.stripe.com/bJeeVc1CagED8PZ6s3gYU00",
    deliveryDays: 5,
    highlights: [
      "Prior-art search across USPTO, EPO, WIPO databases",
      "Independent-claim risk analysis (high/medium/low)",
      "Design-around opportunities and white-space mapping",
      "Executive PDF + raw search data delivered in 5 business days",
    ],
  },
  pitch_site_deck: {
    sku: "pitch_site_deck",
    name: "VC-Ready Pitch Site + Deck",
    description: "Investor-ready landing page + 12-slide pitch deck, delivered in 7 business days.",
    priceUsd: 1997,
    stripePaymentLink: "https://buy.stripe.com/4gMcN494C9cbfen7w7gYU01",
    deliveryDays: 7,
    highlights: [
      "Custom landing page hosted on your domain",
      "12-slide investor pitch deck (Sequoia-style narrative)",
      "Founder positioning + competitive moat copy",
      "2 revision rounds included, delivered in 7 business days",
    ],
  },
};
