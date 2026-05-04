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
  type TelegramBot, type InsertTelegramBot, telegramBots,
  type TelegramLink, type InsertTelegramLink, telegramLinks,
  type RelayMessage, type InsertRelayMessage, relayMessages,
  type CrmConnection, type InsertCrmConnection, crmConnections,
  type CrmCustomer, crmCustomers,
  type CrmLead, crmLeads,
  type CrmInvoice, crmInvoices,
  type CrmProject, crmProjects,
  type CrmTask, crmTasks,
  type CrmTicket, crmTickets,
  // Project Management
  type Project, type InsertProject, projects,
  type ProjectMember, type InsertProjectMember, projectMembers,
  type UserInvite, type InsertUserInvite, userInvites,
  type ProjectAssignment, type InsertProjectAssignment, projectAssignments,
  type ProjectMessage, type InsertProjectMessage, projectMessages,
  type Notification, type InsertNotification, notifications,
  DEFAULT_SETTINGS, DEFAULT_RATE_LIMITS,
  DEFAULT_AGENT_TOOLS, DEFAULT_AGENT_TOOL_RULES,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql, like, gte, lte, or, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { CronExpressionParser } from "cron-parser";

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

  // CRM Integration
  createCrmConnection(data: InsertCrmConnection): CrmConnection;
  getCrmConnection(id: number): CrmConnection | undefined;
  getCrmConnections(): CrmConnection[];
  updateCrmConnection(id: number, data: Partial<InsertCrmConnection>): CrmConnection | undefined;
  deleteCrmConnection(id: number): void;

  upsertCrmCustomers(connectionId: number, customers: any[]): number;
  upsertCrmLeads(connectionId: number, leads: any[]): number;
  upsertCrmInvoices(connectionId: number, invoices: any[]): number;
  upsertCrmProjects(connectionId: number, projects: any[]): number;
  upsertCrmTasks(connectionId: number, tasks: any[]): number;
  upsertCrmTickets(connectionId: number, tickets: any[]): number;

  getCrmCustomers(connectionId: number, filters?: { search?: string; status?: string }): any[];
  getCrmLeads(connectionId: number, filters?: { search?: string; status?: string }): any[];
  getCrmInvoices(connectionId: number, filters?: { status?: string; overdue?: boolean }): any[];
  getCrmProjects(connectionId: number, filters?: { status?: string }): any[];
  getCrmTasks(connectionId: number, filters?: { status?: string; assignedTo?: string }): any[];
  getCrmTickets(connectionId: number, filters?: { status?: string; priority?: string }): any[];
  getCrmDashboardStats(connectionId: number): any;

  // ===== PROJECT MANAGEMENT =====

  // Projects
  listProjects(filters?: { ownerId?: number; memberId?: number; status?: string; search?: string }): Project[];
  getProject(id: number): Project | undefined;
  createProject(data: InsertProject): Project;
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): { changes: number };

  // Project Members
  listProjectMembers(projectId: number): (ProjectMember & { user?: { id: number; username: string; email: string } })[]
  addProjectMember(data: InsertProjectMember): ProjectMember;
  removeProjectMember(projectId: number, userId: number): { changes: number };
  updateProjectMember(projectId: number, userId: number, role: string): ProjectMember | undefined;
  isUserInProject(projectId: number, userId: number): boolean;

  // Invites
  createInvite(data: Omit<InsertUserInvite, "token">): UserInvite;
  getInviteByToken(token: string): UserInvite | undefined;
  listInvitesForProject(projectId: number): UserInvite[];
  acceptInvite(token: string, userId: number): UserInvite | undefined;
  expireInvite(id: number): void;

  // Assignments
  listAssignments(filters: { projectId?: number; assignedTo?: number; status?: string; overdue?: boolean; dueBefore?: string }): ProjectAssignment[];
  getAssignment(id: number): ProjectAssignment | undefined;
  createAssignment(data: InsertProjectAssignment): ProjectAssignment;
  updateAssignment(id: number, data: Partial<InsertProjectAssignment>): ProjectAssignment | undefined;
  markAssignmentDone(id: number, userId: number): ProjectAssignment | undefined;
  deleteAssignment(id: number): { changes: number };
  listDueAssignments(now: Date): ProjectAssignment[];

  // Project Messages
  listProjectMessages(projectId: number, limit?: number): ProjectMessage[];
  createProjectMessage(data: InsertProjectMessage): ProjectMessage;

  // Notifications
  listNotifications(userId: number, opts?: { unreadOnly?: boolean; limit?: number }): Notification[];
  countUnreadNotifications(userId: number): number;
  createNotification(data: InsertNotification): Notification;
  markNotificationRead(id: number, userId: number): void;
  markAllNotificationsRead(userId: number): void;
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

  // === Telegram Bots ===
  async createTelegramBot(data: InsertTelegramBot): Promise<TelegramBot> {
    return db.insert(telegramBots).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getTelegramBots(): Promise<TelegramBot[]> {
    return db.select().from(telegramBots).all();
  }

  async getTelegramBotByAgentId(agentId: number): Promise<TelegramBot | undefined> {
    return db.select().from(telegramBots).where(eq(telegramBots.agentId, agentId)).get();
  }

  async getTelegramBotById(id: number): Promise<TelegramBot | undefined> {
    return db.select().from(telegramBots).where(eq(telegramBots.id, id)).get();
  }

  async updateTelegramBot(id: number, data: Partial<InsertTelegramBot>): Promise<TelegramBot | undefined> {
    return db.update(telegramBots).set(data).where(eq(telegramBots.id, id)).returning().get();
  }

  async deleteTelegramBot(id: number): Promise<void> {
    db.delete(telegramBots).where(eq(telegramBots.id, id)).run();
  }

  async getActiveTelegramBots(): Promise<TelegramBot[]> {
    return db.select().from(telegramBots).where(eq(telegramBots.isActive, true)).all();
  }

  // === Telegram Links ===
  async createTelegramLink(data: InsertTelegramLink): Promise<TelegramLink> {
    return db.insert(telegramLinks).values({ ...data, linkedAt: new Date().toISOString() }).returning().get();
  }

  async getTelegramLink(botId: number, telegramChatId: string): Promise<TelegramLink | undefined> {
    return db.select().from(telegramLinks).where(
      and(eq(telegramLinks.botId, botId), eq(telegramLinks.telegramChatId, telegramChatId))
    ).get();
  }

  async getTelegramLinkByUserId(botId: number, userId: number): Promise<TelegramLink | undefined> {
    return db.select().from(telegramLinks).where(
      and(eq(telegramLinks.botId, botId), eq(telegramLinks.userId, userId))
    ).get();
  }

  async getTelegramLinksByBot(botId: number): Promise<TelegramLink[]> {
    return db.select().from(telegramLinks).where(eq(telegramLinks.botId, botId)).all();
  }

  async updateTelegramLink(id: number, data: Partial<InsertTelegramLink>): Promise<TelegramLink | undefined> {
    return db.update(telegramLinks).set(data).where(eq(telegramLinks.id, id)).returning().get();
  }

  // === Relay Messages ===
  async createRelayMessage(data: InsertRelayMessage): Promise<RelayMessage> {
    return db.insert(relayMessages).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  async getRelayMessages(botId: number, limit = 50): Promise<RelayMessage[]> {
    return db.select().from(relayMessages)
      .where(eq(relayMessages.botId, botId))
      .orderBy(desc(relayMessages.createdAt))
      .limit(limit).all();
  }

  async getRelayMessagesByChatId(botId: number, telegramChatId: string, limit = 20): Promise<RelayMessage[]> {
    return db.select().from(relayMessages)
      .where(and(eq(relayMessages.botId, botId), eq(relayMessages.telegramChatId, telegramChatId)))
      .orderBy(desc(relayMessages.createdAt))
      .limit(limit).all();
  }

  // === CRM Integration ===

  createCrmConnection(data: InsertCrmConnection): CrmConnection {
    return db.insert(crmConnections).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  getCrmConnection(id: number): CrmConnection | undefined {
    return db.select().from(crmConnections).where(eq(crmConnections.id, id)).get();
  }

  getCrmConnections(): CrmConnection[] {
    return db.select().from(crmConnections).orderBy(desc(crmConnections.createdAt)).all();
  }

  updateCrmConnection(id: number, data: Partial<InsertCrmConnection>): CrmConnection | undefined {
    return db.update(crmConnections).set(data).where(eq(crmConnections.id, id)).returning().get();
  }

  deleteCrmConnection(id: number): void {
    db.delete(crmConnections).where(eq(crmConnections.id, id)).run();
  }

  upsertCrmCustomers(connectionId: number, customers: any[]): number {
    const now = new Date().toISOString();
    for (const c of customers) {
      const externalId = String(c.userid || c.id || c.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmCustomers)
        .where(and(eq(crmCustomers.connectionId, connectionId), eq(crmCustomers.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        company: c.company || c.name || null,
        email: c.email || null,
        phone: c.phonenumber || c.phone || null,
        address: c.address || null,
        city: c.city || null,
        country: c.country || null,
        status: c.status || (c.active === "1" || c.active === 1 ? "active" : "inactive"),
        totalInvoiced: c.total_invoiced != null ? String(c.total_invoiced) : null,
        metadata: JSON.stringify(c),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmCustomers).set(row).where(eq(crmCustomers.id, existing.id)).run();
      } else {
        db.insert(crmCustomers).values(row).run();
      }
    }
    return customers.length;
  }

  upsertCrmLeads(connectionId: number, leads: any[]): number {
    const now = new Date().toISOString();
    for (const l of leads) {
      const externalId = String(l.id || l.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmLeads)
        .where(and(eq(crmLeads.connectionId, connectionId), eq(crmLeads.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        name: l.name || null,
        email: l.email || null,
        phone: l.phone || null,
        company: l.company || null,
        status: l.status || null,
        source: l.source || null,
        assignedTo: l.assigned_to || l.assignedTo || null,
        value: l.value != null ? String(l.value) : null,
        lastContact: l.last_contact || l.lastContact || null,
        metadata: JSON.stringify(l),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmLeads).set(row).where(eq(crmLeads.id, existing.id)).run();
      } else {
        db.insert(crmLeads).values(row).run();
      }
    }
    return leads.length;
  }

  upsertCrmInvoices(connectionId: number, invoices: any[]): number {
    const now = new Date().toISOString();
    for (const inv of invoices) {
      const externalId = String(inv.id || inv.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmInvoices)
        .where(and(eq(crmInvoices.connectionId, connectionId), eq(crmInvoices.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        customerId: inv.client_id || inv.customerId ? String(inv.client_id || inv.customerId) : null,
        customerName: inv.client_name || inv.customerName || null,
        number: inv.number || inv.invoice_number || null,
        date: inv.date || null,
        dueDate: inv.duedate || inv.due_date || inv.dueDate || null,
        total: inv.total != null ? String(inv.total) : null,
        amountPaid: inv.amount_paid != null ? String(inv.amount_paid) : null,
        status: inv.status || null,
        currency: inv.currency || null,
        items: inv.items ? JSON.stringify(inv.items) : null,
        metadata: JSON.stringify(inv),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmInvoices).set(row).where(eq(crmInvoices.id, existing.id)).run();
      } else {
        db.insert(crmInvoices).values(row).run();
      }
    }
    return invoices.length;
  }

  upsertCrmProjects(connectionId: number, projects: any[]): number {
    const now = new Date().toISOString();
    for (const p of projects) {
      const externalId = String(p.id || p.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmProjects)
        .where(and(eq(crmProjects.connectionId, connectionId), eq(crmProjects.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        name: p.name || null,
        customerName: p.client_name || p.customerName || null,
        status: p.status || null,
        startDate: p.start_date || p.startDate || null,
        deadline: p.deadline || null,
        progress: p.progress != null ? parseInt(p.progress) : null,
        billingType: p.billing_type || p.billingType || null,
        totalCost: p.project_cost != null ? String(p.project_cost) : p.totalCost != null ? String(p.totalCost) : null,
        metadata: JSON.stringify(p),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmProjects).set(row).where(eq(crmProjects.id, existing.id)).run();
      } else {
        db.insert(crmProjects).values(row).run();
      }
    }
    return projects.length;
  }

  upsertCrmTasks(connectionId: number, tasks: any[]): number {
    const now = new Date().toISOString();
    for (const t of tasks) {
      const externalId = String(t.id || t.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmTasks)
        .where(and(eq(crmTasks.connectionId, connectionId), eq(crmTasks.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        name: t.name || null,
        projectName: t.project_name || t.projectName || null,
        assignedTo: t.assigned_to || t.assignedTo || null,
        status: t.status || null,
        priority: t.priority || null,
        startDate: t.start_date || t.startDate || null,
        dueDate: t.duedate || t.due_date || t.dueDate || null,
        metadata: JSON.stringify(t),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmTasks).set(row).where(eq(crmTasks.id, existing.id)).run();
      } else {
        db.insert(crmTasks).values(row).run();
      }
    }
    return tasks.length;
  }

  upsertCrmTickets(connectionId: number, tickets: any[]): number {
    const now = new Date().toISOString();
    for (const t of tickets) {
      const externalId = String(t.id || t.externalId || "");
      if (!externalId) continue;
      const existing = db.select().from(crmTickets)
        .where(and(eq(crmTickets.connectionId, connectionId), eq(crmTickets.externalId, externalId))).get();
      const row = {
        connectionId,
        externalId,
        subject: t.subject || null,
        customerName: t.name || t.customerName || null,
        department: t.department || null,
        status: t.status || null,
        priority: t.priority || null,
        lastReply: t.last_reply || t.lastReply || null,
        metadata: JSON.stringify(t),
        syncedAt: now,
      };
      if (existing) {
        db.update(crmTickets).set(row).where(eq(crmTickets.id, existing.id)).run();
      } else {
        db.insert(crmTickets).values(row).run();
      }
    }
    return tickets.length;
  }

  getCrmCustomers(connectionId: number, filters?: { search?: string; status?: string }): any[] {
    let q = db.select().from(crmCustomers).where(eq(crmCustomers.connectionId, connectionId));
    const results = q.all();
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(c =>
        (c.company || "").toLowerCase().includes(s) ||
        (c.email || "").toLowerCase().includes(s) ||
        (c.phone || "").includes(s)
      );
    }
    return filtered;
  }

  getCrmLeads(connectionId: number, filters?: { search?: string; status?: string }): any[] {
    const results = db.select().from(crmLeads).where(eq(crmLeads.connectionId, connectionId)).all();
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(l => l.status === filters.status);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.name || "").toLowerCase().includes(s) ||
        (l.email || "").toLowerCase().includes(s) ||
        (l.company || "").toLowerCase().includes(s)
      );
    }
    return filtered;
  }

  getCrmInvoices(connectionId: number, filters?: { status?: string; overdue?: boolean }): any[] {
    const results = db.select().from(crmInvoices).where(eq(crmInvoices.connectionId, connectionId)).all();
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(i => i.status === filters.status);
    }
    if (filters?.overdue) {
      const today = new Date().toISOString().split("T")[0];
      filtered = filtered.filter(i =>
        i.status !== "paid" && i.status !== "cancelled" &&
        i.dueDate != null && i.dueDate < today
      );
    }
    return filtered;
  }

  getCrmProjects(connectionId: number, filters?: { status?: string }): any[] {
    const results = db.select().from(crmProjects).where(eq(crmProjects.connectionId, connectionId)).all();
    if (filters?.status) {
      return results.filter(p => p.status === filters.status);
    }
    return results;
  }

  getCrmTasks(connectionId: number, filters?: { status?: string; assignedTo?: string }): any[] {
    const results = db.select().from(crmTasks).where(eq(crmTasks.connectionId, connectionId)).all();
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    if (filters?.assignedTo) {
      const a = filters.assignedTo.toLowerCase();
      filtered = filtered.filter(t => (t.assignedTo || "").toLowerCase().includes(a));
    }
    return filtered;
  }

  getCrmTickets(connectionId: number, filters?: { status?: string; priority?: string }): any[] {
    const results = db.select().from(crmTickets).where(eq(crmTickets.connectionId, connectionId)).all();
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    if (filters?.priority) {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }
    return filtered;
  }

  getCrmDashboardStats(connectionId: number): any {
    const today = new Date().toISOString().split("T")[0];

    const customers = db.select().from(crmCustomers).where(eq(crmCustomers.connectionId, connectionId)).all();
    const leads = db.select().from(crmLeads).where(eq(crmLeads.connectionId, connectionId)).all();
    const invoices = db.select().from(crmInvoices).where(eq(crmInvoices.connectionId, connectionId)).all();
    const projects = db.select().from(crmProjects).where(eq(crmProjects.connectionId, connectionId)).all();
    const tasks = db.select().from(crmTasks).where(eq(crmTasks.connectionId, connectionId)).all();
    const tickets = db.select().from(crmTickets).where(eq(crmTickets.connectionId, connectionId)).all();

    // Customer stats
    const customerStats = {
      total: customers.length,
      active: customers.filter(c => c.status === "active").length,
    };

    // Lead stats
    const leadsByStatus: Record<string, number> = {};
    for (const l of leads) {
      const s = l.status || "unknown";
      leadsByStatus[s] = (leadsByStatus[s] || 0) + 1;
    }
    const leadStats = { total: leads.length, byStatus: leadsByStatus };

    // Invoice stats
    let totalValue = 0;
    let overdueValue = 0;
    const paidCount = invoices.filter(i => i.status === "paid").length;
    const unpaidCount = invoices.filter(i => i.status === "unpaid").length;
    const overdueInvoices = invoices.filter(i =>
      i.status !== "paid" && i.status !== "cancelled" &&
      i.dueDate != null && i.dueDate < today
    );
    for (const i of invoices) {
      const v = parseFloat(i.total || "0");
      if (!isNaN(v)) totalValue += v;
    }
    for (const i of overdueInvoices) {
      const v = parseFloat(i.total || "0");
      if (!isNaN(v)) overdueValue += v;
    }
    const invoiceStats = {
      total: invoices.length,
      totalValue: totalValue.toFixed(2),
      paid: paidCount,
      unpaid: unpaidCount,
      overdue: overdueInvoices.length,
      overdueValue: overdueValue.toFixed(2),
    };

    // Project stats
    const projectStats = {
      total: projects.length,
      active: projects.filter(p => ["2", "in_progress", "active"].includes(p.status || "")).length,
      onHold: projects.filter(p => ["3", "on_hold"].includes(p.status || "")).length,
      completed: projects.filter(p => ["4", "5", "finished", "completed"].includes(p.status || "")).length,
    };

    // Task stats
    const overdueTasks = tasks.filter(t =>
      t.status !== "complete" && t.dueDate != null && t.dueDate < today
    );
    const taskStats = {
      total: tasks.length,
      open: tasks.filter(t => t.status !== "complete").length,
      completed: tasks.filter(t => t.status === "complete").length,
      overdue: overdueTasks.length,
    };

    // Ticket stats
    const ticketStats = {
      total: tickets.length,
      open: tickets.filter(t => t.status === "open" || t.status === "in_progress").length,
      closed: tickets.filter(t => t.status === "closed").length,
    };

    return {
      customers: customerStats,
      leads: leadStats,
      invoices: invoiceStats,
      projects: projectStats,
      tasks: taskStats,
      tickets: ticketStats,
    };
  }

  // ===== PROJECT MANAGEMENT =====

  // --- Projects ---

  listProjects(filters?: { ownerId?: number; memberId?: number; status?: string; search?: string }): Project[] {
    if (filters?.memberId !== undefined) {
      // Join via project_members to find projects the user is a member of
      const memberRows = db.select().from(projectMembers)
        .where(eq(projectMembers.userId, filters.memberId)).all();
      const projectIds = memberRows.map(m => m.projectId);
      if (projectIds.length === 0) return [];
      let results = db.select().from(projects).all();
      results = results.filter(p => projectIds.includes(p.id));
      if (filters.status) results = results.filter(p => p.status === filters.status);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(s) || (p.description || "").toLowerCase().includes(s));
      }
      return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    let results = db.select().from(projects).all();
    if (filters?.ownerId !== undefined) results = results.filter(p => p.ownerId === filters.ownerId);
    if (filters?.status) results = results.filter(p => p.status === filters.status);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      results = results.filter(p => p.name.toLowerCase().includes(s) || (p.description || "").toLowerCase().includes(s));
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(id: number): Project | undefined {
    return db.select().from(projects).where(eq(projects.id, id)).get();
  }

  createProject(data: InsertProject): Project {
    const now = new Date().toISOString();
    return db.insert(projects).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }

  updateProject(id: number, data: Partial<InsertProject>): Project | undefined {
    return db.update(projects).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(projects.id, id)).returning().get();
  }

  deleteProject(id: number): { changes: number } {
    // Cascade delete members, assignments, messages
    db.delete(projectMembers).where(eq(projectMembers.projectId, id)).run();
    db.delete(projectAssignments).where(eq(projectAssignments.projectId, id)).run();
    db.delete(projectMessages).where(eq(projectMessages.projectId, id)).run();
    const result = db.delete(projects).where(eq(projects.id, id)).run();
    return { changes: result.changes };
  }

  // --- Project Members ---

  listProjectMembers(projectId: number): (ProjectMember & { user?: { id: number; username: string; email: string } })[] {
    const members = db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)).all();
    return members.map(m => {
      const user = db.select({ id: users.id, username: users.username, email: users.email })
        .from(users).where(eq(users.id, m.userId)).get();
      return { ...m, user: user || undefined };
    });
  }

  addProjectMember(data: InsertProjectMember): ProjectMember {
    return db.insert(projectMembers).values({ ...data, addedAt: new Date().toISOString() }).returning().get();
  }

  removeProjectMember(projectId: number, userId: number): { changes: number } {
    const result = db.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).run();
    return { changes: result.changes };
  }

  updateProjectMember(projectId: number, userId: number, role: string): ProjectMember | undefined {
    return db.update(projectMembers).set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning().get();
  }

  isUserInProject(projectId: number, userId: number): boolean {
    const row = db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).get();
    return !!row;
  }

  // --- Invites ---

  createInvite(data: Omit<InsertUserInvite, "token">): UserInvite {
    const token = randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    return db.insert(userInvites).values({ ...data, token, createdAt: now }).returning().get();
  }

  getInviteByToken(token: string): UserInvite | undefined {
    return db.select().from(userInvites).where(eq(userInvites.token, token)).get();
  }

  listInvitesForProject(projectId: number): UserInvite[] {
    return db.select().from(userInvites).where(eq(userInvites.projectId, projectId)).orderBy(desc(userInvites.createdAt)).all();
  }

  acceptInvite(token: string, userId: number): UserInvite | undefined {
    const invite = db.select().from(userInvites).where(eq(userInvites.token, token)).get();
    if (!invite || invite.status !== "pending") return undefined;
    const now = new Date().toISOString();
    const updated = db.update(userInvites)
      .set({ status: "accepted", acceptedAt: now })
      .where(eq(userInvites.token, token))
      .returning().get();
    // Add user to project members if projectId is set
    if (updated && invite.projectId) {
      const existing = db.select().from(projectMembers)
        .where(and(eq(projectMembers.projectId, invite.projectId), eq(projectMembers.userId, userId))).get();
      if (!existing) {
        db.insert(projectMembers).values({
          projectId: invite.projectId,
          userId,
          role: invite.role || "contributor",
          addedAt: now,
        }).run();
      }
    }
    return updated;
  }

  expireInvite(id: number): void {
    db.update(userInvites).set({ status: "expired" }).where(eq(userInvites.id, id)).run();
  }

  // --- Assignments ---

  listAssignments(filters: { projectId?: number; assignedTo?: number; status?: string; overdue?: boolean; dueBefore?: string }): ProjectAssignment[] {
    let results = db.select().from(projectAssignments).all();
    if (filters.projectId !== undefined) results = results.filter(a => a.projectId === filters.projectId);
    if (filters.assignedTo !== undefined) results = results.filter(a => a.assignedTo === filters.assignedTo);
    if (filters.status) results = results.filter(a => a.status === filters.status);
    if (filters.overdue) {
      const now = new Date().toISOString();
      results = results.filter(a => {
        const due = a.dueAt || a.nextRunAt;
        return due != null && due < now && a.status !== "done" && a.status !== "cancelled";
      });
    }
    if (filters.dueBefore) {
      results = results.filter(a => {
        const due = a.dueAt || a.nextRunAt;
        return due != null && due <= filters.dueBefore!;
      });
    }
    return results.sort((a, b) => (a.dueAt || a.nextRunAt || "").localeCompare(b.dueAt || b.nextRunAt || ""));
  }

  getAssignment(id: number): ProjectAssignment | undefined {
    return db.select().from(projectAssignments).where(eq(projectAssignments.id, id)).get();
  }

  createAssignment(data: InsertProjectAssignment): ProjectAssignment {
    const now = new Date().toISOString();
    let nextRunAt: string | null = null;
    if (data.type === "recurring" && data.cronExpression) {
      try {
        const tz = data.cronTimezone || "Asia/Jerusalem";
        const interval = CronExpressionParser.parse(data.cronExpression, { tz });
        nextRunAt = interval.next().toISOString();
      } catch {
        // ignore invalid cron
      }
    }
    return db.insert(projectAssignments).values({
      ...data,
      nextRunAt,
      createdAt: now,
    }).returning().get();
  }

  updateAssignment(id: number, data: Partial<InsertProjectAssignment>): ProjectAssignment | undefined {
    return db.update(projectAssignments).set(data).where(eq(projectAssignments.id, id)).returning().get();
  }

  markAssignmentDone(id: number, _userId: number): ProjectAssignment | undefined {
    const assignment = db.select().from(projectAssignments).where(eq(projectAssignments.id, id)).get();
    if (!assignment) return undefined;
    const now = new Date().toISOString();
    if (assignment.type === "recurring" && assignment.cronExpression) {
      // Recompute next run and reset to pending
      let nextRunAt: string | null = null;
      try {
        const tz = assignment.cronTimezone || "Asia/Jerusalem";
        const interval = CronExpressionParser.parse(assignment.cronExpression, { tz });
        nextRunAt = interval.next().toISOString();
      } catch {
        // ignore
      }
      return db.update(projectAssignments)
        .set({ status: "pending", completedAt: now, lastRunAt: now, nextRunAt, reminderSentAt: null })
        .where(eq(projectAssignments.id, id)).returning().get();
    }
    return db.update(projectAssignments)
      .set({ status: "done", completedAt: now })
      .where(eq(projectAssignments.id, id)).returning().get();
  }

  deleteAssignment(id: number): { changes: number } {
    const result = db.delete(projectAssignments).where(eq(projectAssignments.id, id)).run();
    return { changes: result.changes };
  }

  listDueAssignments(now: Date): ProjectAssignment[] {
    const nowIso = now.toISOString();
    // Fetch pending assignments without a reminderSentAt, then filter in JS
    const pending = db.select().from(projectAssignments)
      .where(and(
        eq(projectAssignments.status, "pending"),
        isNull(projectAssignments.reminderSentAt)
      )).all();
    return pending.filter(a => {
      const due = a.nextRunAt || a.dueAt;
      return due != null && due <= nowIso;
    });
  }

  // --- Project Messages ---

  listProjectMessages(projectId: number, limit = 100): ProjectMessage[] {
    return db.select().from(projectMessages)
      .where(eq(projectMessages.projectId, projectId))
      .orderBy(projectMessages.createdAt)
      .limit(limit)
      .all();
  }

  createProjectMessage(data: InsertProjectMessage): ProjectMessage {
    return db.insert(projectMessages).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  // --- Notifications ---

  listNotifications(userId: number, opts?: { unreadOnly?: boolean; limit?: number }): Notification[] {
    let q = db.select().from(notifications).where(eq(notifications.userId, userId));
    const results = q.orderBy(desc(notifications.createdAt)).all();
    let filtered = results;
    if (opts?.unreadOnly) filtered = filtered.filter(n => !n.read);
    if (opts?.limit) filtered = filtered.slice(0, opts.limit);
    return filtered;
  }

  countUnreadNotifications(userId: number): number {
    const result = db.select({ count: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .get();
    return result?.count || 0;
  }

  createNotification(data: InsertNotification): Notification {
    return db.insert(notifications).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  }

  markNotificationRead(id: number, userId: number): void {
    db.update(notifications).set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId))).run();
  }

  markAllNotificationsRead(userId: number): void {
    db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId)).run();
  }
}

export const storage = new DatabaseStorage();
