import {
  type User, type InsertUser, users,
  type ApiKey, apiKeys,
  type Conversation, conversations,
  type Message, messages,
  type UsageLog, usageLogs,
  type ProviderKey, providerKeys,
  type PlatformSetting, platformSettings,
  type RateLimitRule, type InsertRateLimitRule, rateLimitRules,
  type CalendarEvent, type InsertCalendarEvent, calendarEvents,
  type AiRule, type InsertAiRule, aiRules,
  type Artifact, type InsertArtifact, artifacts,
  type PlatformAgent, type InsertPlatformAgent, platformAgents,
  type AgentAssignment, agentAssignments,
  type AgentRequest, type InsertAgentRequest, agentRequests,
  type ScheduleItem, type InsertScheduleItem, scheduleItems,
  type AgentToolConfig, type InsertAgentToolConfig, agentToolsConfig,
  type AgentToolRule, type InsertAgentToolRule, agentToolRules,
  DEFAULT_SETTINGS, DEFAULT_RATE_LIMITS,
  DEFAULT_AGENT_TOOLS, DEFAULT_AGENT_TOOL_RULES,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql, like, gte } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { password: string; role?: string }): Promise<User>;
  updateUserCredits(id: number, credits: number): Promise<void>;
  updateUserPlan(id: number, plan: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<void>;
  updateUserActive(id: number, isActive: boolean): Promise<void>;
  updateUserRole(id: number, role: string): Promise<void>;

  // Admin
  getAllUsers(search?: string): Promise<User[]>;
  getAdminStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalCreditsUsed: number;
    totalRequests: number;
    todayRequests: number;
    todayCreditsUsed: number;
    revenueEstimate: number;
  }>;
  getUsageByProvider(): Promise<{ provider: string; count: number; credits: number }[]>;
  getRecentUsageLogs(limit?: number): Promise<(UsageLog & { username?: string })[]>;

  // API Keys
  getApiKeys(userId: number): Promise<ApiKey[]>;
  getApiKeyByKey(key: string): Promise<ApiKey | undefined>;
  createApiKey(userId: number, name: string, key: string, prefix: string): Promise<ApiKey>;
  deleteApiKey(id: number, userId: number): Promise<void>;
  updateApiKeyLastUsed(id: number): Promise<void>;

  // Conversations
  getConversations(userId: number): Promise<Conversation[]>;
  getConversation(id: number, userId: number): Promise<Conversation | undefined>;
  createConversation(userId: number, title: string): Promise<Conversation>;
  updateConversationTitle(id: number, title: string): Promise<void>;
  deleteConversation(id: number, userId: number): Promise<void>;

  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string, model?: string, provider?: string, creditsUsed?: number, citations?: string, toolUsed?: string, attachments?: string): Promise<Message>;

  // Usage
  createUsageLog(log: Omit<UsageLog, "id" | "createdAt">): Promise<UsageLog>;
  getUsageLogs(userId: number, limit?: number): Promise<UsageLog[]>;
  getUsageStats(userId: number): Promise<{ totalCredits: number; totalRequests: number; todayCredits: number; todayRequests: number }>;

  // Provider Keys
  getProviderKeys(): Promise<ProviderKey[]>;
  getProviderKey(provider: string): Promise<ProviderKey | undefined>;
  setProviderKey(provider: string, apiKey: string): Promise<ProviderKey>;
  deleteProviderKey(provider: string): Promise<void>;

  // Platform Settings
  getSetting(key: string): Promise<string>;
  setSetting(key: string, value: string): Promise<void>;
  getAllSettings(): Promise<Record<string, string>>;
  getMarginMultiplier(): Promise<number>;

  // Rate Limit Rules
  getRateLimitRules(): Promise<RateLimitRule[]>;
  getRateLimitRule(id: number): Promise<RateLimitRule | undefined>;
  getRateLimitRuleForPlan(plan: string): Promise<RateLimitRule | undefined>;
  createRateLimitRule(rule: InsertRateLimitRule): Promise<RateLimitRule>;
  updateRateLimitRule(id: number, rule: Partial<InsertRateLimitRule>): Promise<RateLimitRule>;
  deleteRateLimitRule(id: number): Promise<void>;

  // Rate limit checking
  getUserRequestCount(userId: number, sinceMinutes: number): Promise<number>;
  getUserCreditsUsedToday(userId: number): Promise<number>;
  getLastRequestTime(userId: number): Promise<string | null>;

  // Calendar Events
  getCalendarEvents(filters?: { region?: string; category?: string; subcategory?: string }): Promise<CalendarEvent[]>;
  getCalendarEventsInRange(start: string, end: string, regions?: string[]): Promise<CalendarEvent[]>;
  getCalendarEvent(id: number): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  deleteCalendarEvent(id: number): Promise<void>;
  getCalendarEventCount(): Promise<number>;

  // AI Rules
  getAiRules(filters?: { category?: string; isActive?: boolean }): Promise<AiRule[]>;
  getAiRule(id: number): Promise<AiRule | undefined>;
  getActiveAiRules(): Promise<AiRule[]>;
  createAiRule(rule: InsertAiRule): Promise<AiRule>;
  updateAiRule(id: number, rule: Partial<InsertAiRule>): Promise<AiRule>;
  deleteAiRule(id: number): Promise<void>;

  // User Events (timeline)
  getUserEvents(userId: number, limit?: number): Promise<UserEvent[]>;
  getUserEventsByCategory(userId: number, category: string): Promise<UserEvent[]>;
  getUserEventsInRange(userId: number, start: string, end: string): Promise<UserEvent[]>;
  createUserEvent(event: InsertUserEvent): Promise<UserEvent>;
  getUserEventStats(userId: number): Promise<{
    totalEvents: number;
    firstEventDate: string | null;
    lastEventDate: string | null;
    activeDays: number;
    topTopics: { topic: string; count: number; lastSeen: string }[];
    categoryBreakdown: { category: string; count: number }[];
  }>;
  getUserActiveProjects(userId: number): Promise<{
    topic: string;
    category: string;
    phase: string;
    progressPct: number;
    eventCount: number;
    lastActivity: string;
    milestones: string[];
  }[]>;
  getUserSentimentTrend(userId: number, limit?: number): Promise<{ date: string; sentiment: string }[]>;
  getAllUsersWithEvents(): Promise<{ userId: number; username: string; email: string; eventCount: number; lastEvent: string }[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser & { password: string; role?: string }): Promise<User> {
    return db.insert(users).values({
      ...insertUser,
      role: insertUser.role || "user",
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateUserCredits(id: number, credits: number): Promise<void> {
    db.update(users).set({ credits }).where(eq(users.id, id)).run();
  }

  async updateUserPlan(id: number, plan: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<void> {
    const updates: any = { plan };
    if (stripeCustomerId) updates.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) updates.stripeSubscriptionId = stripeSubscriptionId;
    db.update(users).set(updates).where(eq(users.id, id)).run();
  }

  async updateUserActive(id: number, isActive: boolean): Promise<void> {
    db.update(users).set({ isActive }).where(eq(users.id, id)).run();
  }

  async updateUserRole(id: number, role: string): Promise<void> {
    db.update(users).set({ role }).where(eq(users.id, id)).run();
  }

  // Admin
  async getAllUsers(search?: string): Promise<User[]> {
    if (search) {
      return db.select().from(users).where(
        sql`${users.username} LIKE ${'%' + search + '%'} OR ${users.email} LIKE ${'%' + search + '%'}`
      ).orderBy(desc(users.createdAt)).all();
    }
    return db.select().from(users).orderBy(desc(users.createdAt)).all();
  }

  async getAdminStats() {
    const today = new Date().toISOString().split("T")[0];

    const totalUsers = db.select({ count: sql<number>`COUNT(*)` }).from(users).get()?.count || 0;
    const activeUsers = db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.isActive, true)).get()?.count || 0;

    const allUsage = db.select({
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      totalRequests: sql<number>`COUNT(*)`,
    }).from(usageLogs).get();

    const todayUsage = db.select({
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      requests: sql<number>`COUNT(*)`,
    }).from(usageLogs).where(sql`date(${usageLogs.createdAt}) = ${today}`).get();

    // Revenue estimate from paid plans
    const paidUsers = db.select({
      count: sql<number>`COUNT(*)`,
    }).from(users).where(sql`${users.plan} != 'free'`).get();

    return {
      totalUsers,
      activeUsers,
      totalCreditsUsed: allUsage?.totalCredits || 0,
      totalRequests: allUsage?.totalRequests || 0,
      todayRequests: todayUsage?.requests || 0,
      todayCreditsUsed: todayUsage?.credits || 0,
      revenueEstimate: (paidUsers?.count || 0) * 20, // rough avg
    };
  }

  async getUsageByProvider() {
    return db.select({
      provider: usageLogs.provider,
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    }).from(usageLogs).groupBy(usageLogs.provider).all();
  }

  async getRecentUsageLogs(limit = 50) {
    const logs = db.select().from(usageLogs).orderBy(desc(usageLogs.createdAt)).limit(limit).all();
    // Attach usernames
    const result = [];
    for (const log of logs) {
      const user = await this.getUser(log.userId);
      result.push({ ...log, username: user?.username });
    }
    return result;
  }

  // API Keys
  async getApiKeys(userId: number): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt)).all();
  }

  async getApiKeyByKey(key: string): Promise<ApiKey | undefined> {
    return db.select().from(apiKeys).where(and(eq(apiKeys.key, key), eq(apiKeys.isActive, true))).get();
  }

  async createApiKey(userId: number, name: string, key: string, prefix: string): Promise<ApiKey> {
    return db.insert(apiKeys).values({
      userId, name, key, prefix,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async deleteApiKey(id: number, userId: number): Promise<void> {
    db.update(apiKeys).set({ isActive: false }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).run();
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, id)).run();
  }

  // Conversations
  async getConversations(userId: number): Promise<Conversation[]> {
    return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt)).all();
  }

  async getConversation(id: number, userId: number): Promise<Conversation | undefined> {
    return db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).get();
  }

  async createConversation(userId: number, title: string): Promise<Conversation> {
    return db.insert(conversations).values({
      userId, title,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateConversationTitle(id: number, title: string): Promise<void> {
    db.update(conversations).set({ title }).where(eq(conversations.id, id)).run();
  }

  async deleteConversation(id: number, userId: number): Promise<void> {
    const conv = db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).get();
    if (conv) {
      db.delete(messages).where(eq(messages.conversationId, id)).run();
      db.delete(conversations).where(eq(conversations.id, id)).run();
    }
  }

  // Messages
  async getMessages(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt).all();
  }

  async createMessage(conversationId: number, role: string, content: string, model?: string, provider?: string, creditsUsed?: number, citations?: string, toolUsed?: string, attachments?: string): Promise<Message> {
    return db.insert(messages).values({
      conversationId, role, content, model, provider,
      creditsUsed: creditsUsed || 0,
      citations,
      toolUsed,
      attachments,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  // Usage
  async createUsageLog(log: Omit<UsageLog, "id" | "createdAt">): Promise<UsageLog> {
    return db.insert(usageLogs).values({
      ...log,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async getUsageLogs(userId: number, limit = 50): Promise<UsageLog[]> {
    return db.select().from(usageLogs).where(eq(usageLogs.userId, userId)).orderBy(desc(usageLogs.createdAt)).limit(limit).all();
  }

  async getUsageStats(userId: number) {
    const today = new Date().toISOString().split("T")[0];

    const allStats = db.select({
      totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      totalRequests: sql<number>`COUNT(*)`,
    }).from(usageLogs).where(eq(usageLogs.userId, userId)).get();

    const todayStats = db.select({
      todayCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      todayRequests: sql<number>`COUNT(*)`,
    }).from(usageLogs).where(
      and(eq(usageLogs.userId, userId), sql`date(${usageLogs.createdAt}) = ${today}`)
    ).get();

    return {
      totalCredits: allStats?.totalCredits || 0,
      totalRequests: allStats?.totalRequests || 0,
      todayCredits: todayStats?.todayCredits || 0,
      todayRequests: todayStats?.todayRequests || 0,
    };
  }

  // Provider Keys
  async getProviderKeys(): Promise<ProviderKey[]> {
    return db.select().from(providerKeys).all();
  }

  async getProviderKey(provider: string): Promise<ProviderKey | undefined> {
    return db.select().from(providerKeys).where(and(eq(providerKeys.provider, provider), eq(providerKeys.isActive, true))).get();
  }

  async setProviderKey(provider: string, apiKey: string): Promise<ProviderKey> {
    const existing = db.select().from(providerKeys).where(eq(providerKeys.provider, provider)).get();
    if (existing) {
      db.update(providerKeys).set({ apiKey, isActive: true }).where(eq(providerKeys.provider, provider)).run();
      return db.select().from(providerKeys).where(eq(providerKeys.provider, provider)).get()!;
    }
    return db.insert(providerKeys).values({
      provider, apiKey,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async deleteProviderKey(provider: string): Promise<void> {
    db.update(providerKeys).set({ isActive: false }).where(eq(providerKeys.provider, provider)).run();
  }

  // Platform Settings
  async getSetting(key: string): Promise<string> {
    const row = db.select().from(platformSettings).where(eq(platformSettings.key, key)).get();
    return row?.value ?? (DEFAULT_SETTINGS as any)[key] ?? "";
  }

  async setSetting(key: string, value: string): Promise<void> {
    const existing = db.select().from(platformSettings).where(eq(platformSettings.key, key)).get();
    if (existing) {
      db.update(platformSettings).set({ value, updatedAt: new Date().toISOString() }).where(eq(platformSettings.key, key)).run();
    } else {
      db.insert(platformSettings).values({ key, value, updatedAt: new Date().toISOString() }).run();
    }
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = db.select().from(platformSettings).all();
    const result: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async getMarginMultiplier(): Promise<number> {
    const val = await this.getSetting("margin_multiplier");
    const num = parseFloat(val);
    return isNaN(num) || num < 1 ? 1 : num;
  }

  // Rate Limit Rules
  async getRateLimitRules(): Promise<RateLimitRule[]> {
    return db.select().from(rateLimitRules).orderBy(rateLimitRules.plan).all();
  }

  async getRateLimitRule(id: number): Promise<RateLimitRule | undefined> {
    return db.select().from(rateLimitRules).where(eq(rateLimitRules.id, id)).get();
  }

  async getRateLimitRuleForPlan(plan: string): Promise<RateLimitRule | undefined> {
    // Try exact plan match first, then "all"
    const exact = db.select().from(rateLimitRules).where(
      and(eq(rateLimitRules.plan, plan), eq(rateLimitRules.isActive, true))
    ).get();
    if (exact) return exact;
    return db.select().from(rateLimitRules).where(
      and(eq(rateLimitRules.plan, "all"), eq(rateLimitRules.isActive, true))
    ).get();
  }

  async createRateLimitRule(rule: InsertRateLimitRule): Promise<RateLimitRule> {
    return db.insert(rateLimitRules).values({
      ...rule,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateRateLimitRule(id: number, rule: Partial<InsertRateLimitRule>): Promise<RateLimitRule> {
    db.update(rateLimitRules).set(rule).where(eq(rateLimitRules.id, id)).run();
    return db.select().from(rateLimitRules).where(eq(rateLimitRules.id, id)).get()!;
  }

  async deleteRateLimitRule(id: number): Promise<void> {
    db.delete(rateLimitRules).where(eq(rateLimitRules.id, id)).run();
  }

  // Rate limit checking helpers
  async getUserRequestCount(userId: number, sinceMinutes: number): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
    const result = db.select({
      count: sql<number>`COUNT(*)`,
    }).from(usageLogs).where(
      and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, since))
    ).get();
    return result?.count || 0;
  }

  async getUserCreditsUsedToday(userId: number): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const result = db.select({
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    }).from(usageLogs).where(
      and(eq(usageLogs.userId, userId), sql`date(${usageLogs.createdAt}) = ${today}`)
    ).get();
    return result?.credits || 0;
  }

  async getLastRequestTime(userId: number): Promise<string | null> {
    const result = db.select({ createdAt: usageLogs.createdAt })
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(desc(usageLogs.createdAt))
      .limit(1)
      .get();
    return result?.createdAt || null;
  }

  // Calendar Events
  async getCalendarEvents(filters?: { region?: string; category?: string; subcategory?: string }): Promise<CalendarEvent[]> {
    let query = db.select().from(calendarEvents).where(eq(calendarEvents.isActive, true));
    // Basic query - filters applied in JS for simplicity with better-sqlite3
    const all = db.select().from(calendarEvents).where(eq(calendarEvents.isActive, true)).orderBy(calendarEvents.date).all();
    if (!filters) return all;
    return all.filter((e) => {
      if (filters.region && e.region !== filters.region && e.region !== "global") return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.subcategory && e.subcategory !== filters.subcategory) return false;
      return true;
    });
  }

  async getCalendarEventsInRange(start: string, end: string, regions?: string[]): Promise<CalendarEvent[]> {
    const all = db.select().from(calendarEvents)
      .where(eq(calendarEvents.isActive, true))
      .orderBy(calendarEvents.date)
      .all();
    return all.filter((e) => {
      if (e.date < start || e.date > end) return false;
      if (regions && regions.length > 0 && !regions.includes(e.region)) return false;
      return true;
    });
  }

  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    return db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get();
  }

  async createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    return db.insert(calendarEvents).values({
      ...event,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateCalendarEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    db.update(calendarEvents).set(event).where(eq(calendarEvents.id, id)).run();
    return db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).get()!;
  }

  async deleteCalendarEvent(id: number): Promise<void> {
    db.delete(calendarEvents).where(eq(calendarEvents.id, id)).run();
  }

  async getCalendarEventCount(): Promise<number> {
    const result = db.select({ count: sql<number>`COUNT(*)` }).from(calendarEvents).get();
    return result?.count || 0;
  }
  // AI Rules
  async getAiRules(filters?: { category?: string; isActive?: boolean }): Promise<AiRule[]> {
    let query = db.select().from(aiRules);
    const conditions = [];
    if (filters?.category) conditions.push(eq(aiRules.category, filters.category));
    if (filters?.isActive !== undefined) conditions.push(eq(aiRules.isActive, filters.isActive));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    return (query as any).orderBy(aiRules.priority).all();
  }

  async getAiRule(id: number): Promise<AiRule | undefined> {
    return db.select().from(aiRules).where(eq(aiRules.id, id)).get();
  }

  async getActiveAiRules(): Promise<AiRule[]> {
    return db.select().from(aiRules)
      .where(eq(aiRules.isActive, true))
      .orderBy(aiRules.priority)
      .all();
  }

  async createAiRule(rule: InsertAiRule): Promise<AiRule> {
    return db.insert(aiRules).values({
      ...rule,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }

  async updateAiRule(id: number, rule: Partial<InsertAiRule>): Promise<AiRule> {
    db.update(aiRules).set({
      ...rule,
      updatedAt: new Date().toISOString(),
    }).where(eq(aiRules.id, id)).run();
    return db.select().from(aiRules).where(eq(aiRules.id, id)).get()!;
  }

  async deleteAiRule(id: number): Promise<void> {
    db.delete(aiRules).where(eq(aiRules.id, id)).run();
  }

  // User Events (timeline)
  async getUserEvents(userId: number, limit = 100): Promise<UserEvent[]> {
    return db.select().from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .orderBy(desc(userEvents.createdAt))
      .limit(limit)
      .all();
  }

  async getUserEventsByCategory(userId: number, category: string): Promise<UserEvent[]> {
    return db.select().from(userEvents)
      .where(and(
        eq(userEvents.userId, userId),
        eq(userEvents.category, category),
        eq(userEvents.isActive, true)
      ))
      .orderBy(desc(userEvents.createdAt))
      .all();
  }

  async getUserEventsInRange(userId: number, start: string, end: string): Promise<UserEvent[]> {
    return db.select().from(userEvents)
      .where(and(
        eq(userEvents.userId, userId),
        eq(userEvents.isActive, true),
        gte(userEvents.createdAt, start),
        sql`${userEvents.createdAt} <= ${end}`
      ))
      .orderBy(userEvents.createdAt)
      .all();
  }

  async createUserEvent(event: InsertUserEvent): Promise<UserEvent> {
    return db.insert(userEvents).values({
      ...event,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  async getUserEventStats(userId: number) {
    const total = db.select({ count: sql<number>`COUNT(*)` })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .get();

    const firstEvent = db.select({ date: userEvents.createdAt })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .orderBy(userEvents.createdAt)
      .limit(1)
      .get();

    const lastEvent = db.select({ date: userEvents.createdAt })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .orderBy(desc(userEvents.createdAt))
      .limit(1)
      .get();

    const activeDaysResult = db.select({
      days: sql<number>`COUNT(DISTINCT date(${userEvents.createdAt}))`,
    })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .get();

    // Top topics
    const topTopicsRaw = db.select({
      topic: userEvents.topic,
      count: sql<number>`COUNT(*)`,
      lastSeen: sql<string>`MAX(${userEvents.createdAt})`,
    })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .groupBy(userEvents.topic)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(10)
      .all();

    // Category breakdown
    const categoryBreakdown = db.select({
      category: userEvents.category,
      count: sql<number>`COUNT(*)`,
    })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .groupBy(userEvents.category)
      .orderBy(sql`COUNT(*) DESC`)
      .all();

    return {
      totalEvents: total?.count || 0,
      firstEventDate: firstEvent?.date || null,
      lastEventDate: lastEvent?.date || null,
      activeDays: activeDaysResult?.days || 0,
      topTopics: topTopicsRaw,
      categoryBreakdown,
    };
  }

  async getUserActiveProjects(userId: number) {
    // Group events by topic+category, find latest phase/progress for each
    const projects = db.select({
      topic: userEvents.topic,
      category: userEvents.category,
      eventCount: sql<number>`COUNT(*)`,
      lastActivity: sql<string>`MAX(${userEvents.createdAt})`,
    })
      .from(userEvents)
      .where(and(
        eq(userEvents.userId, userId),
        eq(userEvents.isActive, true),
        sql`${userEvents.phase} IS NOT NULL`
      ))
      .groupBy(userEvents.topic, userEvents.category)
      .orderBy(sql`MAX(${userEvents.createdAt}) DESC`)
      .limit(10)
      .all();

    // For each project, get latest phase/progress and milestones
    return projects.map((p) => {
      const latest = db.select({
        phase: userEvents.phase,
        progressPct: userEvents.progressPct,
      })
        .from(userEvents)
        .where(and(
          eq(userEvents.userId, userId),
          eq(userEvents.topic, p.topic),
          eq(userEvents.isActive, true)
        ))
        .orderBy(desc(userEvents.createdAt))
        .limit(1)
        .get();

      const milestonesRaw = db.select({ milestone: userEvents.milestone })
        .from(userEvents)
        .where(and(
          eq(userEvents.userId, userId),
          eq(userEvents.topic, p.topic),
          eq(userEvents.isActive, true),
          sql`${userEvents.milestone} IS NOT NULL`
        ))
        .orderBy(userEvents.createdAt)
        .all();

      return {
        topic: p.topic,
        category: p.category,
        phase: latest?.phase || "unknown",
        progressPct: latest?.progressPct || 0,
        eventCount: p.eventCount,
        lastActivity: p.lastActivity,
        milestones: milestonesRaw.map((m) => m.milestone!),
      };
    });
  }

  async getUserSentimentTrend(userId: number, limit = 30): Promise<{ date: string; sentiment: string }[]> {
    return db.select({
      date: userEvents.createdAt,
      sentiment: userEvents.sentiment,
    })
      .from(userEvents)
      .where(and(eq(userEvents.userId, userId), eq(userEvents.isActive, true)))
      .orderBy(desc(userEvents.createdAt))
      .limit(limit)
      .all() as { date: string; sentiment: string }[];
  }

  async getAllUsersWithEvents(): Promise<{ userId: number; username: string; email: string; eventCount: number; lastEvent: string }[]> {
    // Get all users who have at least 1 event
    const results = db.select({
      userId: userEvents.userId,
      eventCount: sql<number>`COUNT(*)`,
      lastEvent: sql<string>`MAX(${userEvents.createdAt})`,
    })
      .from(userEvents)
      .where(eq(userEvents.isActive, true))
      .groupBy(userEvents.userId)
      .orderBy(sql`MAX(${userEvents.createdAt}) DESC`)
      .all();

    // Attach user info
    const enriched = [];
    for (const r of results) {
      const user = await this.getUser(r.userId);
      if (user) {
        enriched.push({
          userId: r.userId,
          username: user.username,
          email: user.email,
          eventCount: r.eventCount,
          lastEvent: r.lastEvent,
        });
      }
    }
    return enriched;
  }
  // === Artifacts ===
  async createArtifact(data: InsertArtifact): Promise<Artifact> {
    return db.insert(artifacts).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getArtifact(id: number): Promise<Artifact | undefined> {
    return db.select().from(artifacts).where(eq(artifacts.id, id)).get();
  }

  async getArtifactByFilename(filename: string): Promise<Artifact | undefined> {
    return db.select().from(artifacts).where(eq(artifacts.filename, filename)).get();
  }

  async getUserArtifacts(userId: number, limit = 50): Promise<Artifact[]> {
    return db.select().from(artifacts).where(eq(artifacts.userId, userId)).orderBy(artifacts.createdAt).limit(limit).all();
  }

  async getConversationArtifacts(conversationId: number): Promise<Artifact[]> {
    return db.select().from(artifacts).where(eq(artifacts.conversationId, conversationId)).orderBy(artifacts.createdAt).all();
  }

  // === Agent Tools Config ===
  async getAllAgentTools(): Promise<AgentToolConfig[]> {
    return db.select().from(agentToolsConfig).orderBy(agentToolsConfig.sortOrder).all();
  }

  async getEnabledAgentTools(): Promise<AgentToolConfig[]> {
    return db.select().from(agentToolsConfig).where(eq(agentToolsConfig.enabled, true)).orderBy(agentToolsConfig.sortOrder).all();
  }

  async getAgentTool(id: number): Promise<AgentToolConfig | undefined> {
    return db.select().from(agentToolsConfig).where(eq(agentToolsConfig.id, id)).get();
  }

  async getAgentToolByToolId(toolId: string): Promise<AgentToolConfig | undefined> {
    return db.select().from(agentToolsConfig).where(eq(agentToolsConfig.toolId, toolId)).get();
  }

  async createAgentTool(data: InsertAgentToolConfig): Promise<AgentToolConfig> {
    const now = new Date().toISOString();
    return db.insert(agentToolsConfig).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }

  async updateAgentTool(id: number, data: Partial<InsertAgentToolConfig>): Promise<AgentToolConfig | undefined> {
    return db.update(agentToolsConfig).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(agentToolsConfig.id, id)).returning().get();
  }

  async deleteAgentTool(id: number): Promise<void> {
    db.delete(agentToolsConfig).where(eq(agentToolsConfig.id, id)).run();
    // Also delete associated rules
    const tool = await this.getAgentTool(id);
    if (tool) {
      db.delete(agentToolRules).where(eq(agentToolRules.toolId, tool.toolId)).run();
    }
  }

  async seedAgentTools(): Promise<void> {
    const existing = db.select().from(agentToolsConfig).all();
    if (existing.length === 0) {
      const now = new Date().toISOString();
      for (const tool of DEFAULT_AGENT_TOOLS) {
        db.insert(agentToolsConfig).values({ ...tool, createdAt: now, updatedAt: now }).run();
      }
      for (const rule of DEFAULT_AGENT_TOOL_RULES) {
        db.insert(agentToolRules).values({ ...rule, createdAt: now }).run();
      }
    }
  }

  // === Agent Tool Rules ===
  async getToolRules(toolId: string): Promise<AgentToolRule[]> {
    return db.select().from(agentToolRules).where(eq(agentToolRules.toolId, toolId)).orderBy(agentToolRules.priority).all();
  }

  async getAllToolRules(): Promise<AgentToolRule[]> {
    return db.select().from(agentToolRules).orderBy(agentToolRules.priority).all();
  }

  async createToolRule(data: InsertAgentToolRule): Promise<AgentToolRule> {
    return db.insert(agentToolRules).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async updateToolRule(id: number, data: Partial<InsertAgentToolRule>): Promise<AgentToolRule | undefined> {
    return db.update(agentToolRules).set(data).where(eq(agentToolRules.id, id)).returning().get();
  }

  async deleteToolRule(id: number): Promise<void> {
    db.delete(agentToolRules).where(eq(agentToolRules.id, id)).run();
  }

  // === Platform Agents ===
  async createAgent(data: InsertPlatformAgent): Promise<PlatformAgent> {
    return db.insert(platformAgents).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getAgent(id: number): Promise<PlatformAgent | undefined> {
    return db.select().from(platformAgents).where(eq(platformAgents.id, id)).get();
  }

  async getAllAgents(): Promise<PlatformAgent[]> {
    return db.select().from(platformAgents).orderBy(desc(platformAgents.createdAt)).all();
  }

  async updateAgent(id: number, data: Partial<InsertPlatformAgent>): Promise<PlatformAgent | undefined> {
    return db.update(platformAgents).set(data).where(eq(platformAgents.id, id)).returning().get();
  }

  async deleteAgent(id: number): Promise<void> {
    db.delete(agentAssignments).where(eq(agentAssignments.agentId, id)).run();
    db.delete(platformAgents).where(eq(platformAgents.id, id)).run();
  }

  // === Agent Assignments ===
  async assignAgent(agentId: number, userId: number): Promise<AgentAssignment> {
    // Check if already assigned
    const existing = db.select().from(agentAssignments)
      .where(and(eq(agentAssignments.agentId, agentId), eq(agentAssignments.userId, userId))).get();
    if (existing) {
      return db.update(agentAssignments).set({ isActive: true }).where(eq(agentAssignments.id, existing.id)).returning().get();
    }
    return db.insert(agentAssignments).values({ agentId, userId, assignedAt: new Date().toISOString() }).returning().get();
  }

  async unassignAgent(agentId: number, userId: number): Promise<void> {
    db.update(agentAssignments).set({ isActive: false })
      .where(and(eq(agentAssignments.agentId, agentId), eq(agentAssignments.userId, userId))).run();
  }

  async getUserAgents(userId: number): Promise<PlatformAgent[]> {
    const assignments = db.select().from(agentAssignments)
      .where(and(eq(agentAssignments.userId, userId), eq(agentAssignments.isActive, true))).all();
    if (assignments.length === 0) return [];
    const agentIds = assignments.map(a => a.agentId);
    return db.select().from(platformAgents)
      .where(and(eq(platformAgents.isActive, true), sql`${platformAgents.id} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`,`)})`)).all();
  }

  async getAgentAssignments(agentId: number): Promise<AgentAssignment[]> {
    return db.select().from(agentAssignments)
      .where(and(eq(agentAssignments.agentId, agentId), eq(agentAssignments.isActive, true))).all();
  }

  // === Agent Requests ===
  async createAgentRequest(data: InsertAgentRequest): Promise<AgentRequest> {
    return db.insert(agentRequests).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getAgentRequest(id: number): Promise<AgentRequest | undefined> {
    return db.select().from(agentRequests).where(eq(agentRequests.id, id)).get();
  }

  async getPendingRequests(agentId?: number): Promise<AgentRequest[]> {
    if (agentId) {
      return db.select().from(agentRequests)
        .where(and(eq(agentRequests.agentId, agentId), eq(agentRequests.status, "pending")))
        .orderBy(desc(agentRequests.createdAt)).all();
    }
    return db.select().from(agentRequests)
      .where(eq(agentRequests.status, "pending"))
      .orderBy(desc(agentRequests.createdAt)).all();
  }

  async resolveAgentRequest(id: number, status: "approved" | "declined", resolvedBy: number): Promise<AgentRequest | undefined> {
    return db.update(agentRequests).set({ status, resolvedBy, resolvedAt: new Date().toISOString() })
      .where(eq(agentRequests.id, id)).returning().get();
  }

  // === Schedule Items ===
  async createScheduleItem(data: InsertScheduleItem): Promise<ScheduleItem> {
    return db.insert(scheduleItems).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getUserSchedule(userId: number, fromDate?: string): Promise<ScheduleItem[]> {
    const dateFilter = fromDate || new Date().toISOString().split("T")[0];
    return db.select().from(scheduleItems)
      .where(and(
        eq(scheduleItems.userId, userId),
        eq(scheduleItems.status, "active"),
        gte(scheduleItems.date, dateFilter)
      ))
      .orderBy(scheduleItems.date, scheduleItems.time).all();
  }

  async updateScheduleItem(id: number, data: Partial<InsertScheduleItem>): Promise<ScheduleItem | undefined> {
    return db.update(scheduleItems).set(data).where(eq(scheduleItems.id, id)).returning().get();
  }

  async deleteScheduleItem(id: number): Promise<void> {
    db.delete(scheduleItems).where(eq(scheduleItems.id, id)).run();
  }
}

export const storage = new DatabaseStorage();
