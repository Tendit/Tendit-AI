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
  // Managed Sessions (Part VIII)
  type ManagedSession, type InsertManagedSession, managedSessions,
  type SessionAccount, type InsertSessionAccount, sessionAccounts,
  type PendingAction, type InsertPendingAction, pendingActions,
  type ActionApproval, type InsertActionApproval, actionApprovals,
  type ActionAuditLog, type InsertActionAuditLog, actionAuditLog,
  // Part IX
  type Agent, type InsertAgent, agents,
  type P9AgentAssignment, type InsertP9AgentAssignment, p9AgentAssignments,
  type Milestone, type InsertMilestone, milestones,
  type MilestoneDep, type InsertMilestoneDep, milestoneDeps,
  type UserCredits, userCredits,
  type ProjectCredits, projectCredits,
  type CreditLedger, type InsertCreditLedger, creditLedger,
  type CreditPackage, type InsertCreditPackage, creditPackages,
  type SystemCreditQueue, type InsertSystemCreditQueue, systemCreditQueue,
  type AuthProfile, type InsertAuthProfile, authProfiles,
  // Part X — Project Arms
  type Arm, type InsertArm, arms,
  type ArmDocument, type InsertArmDocument, armDocuments,
  type ArmDocumentVersion, type InsertArmDocumentVersion, armDocumentVersions,
  type ArmTarget, type InsertArmTarget, armTargets,
  type ArmTargetInstruction, type InsertArmTargetInstruction, armTargetInstructions,
  type ArmMessage, type InsertArmMessage, armMessages,
  type ArmActivityLog, type InsertArmActivityLog, armActivityLog,
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

// Idempotent migration: ensure project management tables exist
// (drizzle-kit push fails on existing indexes, so we run raw SQL on startup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    client_id INTEGER,
    owner_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning',
    priority TEXT NOT NULL DEFAULT 'medium',
    start_date TEXT,
    deadline TEXT,
    budget REAL,
    agent_id INTEGER,
    telegram_topic TEXT,
    color TEXT DEFAULT '#0d9488',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'contributor',
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL,
    project_id INTEGER,
    role TEXT DEFAULT 'contributor',
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    assigned_to INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'one_time',
    due_at TEXT,
    cron_expression TEXT,
    cron_timezone TEXT DEFAULT 'Asia/Jerusalem',
    next_run_at TEXT,
    last_run_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    reminder_minutes INTEGER DEFAULT 30,
    reminder_sent_at TEXT,
    completed_at TEXT,
    schedule_item_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL,
    mentions_user_ids TEXT,
    attachments TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    telegram_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    project_id INTEGER,
    assignment_id INTEGER,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_project ON project_assignments(project_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_user ON project_assignments(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_assignments_status ON project_assignments(status);
  CREATE INDEX IF NOT EXISTS idx_messages_project ON project_messages(project_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`);
console.log('[migrate] project tables ensured');

// Idempotent migration: managed sessions + pending actions (Part VIII).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS managed_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    site TEXT NOT NULL,
    runtime TEXT NOT NULL DEFAULT 'mock',
    status TEXT NOT NULL DEFAULT 'active',
    account_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS session_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    profile_entity TEXT NOT NULL,
    credentials_ref TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    reasoning TEXT,
    page_state_hash TEXT,
    screenshot_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_by TEXT NOT NULL,
    reminder_sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS action_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL,
    approver_id INTEGER NOT NULL,
    decision TEXT NOT NULL,
    edited_payload TEXT,
    decision_note TEXT,
    decided_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS action_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    before_state_hash TEXT,
    after_state_hash TEXT,
    runtime_response TEXT,
    event_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_managed_sessions_user ON managed_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_session_accounts_session ON session_accounts(session_id);
  CREATE INDEX IF NOT EXISTS idx_pending_actions_session ON pending_actions(session_id);
  CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
  CREATE INDEX IF NOT EXISTS idx_action_approvals_action ON action_approvals(action_id);
  CREATE INDEX IF NOT EXISTS idx_action_audit_log_action ON action_audit_log(action_id);
`);
console.log('[migrate] managed sessions tables ensured');

// Idempotent migration: Part IX — multi-project operations.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    capabilities TEXT NOT NULL DEFAULT '[]',
    system_prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p9_agent_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    project_id INTEGER,
    capability TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'locked',
    agent_assignment_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    completed_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS milestone_deps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id INTEGER NOT NULL,
    depends_on_milestone_id INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    overdraft_balance INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS project_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    overdraft_balance INTEGER NOT NULL DEFAULT 0,
    overdraft_ceiling INTEGER NOT NULL DEFAULT 500,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    user_id INTEGER NOT NULL,
    txn_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    action_ref TEXT,
    stripe_charge_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS credit_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    price_usd INTEGER NOT NULL,
    price_ils INTEGER NOT NULL,
    stripe_price_id TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100
  );
  CREATE TABLE IF NOT EXISTS system_credit_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    action_payload TEXT NOT NULL,
    estimated_credits INTEGER NOT NULL DEFAULT 0,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'awaiting',
    approved_by INTEGER,
    approved_at TEXT,
    result_ref TEXT
  );
  CREATE TABLE IF NOT EXISTS auth_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    entity TEXT NOT NULL,
    credentials_ref TEXT NOT NULL,
    daily_quota INTEGER NOT NULL DEFAULT 0,
    daily_used INTEGER NOT NULL DEFAULT 0,
    quota_reset_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'active',
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_p9_agent_assignments_project ON p9_agent_assignments(project_id);
  CREATE INDEX IF NOT EXISTS idx_p9_agent_assignments_capability ON p9_agent_assignments(capability);
  CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
  CREATE INDEX IF NOT EXISTS idx_milestone_deps_milestone ON milestone_deps(milestone_id);
  CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id);
  CREATE INDEX IF NOT EXISTS idx_credit_ledger_project ON credit_ledger(project_id);
  CREATE INDEX IF NOT EXISTS idx_system_credit_queue_status ON system_credit_queue(status);
  CREATE INDEX IF NOT EXISTS idx_auth_profiles_provider ON auth_profiles(provider);
`);
// Extend project_messages with audio/ack columns (idempotent via try/catch — SQLite ALTER fails on duplicate).
for (const sqlStr of [
  `ALTER TABLE project_messages ADD COLUMN audio_url TEXT`,
  `ALTER TABLE project_messages ADD COLUMN transcript TEXT`,
  `ALTER TABLE project_messages ADD COLUMN duration_sec INTEGER`,
  `ALTER TABLE project_messages ADD COLUMN is_ack INTEGER NOT NULL DEFAULT 0`,
]) {
  try { sqlite.exec(sqlStr); } catch { /* column exists; ignore */ }
}
console.log('[migrate] part IX tables ensured');

// Seed Part IX baseline data (idempotent: ON slug conflict, skip).
try {
  // 1) 11 projects (only insert if slug doesn't exist by name lookup; projects table has no slug column,
  //    so we use name as the natural key for idempotency).
  const adminRow = sqlite.prepare(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
  const seedOwner = adminRow?.id;
  if (seedOwner) {
    const portfolio: Array<{ name: string; description: string; status: string }> = [
      { name: 'Massive Group', description: 'Parent holding company', status: 'active' },
      { name: 'A3 Academy', description: 'Education platform (live at a3m.pplx.app)', status: 'active' },
      { name: 'OrthoCare AI', description: 'Medical AI build', status: 'active' },
      { name: 'LaunchKit', description: 'Active build', status: 'active' },
      { name: 'Tendit AI', description: 'This platform', status: 'active' },
      { name: 'SPC Pool Safety', description: 'Grant-stage venture', status: 'planning' },
      { name: 'Foraviset Biotech', description: 'Fundraising stage', status: 'planning' },
      { name: 'HaTala / Lati Fridges', description: 'Concept', status: 'planning' },
      { name: 'AI Listening Service', description: 'Concept', status: 'planning' },
      { name: 'Personal OS / Private Phone', description: 'Research', status: 'planning' },
      { name: 'AI Game Dev', description: 'Research', status: 'planning' },
    ];
    const insertProject = sqlite.prepare(
      `INSERT INTO projects (name, description, owner_id, status, priority, color, created_at, updated_at)
       VALUES (@name, @description, @owner_id, @status, 'medium', '#0d9488', datetime('now'), datetime('now'))`
    );
    const findProject = sqlite.prepare(`SELECT id FROM projects WHERE name = ?`);
    for (const p of portfolio) {
      const existing = findProject.get(p.name) as { id: number } | undefined;
      if (!existing) {
        insertProject.run({ name: p.name, description: p.description, owner_id: seedOwner, status: p.status });
      }
    }
  }

  // 2) Default Johnny agent
  const johnnyExisting = sqlite.prepare(`SELECT id FROM agents WHERE slug = 'johnny'`).get() as { id: number } | undefined;
  let johnnyId = johnnyExisting?.id;
  if (!johnnyId) {
    const result = sqlite.prepare(
      `INSERT INTO agents (name, slug, provider, model, capabilities, system_prompt, status, created_at)
       VALUES ('Johnny', 'johnny', 'anthropic', 'claude-sonnet-4-5',
               '["chat_reply","tool_use","planning"]',
               'You are Johnny, the Tendit project assistant. Be concise, helpful, and project-aware.',
               'active', datetime('now'))`
    ).run();
    johnnyId = Number(result.lastInsertRowid);
  }

  // 3) Default global assignment for chat_reply
  if (johnnyId) {
    const existingAssn = sqlite.prepare(
      `SELECT id FROM p9_agent_assignments WHERE agent_id = ? AND project_id IS NULL AND capability = 'chat_reply'`
    ).get(johnnyId);
    if (!existingAssn) {
      sqlite.prepare(
        `INSERT INTO p9_agent_assignments (agent_id, project_id, capability, priority, created_at)
         VALUES (?, NULL, 'chat_reply', 100, datetime('now'))`
      ).run(johnnyId);
    }
  }

  // 4) Credit packages
  const packages: Array<{ slug: string; name: string; credits: number; usd: number; ils: number; sort: number }> = [
    { slug: 'starter', name: 'Starter', credits: 100, usd: 500, ils: 1850, sort: 1 },
    { slug: 'growth', name: 'Growth', credits: 500, usd: 2000, ils: 7400, sort: 2 },
    { slug: 'pro', name: 'Pro', credits: 2000, usd: 7000, ils: 25900, sort: 3 },
    { slug: 'scale', name: 'Scale', credits: 10000, usd: 30000, ils: 111000, sort: 4 },
  ];
  const findPkg = sqlite.prepare(`SELECT id FROM credit_packages WHERE slug = ?`);
  const insertPkg = sqlite.prepare(
    `INSERT INTO credit_packages (slug, name, credits, price_usd, price_ils, active, sort_order)
     VALUES (@slug, @name, @credits, @usd, @ils, 1, @sort)`
  );
  for (const p of packages) {
    if (!findPkg.get(p.slug)) insertPkg.run(p);
  }
  console.log('[migrate] part IX seed completed');
} catch (e: any) {
  console.error('[migrate] part IX seed error:', e?.message);
}

// =====================================================
// PART X — PROJECT ARMS migrations (idempotent CREATE TABLE IF NOT EXISTS)
// =====================================================
// Extend the existing agents table with scope + display_name (arm AI managers).
for (const sqlStr of [
  `ALTER TABLE agents ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'`,
  `ALTER TABLE agents ADD COLUMN display_name TEXT`,
]) {
  try { sqlite.exec(sqlStr); } catch { /* column exists; ignore */ }
}
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS p10_arms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    owner_user_id INTEGER,
    arm_agent_id INTEGER NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'owner_private',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arm_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    current_version_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_document_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    author_user_id INTEGER,
    author_agent_id INTEGER,
    change_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arm_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    contact_info TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_target_instructions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id INTEGER NOT NULL,
    generated_by_agent_id INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    pending_action_id INTEGER,
    approved_by_user_id INTEGER,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arm_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    author_user_id INTEGER,
    agent_id INTEGER,
    audio_url TEXT,
    transcript TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS p10_arm_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arm_id INTEGER NOT NULL,
    agent_id INTEGER,
    action TEXT NOT NULL,
    credits_cost INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_p10_arms_project_slug ON p10_arms(project_id, slug);
  CREATE INDEX IF NOT EXISTS idx_p10_arms_project ON p10_arms(project_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arms_owner ON p10_arms(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_documents_arm ON p10_arm_documents(arm_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_doc_versions_doc ON p10_arm_document_versions(document_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_targets_arm ON p10_arm_targets(arm_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_target_instructions_target ON p10_arm_target_instructions(target_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_messages_arm ON p10_arm_messages(arm_id);
  CREATE INDEX IF NOT EXISTS idx_p10_arm_activity_arm ON p10_arm_activity_log(arm_id);
`);
console.log('[migrate] part X arms tables ensured');

// Seed Part X: 4 named arm agents + 4 default arms per project (idempotent).
try {
  const ARM_AGENTS: Array<{ slug: string; display: string; prompt: string }> = [
    { slug: 'arm-shira', display: 'Shira', prompt: "You are Shira, the providers operations manager. You are precise, deadline-driven, and treat every provider relationship as a logistics problem. You draft in clear bullet points. Always lead with timeline, never with price. You never send anything outbound without explicit human approval. You speak Hebrew or English depending on the user's language." },
    { slug: 'arm-maya', display: 'Maya', prompt: "You are Maya, the marketing operations manager. You are creative-strategic. You ask 'what's the angle?' before 'what's the channel?' You push back on lazy briefs. You have bilingual brand voice instincts (Hebrew + English). You never publish or send anything without human approval." },
    { slug: 'arm-eitan', display: 'Eitan', prompt: "You are Eitan, the legal operations manager. You are cautious and citation-heavy. You always list the 3 most likely failure modes for any proposed action. You default to risk-mitigation framing. You are NOT a lawyer and you always add a disclaimer when discussing legal matters. You never send communications without explicit approval." },
    { slug: 'arm-noa', display: 'Noa', prompt: "You are Noa, the finance operations manager. You are numbers-first and ROI-obsessed. You ask 'what's the payback period?' on every spend. You are cold, fast, decisive. You never authorize expenditure without human approval. You answer in tight bullets." },
  ];
  const findAgent = sqlite.prepare(`SELECT id FROM agents WHERE slug = ?`);
  const insertArmAgent = sqlite.prepare(
    `INSERT INTO agents (name, slug, provider, model, capabilities, system_prompt, status, scope, display_name, created_at)
     VALUES (@name, @slug, 'groq', 'groq/llama-3.3-70b-versatile', '["chat_reply","doc_assist","target_instructions"]', @prompt, 'active', 'arm', @display, datetime('now'))`
  );
  const armAgentIdBySlug: Record<string, number> = {};
  for (const a of ARM_AGENTS) {
    const existing = findAgent.get(a.slug) as { id: number } | undefined;
    if (existing) {
      armAgentIdBySlug[a.slug] = existing.id;
    } else {
      const r = insertArmAgent.run({ name: a.display, slug: a.slug, prompt: a.prompt, display: a.display });
      armAgentIdBySlug[a.slug] = Number(r.lastInsertRowid);
    }
  }

  // 4 default arms per existing project.
  const ARM_DEFS: Array<{ slug: string; name: string; agentSlug: string; docTitle: string }> = [
    { slug: 'providers', name: 'Providers', agentSlug: 'arm-shira', docTitle: 'How we talk to providers' },
    { slug: 'marketing', name: 'Marketing', agentSlug: 'arm-maya', docTitle: 'How we run marketing' },
    { slug: 'legal', name: 'Legal', agentSlug: 'arm-eitan', docTitle: 'How we handle legal' },
    { slug: 'finance', name: 'Finance', agentSlug: 'arm-noa', docTitle: 'How we manage finance' },
  ];
  const allProjects = sqlite.prepare(`SELECT id FROM projects`).all() as Array<{ id: number }>;
  const findArm = sqlite.prepare(`SELECT id FROM p10_arms WHERE project_id = ? AND slug = ?`);
  const insertArm = sqlite.prepare(
    `INSERT INTO p10_arms (project_id, name, slug, owner_user_id, arm_agent_id, visibility, is_active, created_at, updated_at)
     VALUES (@projectId, @name, @slug, NULL, @armAgentId, 'owner_private', 1, datetime('now'), datetime('now'))`
  );
  const insertDoc = sqlite.prepare(
    `INSERT INTO p10_arm_documents (arm_id, title, current_version_id, created_at, updated_at)
     VALUES (@armId, @title, NULL, datetime('now'), datetime('now'))`
  );
  let armsCreated = 0;
  for (const p of allProjects) {
    for (const def of ARM_DEFS) {
      if (findArm.get(p.id, def.slug)) continue;
      const armAgentId = armAgentIdBySlug[def.agentSlug];
      const r = insertArm.run({ projectId: p.id, name: def.name, slug: def.slug, armAgentId });
      const armId = Number(r.lastInsertRowid);
      // Seed an empty living document shell for the arm.
      insertDoc.run({ armId, title: def.docTitle });
      armsCreated++;
    }
  }
  console.log(`[migrate] part X seed completed: ${armsCreated} arms created across ${allProjects.length} projects`);
} catch (e: any) {
  console.error('[migrate] part X seed error:', e?.message);
}

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

  // Managed Sessions (Part VIII)
  listManagedSessions(userId: number): ManagedSession[];
  getManagedSession(id: number): ManagedSession | undefined;
  createManagedSession(data: InsertManagedSession): ManagedSession;
  updateSessionStatus(id: number, status: string): ManagedSession | undefined;
  touchSessionLastUsed(id: number): void;
  listSessionAccounts(sessionId: number): SessionAccount[];
  createSessionAccount(data: InsertSessionAccount): SessionAccount;

  // Pending Actions
  listPendingActions(filters: { sessionId?: number; status?: string }): PendingAction[];
  getPendingAction(id: number): PendingAction | undefined;
  createPendingAction(data: InsertPendingAction): PendingAction;
  updatePendingActionStatus(id: number, status: string): PendingAction | undefined;
  setPendingActionReminderSent(id: number, when: string): void;
  listPendingActionsNeedingReminder(beforeIso: string): PendingAction[];

  // Action Approvals + Audit Log
  createActionApproval(data: InsertActionApproval): ActionApproval;
  listActionApprovals(actionId: number): ActionApproval[];
  recordAuditEvent(data: InsertActionAuditLog): ActionAuditLog;
  listAuditLog(actionId: number): ActionAuditLog[];

  // --- Part IX: Agents (Part IX `agents` table; distinct from `platform_agents`) ---
  listP9Agents(): Agent[];
  getP9Agent(id: number): Agent | undefined;
  getP9AgentBySlug(slug: string): Agent | undefined;
  createP9Agent(data: InsertAgent): Agent;
  updateP9Agent(id: number, patch: Partial<InsertAgent>): Agent | undefined;

  // --- Part IX: Agent assignments ---
  createAgentAssignment(data: InsertP9AgentAssignment): P9AgentAssignment;
  listAgentAssignments(filters?: { projectId?: number | null; capability?: string }): P9AgentAssignment[];
  deleteAgentAssignment(id: number): void;
  resolveAgent(projectId: number, capability: string): Agent | undefined;

  // --- Part IX: Milestones ---
  createMilestone(data: InsertMilestone): Milestone;
  listProjectMilestones(projectId: number): Milestone[];
  getMilestone(id: number): Milestone | undefined;
  updateMilestoneStatus(id: number, status: string, completedBy?: number): Milestone | undefined;
  updateMilestone(id: number, patch: Partial<InsertMilestone>): Milestone | undefined;
  addMilestoneDep(milestoneId: number, dependsOnId: number): MilestoneDep;
  removeMilestoneDep(id: number): void;
  getMilestoneDeps(milestoneId: number): MilestoneDep[];
  getMilestonesReadyToUnlock(): Milestone[];

  // --- Part IX: Credits ---
  ensureUserCreditsRow(userId: number): UserCredits;
  ensureProjectCreditsRow(projectId: number): ProjectCredits;
  getUserCredits(userId: number): UserCredits;
  getProjectCredits(projectId: number): ProjectCredits;
  debitCredits(args: { userId: number; projectId?: number | null; amount: number; txnType?: string; actionRef?: string; note?: string }):
    { ok: true; balanceAfter: number; queued: false }
    | { ok: false; queued: true; queueId: number; reason: string };
  creditCredits(args: { userId: number; projectId?: number | null; amount: number; txnType?: string; stripeChargeId?: string; note?: string }):
    { ok: true; balanceAfter: number; settled: number };
  settleOverdraft(target: { projectId?: number; userId?: number }, amount: number): number;
  listCreditLedger(filters?: { userId?: number; projectId?: number; limit?: number }): CreditLedger[];

  // --- Part IX: System credit queue ---
  createQueuedAction(data: InsertSystemCreditQueue): SystemCreditQueue;
  listSystemQueue(status?: string): SystemCreditQueue[];
  approveQueuedAction(queueId: number, adminId: number): SystemCreditQueue | undefined;
  denyQueuedAction(queueId: number, adminId: number, note?: string): SystemCreditQueue | undefined;

  // --- Part IX: Credit packages ---
  listCreditPackages(): CreditPackage[];
  getCreditPackageBySlug(slug: string): CreditPackage | undefined;

  // --- Part IX: Auth profiles ---
  listAuthProfiles(provider?: string): AuthProfile[];
  pickAuthProfile(provider: string): AuthProfile | undefined;
  incrementProfileUsage(profileId: number): void;

  // --- Part IX: Project messages voice helper ---
  transcribeAndStoreVoice(messageId: number, transcript: string): void;

  // =====================================================
  // PART X — PROJECT ARMS
  // =====================================================
  // Arms (visibility-aware reads enforced on every list/get)
  listArms(projectId: number, requestingUserId: number, isAdmin: boolean): Arm[];
  getArm(armId: number): Arm | undefined;
  getArmBySlug(projectId: number, slug: string): Arm | undefined;
  canViewArm(arm: Arm, requestingUserId: number, isAdmin: boolean): boolean;
  createArm(data: InsertArm): Arm;
  updateArm(armId: number, patch: Partial<InsertArm>): Arm | undefined;
  // Arm chat messages
  listArmMessages(armId: number, limit?: number): ArmMessage[];
  createArmMessage(data: InsertArmMessage): ArmMessage;
  // Living documents + versions
  getArmDocument(armId: number): ArmDocument | undefined;
  ensureArmDocument(armId: number, title: string): ArmDocument;
  listArmDocumentVersions(documentId: number): ArmDocumentVersion[];
  getArmDocumentVersion(versionId: number): ArmDocumentVersion | undefined;
  createArmDocumentVersion(args: { documentId: number; content: string; authorUserId?: number | null; authorAgentId?: number | null; changeNote?: string | null }): ArmDocumentVersion;
  restoreArmDocumentVersion(documentId: number, versionId: number, authorUserId?: number | null): ArmDocumentVersion | undefined;
  // Targets
  listArmTargets(armId: number): ArmTarget[];
  getArmTarget(targetId: number): ArmTarget | undefined;
  createArmTarget(data: InsertArmTarget): ArmTarget;
  updateArmTarget(targetId: number, patch: Partial<InsertArmTarget>): ArmTarget | undefined;
  // Target instructions (approval-gated outbound)
  listArmTargetInstructions(targetId: number): ArmTargetInstruction[];
  getArmTargetInstruction(instructionId: number): ArmTargetInstruction | undefined;
  createArmTargetInstruction(data: InsertArmTargetInstruction): ArmTargetInstruction;
  updateArmTargetInstruction(instructionId: number, patch: Partial<InsertArmTargetInstruction> & { approvedAt?: string | null }): ArmTargetInstruction | undefined;
  // Activity log
  logArmActivity(args: { armId: number; agentId?: number | null; action: string; creditsCost?: number; metadata?: any }): ArmActivityLog;
  listArmActivity(armId: number, limit?: number): ArmActivityLog[];
  // Admin dashboard aggregates
  getArmsDashboard(): {
    totalArms: number; activeArms: number; ownerlessArms: number;
    byAgent: Array<{ agentId: number; displayName: string | null; slug: string; armCount: number; messageCount: number; creditsSpent: number }>;
    pendingInstructions: number;
    recentActivity: Array<ArmActivityLog & { armName?: string; projectId?: number }>;
    arms: Array<Arm & { projectName?: string; agentDisplayName?: string | null; ownerEmail?: string | null; messageCount: number; targetCount: number; creditsSpent: number }>;
  };
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

  // =====================================================
  // Managed Sessions (Part VIII)
  // =====================================================

  listManagedSessions(userId: number): ManagedSession[] {
    return db.select().from(managedSessions)
      .where(eq(managedSessions.userId, userId))
      .orderBy(desc(managedSessions.createdAt))
      .all();
  }

  getManagedSession(id: number): ManagedSession | undefined {
    return db.select().from(managedSessions).where(eq(managedSessions.id, id)).get();
  }

  createManagedSession(data: InsertManagedSession): ManagedSession {
    return db.insert(managedSessions).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  updateSessionStatus(id: number, status: string): ManagedSession | undefined {
    db.update(managedSessions).set({ status }).where(eq(managedSessions.id, id)).run();
    return this.getManagedSession(id);
  }

  touchSessionLastUsed(id: number): void {
    db.update(managedSessions)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(managedSessions.id, id))
      .run();
  }

  listSessionAccounts(sessionId: number): SessionAccount[] {
    return db.select().from(sessionAccounts)
      .where(eq(sessionAccounts.sessionId, sessionId))
      .all();
  }

  createSessionAccount(data: InsertSessionAccount): SessionAccount {
    return db.insert(sessionAccounts).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  // --- Pending Actions ---

  listPendingActions(filters: { sessionId?: number; status?: string }): PendingAction[] {
    const conds: any[] = [];
    if (filters.sessionId !== undefined) conds.push(eq(pendingActions.sessionId, filters.sessionId));
    if (filters.status) conds.push(eq(pendingActions.status, filters.status));
    const q = conds.length
      ? db.select().from(pendingActions).where(and(...conds))
      : db.select().from(pendingActions);
    return q.orderBy(desc(pendingActions.createdAt)).all();
  }

  getPendingAction(id: number): PendingAction | undefined {
    return db.select().from(pendingActions).where(eq(pendingActions.id, id)).get();
  }

  createPendingAction(data: InsertPendingAction): PendingAction {
    return db.insert(pendingActions).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  updatePendingActionStatus(id: number, status: string): PendingAction | undefined {
    db.update(pendingActions).set({ status }).where(eq(pendingActions.id, id)).run();
    return this.getPendingAction(id);
  }

  setPendingActionReminderSent(id: number, when: string): void {
    db.update(pendingActions).set({ reminderSentAt: when }).where(eq(pendingActions.id, id)).run();
  }

  listPendingActionsNeedingReminder(beforeIso: string): PendingAction[] {
    return db.select().from(pendingActions)
      .where(and(
        eq(pendingActions.status, "pending"),
        isNull(pendingActions.reminderSentAt),
        lte(pendingActions.createdAt, beforeIso),
      ))
      .all();
  }

  // --- Action Approvals + Audit ---

  createActionApproval(data: InsertActionApproval): ActionApproval {
    return db.insert(actionApprovals).values({
      ...data,
      decidedAt: new Date().toISOString(),
    }).returning().get();
  }

  listActionApprovals(actionId: number): ActionApproval[] {
    return db.select().from(actionApprovals)
      .where(eq(actionApprovals.actionId, actionId))
      .orderBy(desc(actionApprovals.decidedAt))
      .all();
  }

  recordAuditEvent(data: InsertActionAuditLog): ActionAuditLog {
    return db.insert(actionAuditLog).values({
      ...data,
      eventAt: new Date().toISOString(),
    }).returning().get();
  }

  listAuditLog(actionId: number): ActionAuditLog[] {
    return db.select().from(actionAuditLog)
      .where(eq(actionAuditLog.actionId, actionId))
      .orderBy(actionAuditLog.eventAt)
      .all();
  }

  // =====================================================
  // PART IX implementations
  // =====================================================

  // --- Part IX Agents ---
  listP9Agents(): Agent[] {
    return db.select().from(agents).orderBy(desc(agents.createdAt)).all();
  }
  getP9Agent(id: number): Agent | undefined {
    return db.select().from(agents).where(eq(agents.id, id)).get();
  }
  getP9AgentBySlug(slug: string): Agent | undefined {
    return db.select().from(agents).where(eq(agents.slug, slug)).get();
  }
  createP9Agent(data: InsertAgent): Agent {
    return db.insert(agents).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  updateP9Agent(id: number, patch: Partial<InsertAgent>): Agent | undefined {
    db.update(agents).set(patch as any).where(eq(agents.id, id)).run();
    return this.getP9Agent(id);
  }

  // --- Agent assignments ---
  createAgentAssignment(data: InsertP9AgentAssignment): P9AgentAssignment {
    return db.insert(p9AgentAssignments).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  listAgentAssignments(filters: { projectId?: number | null; capability?: string } = {}): P9AgentAssignment[] {
    const conds: any[] = [];
    if (filters.projectId === null) conds.push(isNull(p9AgentAssignments.projectId));
    else if (filters.projectId !== undefined) conds.push(eq(p9AgentAssignments.projectId, filters.projectId));
    if (filters.capability) conds.push(eq(p9AgentAssignments.capability, filters.capability));
    const q = conds.length
      ? db.select().from(p9AgentAssignments).where(and(...conds))
      : db.select().from(p9AgentAssignments);
    return q.orderBy(p9AgentAssignments.priority).all();
  }
  deleteAgentAssignment(id: number): void {
    db.delete(p9AgentAssignments).where(eq(p9AgentAssignments.id, id)).run();
  }
  resolveAgent(projectId: number, capability: string): Agent | undefined {
    // 1) project-specific
    const projectRow = db.select().from(p9AgentAssignments)
      .where(and(eq(p9AgentAssignments.projectId, projectId), eq(p9AgentAssignments.capability, capability)))
      .orderBy(p9AgentAssignments.priority)
      .get();
    if (projectRow) {
      const a = this.getP9Agent(projectRow.agentId);
      if (a) return a;
    }
    // 2) global default (projectId IS NULL)
    const globalRow = db.select().from(p9AgentAssignments)
      .where(and(isNull(p9AgentAssignments.projectId), eq(p9AgentAssignments.capability, capability)))
      .orderBy(p9AgentAssignments.priority)
      .get();
    if (globalRow) {
      const a = this.getP9Agent(globalRow.agentId);
      if (a) return a;
    }
    // 3) fallback Johnny
    return this.getP9AgentBySlug("johnny");
  }

  // --- Milestones ---
  createMilestone(data: InsertMilestone): Milestone {
    return db.insert(milestones).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  listProjectMilestones(projectId: number): Milestone[] {
    return db.select().from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(milestones.dueDate)
      .all();
  }
  getMilestone(id: number): Milestone | undefined {
    return db.select().from(milestones).where(eq(milestones.id, id)).get();
  }
  updateMilestoneStatus(id: number, status: string, completedBy?: number): Milestone | undefined {
    const patch: any = { status };
    if (status === "done") {
      patch.completedAt = new Date().toISOString();
      if (completedBy) patch.completedBy = completedBy;
    }
    db.update(milestones).set(patch).where(eq(milestones.id, id)).run();
    return this.getMilestone(id);
  }
  updateMilestone(id: number, patch: Partial<InsertMilestone>): Milestone | undefined {
    db.update(milestones).set(patch as any).where(eq(milestones.id, id)).run();
    return this.getMilestone(id);
  }
  addMilestoneDep(milestoneId: number, dependsOnId: number): MilestoneDep {
    return db.insert(milestoneDeps).values({ milestoneId, dependsOnMilestoneId: dependsOnId }).returning().get();
  }
  removeMilestoneDep(id: number): void {
    db.delete(milestoneDeps).where(eq(milestoneDeps.id, id)).run();
  }
  getMilestoneDeps(milestoneId: number): MilestoneDep[] {
    return db.select().from(milestoneDeps).where(eq(milestoneDeps.milestoneId, milestoneId)).all();
  }
  getMilestonesReadyToUnlock(): Milestone[] {
    // Locked milestones whose every dependency is done.
    const locked = db.select().from(milestones).where(eq(milestones.status, "locked")).all();
    const ready: Milestone[] = [];
    for (const m of locked) {
      const deps = this.getMilestoneDeps(m.id);
      if (deps.length === 0) continue; // no deps — don't auto-unlock; admin sets these explicitly
      let allDone = true;
      for (const d of deps) {
        const prereq = this.getMilestone(d.dependsOnMilestoneId);
        if (!prereq || prereq.status !== "done") { allDone = false; break; }
      }
      if (allDone) ready.push(m);
    }
    return ready;
  }

  // --- Credits ---
  ensureUserCreditsRow(userId: number): UserCredits {
    const existing = db.select().from(userCredits).where(eq(userCredits.userId, userId)).get();
    if (existing) return existing;
    return db.insert(userCredits).values({
      userId, balance: 0, overdraftBalance: 0,
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }
  ensureProjectCreditsRow(projectId: number): ProjectCredits {
    const existing = db.select().from(projectCredits).where(eq(projectCredits.projectId, projectId)).get();
    if (existing) return existing;
    return db.insert(projectCredits).values({
      projectId, balance: 0, overdraftBalance: 0, overdraftCeiling: 500,
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }
  getUserCredits(userId: number): UserCredits {
    return this.ensureUserCreditsRow(userId);
  }
  getProjectCredits(projectId: number): ProjectCredits {
    return this.ensureProjectCreditsRow(projectId);
  }
  debitCredits(args: { userId: number; projectId?: number | null; amount: number; txnType?: string; actionRef?: string; note?: string }):
    { ok: true; balanceAfter: number; queued: false }
    | { ok: false; queued: true; queueId: number; reason: string }
  {
    const { userId, projectId, amount } = args;
    const txnType = args.txnType || "debit";
    const amt = Math.max(0, Math.ceil(amount));
    if (amt === 0) {
      return { ok: true, balanceAfter: projectId ? this.getProjectCredits(projectId).balance : this.getUserCredits(userId).balance, queued: false };
    }
    if (projectId) {
      const pc = this.ensureProjectCreditsRow(projectId);
      if (pc.balance >= amt) {
        const newBal = pc.balance - amt;
        db.update(projectCredits).set({ balance: newBal, updatedAt: new Date().toISOString() })
          .where(eq(projectCredits.projectId, projectId)).run();
        db.insert(creditLedger).values({
          projectId, userId, txnType, amount: -amt, balanceAfter: newBal,
          actionRef: args.actionRef || null, stripeChargeId: null, note: args.note || null,
          createdAt: new Date().toISOString(),
        }).run();
        return { ok: true, balanceAfter: newBal, queued: false };
      }
      // Balance exhausted — queue for system approval
      const queued = db.insert(systemCreditQueue).values({
        projectId, userId, actionPayload: JSON.stringify({ amount: amt, actionRef: args.actionRef, note: args.note }),
        estimatedCredits: amt, status: "awaiting",
        requestedAt: new Date().toISOString(),
      }).returning().get();
      return { ok: false, queued: true, queueId: queued.id, reason: "project_balance_exhausted" };
    } else {
      const uc = this.ensureUserCreditsRow(userId);
      if (uc.balance >= amt) {
        const newBal = uc.balance - amt;
        db.update(userCredits).set({ balance: newBal, updatedAt: new Date().toISOString() })
          .where(eq(userCredits.userId, userId)).run();
        db.insert(creditLedger).values({
          projectId: null, userId, txnType, amount: -amt, balanceAfter: newBal,
          actionRef: args.actionRef || null, stripeChargeId: null, note: args.note || null,
          createdAt: new Date().toISOString(),
        }).run();
        return { ok: true, balanceAfter: newBal, queued: false };
      }
      // Personal balance exhausted: still queue (admins can decide).
      const queued = db.insert(systemCreditQueue).values({
        projectId: 0 as any, userId, actionPayload: JSON.stringify({ amount: amt, actionRef: args.actionRef, note: args.note }),
        estimatedCredits: amt, status: "awaiting",
        requestedAt: new Date().toISOString(),
      }).returning().get();
      return { ok: false, queued: true, queueId: queued.id, reason: "user_balance_exhausted" };
    }
  }
  creditCredits(args: { userId: number; projectId?: number | null; amount: number; txnType?: string; stripeChargeId?: string; note?: string }):
    { ok: true; balanceAfter: number; settled: number }
  {
    const { userId, projectId, amount } = args;
    const txnType = args.txnType || "credit";
    const amt = Math.max(0, Math.ceil(amount));
    let settled = 0;
    let remaining = amt;
    if (projectId) {
      const pc = this.ensureProjectCreditsRow(projectId);
      if (pc.overdraftBalance > 0 && remaining > 0) {
        settled = Math.min(pc.overdraftBalance, remaining);
        remaining -= settled;
        db.update(projectCredits).set({
          overdraftBalance: pc.overdraftBalance - settled,
          updatedAt: new Date().toISOString(),
        }).where(eq(projectCredits.projectId, projectId)).run();
        db.insert(creditLedger).values({
          projectId, userId, txnType: "overdraft_settle", amount: -settled,
          balanceAfter: pc.overdraftBalance - settled,
          actionRef: null, stripeChargeId: args.stripeChargeId || null,
          note: args.note || "overdraft settlement",
          createdAt: new Date().toISOString(),
        }).run();
      }
      const newBal = (this.getProjectCredits(projectId).balance) + remaining;
      db.update(projectCredits).set({ balance: newBal, updatedAt: new Date().toISOString() })
        .where(eq(projectCredits.projectId, projectId)).run();
      db.insert(creditLedger).values({
        projectId, userId, txnType, amount: remaining, balanceAfter: newBal,
        actionRef: null, stripeChargeId: args.stripeChargeId || null, note: args.note || null,
        createdAt: new Date().toISOString(),
      }).run();
      return { ok: true, balanceAfter: newBal, settled };
    }
    const uc = this.ensureUserCreditsRow(userId);
    if (uc.overdraftBalance > 0 && remaining > 0) {
      settled = Math.min(uc.overdraftBalance, remaining);
      remaining -= settled;
      db.update(userCredits).set({
        overdraftBalance: uc.overdraftBalance - settled,
        updatedAt: new Date().toISOString(),
      }).where(eq(userCredits.userId, userId)).run();
      db.insert(creditLedger).values({
        projectId: null, userId, txnType: "overdraft_settle", amount: -settled,
        balanceAfter: uc.overdraftBalance - settled,
        actionRef: null, stripeChargeId: args.stripeChargeId || null,
        note: args.note || "overdraft settlement",
        createdAt: new Date().toISOString(),
      }).run();
    }
    const newBal = this.getUserCredits(userId).balance + remaining;
    db.update(userCredits).set({ balance: newBal, updatedAt: new Date().toISOString() })
      .where(eq(userCredits.userId, userId)).run();
    db.insert(creditLedger).values({
      projectId: null, userId, txnType, amount: remaining, balanceAfter: newBal,
      actionRef: null, stripeChargeId: args.stripeChargeId || null, note: args.note || null,
      createdAt: new Date().toISOString(),
    }).run();
    return { ok: true, balanceAfter: newBal, settled };
  }
  settleOverdraft(target: { projectId?: number; userId?: number }, amount: number): number {
    const amt = Math.max(0, Math.ceil(amount));
    if (target.projectId) {
      const pc = this.ensureProjectCreditsRow(target.projectId);
      const newOd = pc.overdraftBalance + amt;
      db.update(projectCredits).set({ overdraftBalance: newOd, updatedAt: new Date().toISOString() })
        .where(eq(projectCredits.projectId, target.projectId)).run();
      return newOd;
    }
    if (target.userId) {
      const uc = this.ensureUserCreditsRow(target.userId);
      const newOd = uc.overdraftBalance + amt;
      db.update(userCredits).set({ overdraftBalance: newOd, updatedAt: new Date().toISOString() })
        .where(eq(userCredits.userId, target.userId)).run();
      return newOd;
    }
    return 0;
  }
  listCreditLedger(filters: { userId?: number; projectId?: number; limit?: number } = {}): CreditLedger[] {
    const conds: any[] = [];
    if (filters.userId !== undefined) conds.push(eq(creditLedger.userId, filters.userId));
    if (filters.projectId !== undefined) conds.push(eq(creditLedger.projectId, filters.projectId));
    const q = conds.length
      ? db.select().from(creditLedger).where(and(...conds))
      : db.select().from(creditLedger);
    return q.orderBy(desc(creditLedger.createdAt)).limit(filters.limit || 50).all();
  }

  // --- System credit queue ---
  createQueuedAction(data: InsertSystemCreditQueue): SystemCreditQueue {
    return db.insert(systemCreditQueue).values({
      ...data,
      requestedAt: data.requestedAt || new Date().toISOString(),
    }).returning().get();
  }
  listSystemQueue(status?: string): SystemCreditQueue[] {
    const q = status
      ? db.select().from(systemCreditQueue).where(eq(systemCreditQueue.status, status))
      : db.select().from(systemCreditQueue);
    return q.orderBy(desc(systemCreditQueue.requestedAt)).all();
  }
  approveQueuedAction(queueId: number, adminId: number): SystemCreditQueue | undefined {
    db.update(systemCreditQueue).set({
      status: "approved", approvedBy: adminId, approvedAt: new Date().toISOString(),
    }).where(eq(systemCreditQueue.id, queueId)).run();
    const row = db.select().from(systemCreditQueue).where(eq(systemCreditQueue.id, queueId)).get();
    if (!row) return undefined;
    // Apply approved amount as overdraft on the project (within ceiling).
    if (row.projectId && row.projectId > 0) {
      const pc = this.ensureProjectCreditsRow(row.projectId);
      const ceiling = pc.overdraftCeiling || 500;
      const grant = Math.min(row.estimatedCredits, Math.max(0, ceiling - pc.overdraftBalance));
      if (grant > 0) {
        this.settleOverdraft({ projectId: row.projectId }, grant);
        db.insert(creditLedger).values({
          projectId: row.projectId, userId: row.userId, txnType: "debit", amount: -grant,
          balanceAfter: pc.balance,
          actionRef: `queue:${row.id}`, stripeChargeId: null,
          note: "approved overdraft grant",
          createdAt: new Date().toISOString(),
        }).run();
      }
    }
    return row;
  }
  denyQueuedAction(queueId: number, adminId: number, note?: string): SystemCreditQueue | undefined {
    db.update(systemCreditQueue).set({
      status: "denied", approvedBy: adminId, approvedAt: new Date().toISOString(),
      resultRef: note || null,
    }).where(eq(systemCreditQueue.id, queueId)).run();
    return db.select().from(systemCreditQueue).where(eq(systemCreditQueue.id, queueId)).get();
  }

  // --- Credit packages ---
  listCreditPackages(): CreditPackage[] {
    return db.select().from(creditPackages).where(eq(creditPackages.active, true)).orderBy(creditPackages.sortOrder).all();
  }
  getCreditPackageBySlug(slug: string): CreditPackage | undefined {
    return db.select().from(creditPackages).where(eq(creditPackages.slug, slug)).get();
  }

  // --- Auth profiles (rotation pool) ---
  listAuthProfiles(provider?: string): AuthProfile[] {
    const q = provider
      ? db.select().from(authProfiles).where(eq(authProfiles.provider, provider))
      : db.select().from(authProfiles);
    return q.orderBy(authProfiles.lastUsedAt).all();
  }
  pickAuthProfile(provider: string): AuthProfile | undefined {
    // Round-robin among status=active with remaining quota (lastUsedAt nulls-first via ORDER BY).
    const rows = db.select().from(authProfiles)
      .where(and(eq(authProfiles.provider, provider), eq(authProfiles.status, "active")))
      .orderBy(authProfiles.lastUsedAt)
      .all();
    for (const r of rows) {
      if (r.dailyQuota === 0 || r.dailyUsed < r.dailyQuota) return r;
    }
    return undefined;
  }
  incrementProfileUsage(profileId: number): void {
    const row = db.select().from(authProfiles).where(eq(authProfiles.id, profileId)).get();
    if (!row) return;
    db.update(authProfiles).set({
      dailyUsed: (row.dailyUsed || 0) + 1,
      lastUsedAt: new Date().toISOString(),
    }).where(eq(authProfiles.id, profileId)).run();
  }

  // --- Project messages voice helper ---
  transcribeAndStoreVoice(messageId: number, transcript: string): void {
    db.update(projectMessages).set({ transcript }).where(eq(projectMessages.id, messageId)).run();
  }

  // Update content of an existing project message (used by chat_reply approval flow)
  updateProjectMessageContent(messageId: number, content: string): void {
    db.update(projectMessages).set({ content, isAck: false }).where(eq(projectMessages.id, messageId)).run();
  }

  // =====================================================
  // PART X — PROJECT ARMS implementations
  // =====================================================

  // --- Visibility ---
  // owner_private: only the assigned owner (or, if unassigned, any admin) may read.
  // project_public: any project member may read. Admins can always read.
  canViewArm(arm: Arm, requestingUserId: number, isAdmin: boolean): boolean {
    if (isAdmin) return true;
    if (arm.visibility === "project_public") {
      return this.isUserInProject(arm.projectId, requestingUserId);
    }
    // owner_private
    if (arm.ownerUserId != null) return arm.ownerUserId === requestingUserId;
    // unassigned owner_private arm: visible to project members (so they can claim it)
    return this.isUserInProject(arm.projectId, requestingUserId);
  }

  // --- Arms ---
  listArms(projectId: number, requestingUserId: number, isAdmin: boolean): Arm[] {
    const rows = db.select().from(arms)
      .where(eq(arms.projectId, projectId))
      .orderBy(arms.id)
      .all();
    return rows.filter((a) => this.canViewArm(a, requestingUserId, isAdmin));
  }
  getArm(armId: number): Arm | undefined {
    return db.select().from(arms).where(eq(arms.id, armId)).get();
  }
  getArmBySlug(projectId: number, slug: string): Arm | undefined {
    return db.select().from(arms)
      .where(and(eq(arms.projectId, projectId), eq(arms.slug, slug))).get();
  }
  createArm(data: InsertArm): Arm {
    const now = new Date().toISOString();
    return db.insert(arms).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }
  updateArm(armId: number, patch: Partial<InsertArm>): Arm | undefined {
    db.update(arms).set({ ...(patch as any), updatedAt: new Date().toISOString() })
      .where(eq(arms.id, armId)).run();
    return this.getArm(armId);
  }

  // --- Arm chat messages ---
  listArmMessages(armId: number, limit = 100): ArmMessage[] {
    return db.select().from(armMessages)
      .where(eq(armMessages.armId, armId))
      .orderBy(armMessages.id)
      .limit(limit)
      .all();
  }
  createArmMessage(data: InsertArmMessage): ArmMessage {
    return db.insert(armMessages).values({
      ...data, createdAt: new Date().toISOString(),
    }).returning().get();
  }

  // --- Living documents + versions ---
  getArmDocument(armId: number): ArmDocument | undefined {
    return db.select().from(armDocuments).where(eq(armDocuments.armId, armId)).get();
  }
  ensureArmDocument(armId: number, title: string): ArmDocument {
    const existing = this.getArmDocument(armId);
    if (existing) return existing;
    const now = new Date().toISOString();
    return db.insert(armDocuments).values({
      armId, title, currentVersionId: null, createdAt: now, updatedAt: now,
    }).returning().get();
  }
  listArmDocumentVersions(documentId: number): ArmDocumentVersion[] {
    return db.select().from(armDocumentVersions)
      .where(eq(armDocumentVersions.documentId, documentId))
      .orderBy(desc(armDocumentVersions.versionNumber))
      .all();
  }
  getArmDocumentVersion(versionId: number): ArmDocumentVersion | undefined {
    return db.select().from(armDocumentVersions).where(eq(armDocumentVersions.id, versionId)).get();
  }
  createArmDocumentVersion(args: { documentId: number; content: string; authorUserId?: number | null; authorAgentId?: number | null; changeNote?: string | null }): ArmDocumentVersion {
    const last = db.select().from(armDocumentVersions)
      .where(eq(armDocumentVersions.documentId, args.documentId))
      .orderBy(desc(armDocumentVersions.versionNumber)).get();
    const nextNum = (last?.versionNumber || 0) + 1;
    const v = db.insert(armDocumentVersions).values({
      documentId: args.documentId,
      versionNumber: nextNum,
      content: args.content,
      authorUserId: args.authorUserId ?? null,
      authorAgentId: args.authorAgentId ?? null,
      changeNote: args.changeNote ?? null,
      createdAt: new Date().toISOString(),
    }).returning().get();
    db.update(armDocuments).set({ currentVersionId: v.id, updatedAt: new Date().toISOString() })
      .where(eq(armDocuments.id, args.documentId)).run();
    return v;
  }
  restoreArmDocumentVersion(documentId: number, versionId: number, authorUserId?: number | null): ArmDocumentVersion | undefined {
    const src = this.getArmDocumentVersion(versionId);
    if (!src || src.documentId !== documentId) return undefined;
    // Restore creates a new version copying the old content (non-destructive history).
    return this.createArmDocumentVersion({
      documentId,
      content: src.content,
      authorUserId: authorUserId ?? null,
      changeNote: `Restored from v${src.versionNumber}`,
    });
  }

  // --- Targets ---
  listArmTargets(armId: number): ArmTarget[] {
    return db.select().from(armTargets)
      .where(eq(armTargets.armId, armId))
      .orderBy(desc(armTargets.id)).all();
  }
  getArmTarget(targetId: number): ArmTarget | undefined {
    return db.select().from(armTargets).where(eq(armTargets.id, targetId)).get();
  }
  createArmTarget(data: InsertArmTarget): ArmTarget {
    return db.insert(armTargets).values({
      ...data, createdAt: new Date().toISOString(),
    }).returning().get();
  }
  updateArmTarget(targetId: number, patch: Partial<InsertArmTarget>): ArmTarget | undefined {
    db.update(armTargets).set(patch as any).where(eq(armTargets.id, targetId)).run();
    return this.getArmTarget(targetId);
  }

  // --- Target instructions (approval-gated outbound) ---
  listArmTargetInstructions(targetId: number): ArmTargetInstruction[] {
    return db.select().from(armTargetInstructions)
      .where(eq(armTargetInstructions.targetId, targetId))
      .orderBy(desc(armTargetInstructions.id)).all();
  }
  getArmTargetInstruction(instructionId: number): ArmTargetInstruction | undefined {
    return db.select().from(armTargetInstructions).where(eq(armTargetInstructions.id, instructionId)).get();
  }
  createArmTargetInstruction(data: InsertArmTargetInstruction): ArmTargetInstruction {
    return db.insert(armTargetInstructions).values({
      ...data, createdAt: new Date().toISOString(),
    }).returning().get();
  }
  updateArmTargetInstruction(instructionId: number, patch: Partial<InsertArmTargetInstruction> & { approvedAt?: string | null }): ArmTargetInstruction | undefined {
    db.update(armTargetInstructions).set(patch as any).where(eq(armTargetInstructions.id, instructionId)).run();
    return this.getArmTargetInstruction(instructionId);
  }

  // --- Activity log ---
  logArmActivity(args: { armId: number; agentId?: number | null; action: string; creditsCost?: number; metadata?: any }): ArmActivityLog {
    return db.insert(armActivityLog).values({
      armId: args.armId,
      agentId: args.agentId ?? null,
      action: args.action,
      creditsCost: args.creditsCost ?? 0,
      metadata: args.metadata != null ? (typeof args.metadata === "string" ? args.metadata : JSON.stringify(args.metadata)) : null,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
  listArmActivity(armId: number, limit = 50): ArmActivityLog[] {
    return db.select().from(armActivityLog)
      .where(eq(armActivityLog.armId, armId))
      .orderBy(desc(armActivityLog.id))
      .limit(limit).all();
  }

  // --- Admin dashboard aggregates ---
  getArmsDashboard() {
    const allArms = db.select().from(arms).orderBy(arms.projectId, arms.id).all();
    const allAgents = db.select().from(agents).where(eq(agents.scope, "arm")).all();
    const agentById = new Map<number, Agent>(allAgents.map((a) => [a.id, a]));
    const allProjects = db.select().from(projects).all();
    const projectName = new Map<number, string>(allProjects.map((p) => [p.id, (p as any).name]));

    // Per-arm message + target + credit aggregates
    const msgCounts = new Map<number, number>();
    for (const r of db.select().from(armMessages).all()) {
      msgCounts.set(r.armId, (msgCounts.get(r.armId) || 0) + 1);
    }
    const targetCounts = new Map<number, number>();
    for (const r of db.select().from(armTargets).all()) {
      targetCounts.set(r.armId, (targetCounts.get(r.armId) || 0) + 1);
    }
    const creditByArm = new Map<number, number>();
    const allActivity = db.select().from(armActivityLog).orderBy(desc(armActivityLog.id)).all();
    for (const r of allActivity) {
      creditByArm.set(r.armId, (creditByArm.get(r.armId) || 0) + (r.creditsCost || 0));
    }

    // Owner emails
    const ownerEmail = new Map<number, string>();
    const allUsers = db.select().from(users).all();
    for (const u of allUsers) ownerEmail.set(u.id, (u as any).email);

    const armName = new Map<number, string>(allArms.map((a) => [a.id, a.name]));
    const armProject = new Map<number, number>(allArms.map((a) => [a.id, a.projectId]));

    const byAgentMap = new Map<number, { agentId: number; displayName: string | null; slug: string; armCount: number; messageCount: number; creditsSpent: number }>();
    for (const a of allArms) {
      const ag = agentById.get(a.armAgentId);
      const key = a.armAgentId;
      if (!byAgentMap.has(key)) {
        byAgentMap.set(key, { agentId: key, displayName: ag?.displayName ?? null, slug: ag?.slug ?? "", armCount: 0, messageCount: 0, creditsSpent: 0 });
      }
      const e = byAgentMap.get(key)!;
      e.armCount += 1;
      e.messageCount += msgCounts.get(a.id) || 0;
      e.creditsSpent += creditByArm.get(a.id) || 0;
    }

    const pendingInstructions = (db.select().from(armTargetInstructions)
      .where(eq(armTargetInstructions.status, "draft")).all()).length;

    return {
      totalArms: allArms.length,
      activeArms: allArms.filter((a) => a.isActive).length,
      ownerlessArms: allArms.filter((a) => a.ownerUserId == null).length,
      byAgent: Array.from(byAgentMap.values()),
      pendingInstructions,
      recentActivity: allActivity.slice(0, 20).map((r) => ({
        ...r,
        armName: armName.get(r.armId),
        projectId: armProject.get(r.armId),
      })),
      arms: allArms.map((a) => ({
        ...a,
        projectName: projectName.get(a.projectId),
        agentDisplayName: agentById.get(a.armAgentId)?.displayName ?? null,
        ownerEmail: a.ownerUserId != null ? (ownerEmail.get(a.ownerUserId) ?? null) : null,
        messageCount: msgCounts.get(a.id) || 0,
        targetCount: targetCounts.get(a.id) || 0,
        creditsSpent: creditByArm.get(a.id) || 0,
      })),
    };
  }
}

export const storage = new DatabaseStorage();
