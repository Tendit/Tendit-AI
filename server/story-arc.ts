/**
 * Story Arc Engine
 * 
 * 1. Lightweight topic/category extraction from chat messages (no extra API calls)
 * 2. Story arc builder that aggregates user events into narrative context
 * 3. Narrative summary generator for AI context injection
 */

import { storage } from "./storage";
import type { UserEvent, UserStoryArc, InsertUserEvent } from "@shared/schema";

// =====================
// TOPIC EXTRACTION (lightweight, no API calls)
// =====================

interface ExtractedEvent {
  topic: string;
  summary: string;
  category: string;
  subcategory: string | null;
  phase: string | null;
  milestone: string | null;
  progressPct: number | null;
  sentiment: string;
  complexity: number;
  tags: string[];
}

// Topic detection patterns
const TOPIC_PATTERNS: { pattern: RegExp; topic: string; category: string; subcategory?: string }[] = [
  // Book/Writing
  { pattern: /\b(write|writing|author|novel|book|chapter|manuscript|fiction|non-?fiction|publish|plot|character|narrative)\b/i, topic: "Book Writing", category: "book" },
  { pattern: /\b(chapter\s*\d|outline|story\s*arc|climax|protagonist|antagonist)\b/i, topic: "Book Writing", category: "book", subcategory: "structure" },
  // Marketing
  { pattern: /\b(marketing|campaign|brand|advertising|social\s*media|content\s*calendar|SEO|SEM|funnel|conversion|audience)\b/i, topic: "Marketing", category: "marketing" },
  { pattern: /\b(email\s*campaign|newsletter|ads?\s*copy|landing\s*page|A\/B\s*test)\b/i, topic: "Marketing", category: "marketing", subcategory: "campaign-planning" },
  // Personal Development
  { pattern: /\b(personal\s*development|self\s*help|growth|habit|mindset|meditation|journal|goal\s*setting|wellness)\b/i, topic: "Personal Development", category: "personal" },
  { pattern: /\b(fitness|workout|diet|nutrition|exercise|health|weight)\b/i, topic: "Health & Fitness", category: "personal", subcategory: "health" },
  // Code/Tech
  { pattern: /\b(code|coding|programming|developer|software|API|database|server|deploy|debug|React|Python|JavaScript|TypeScript)\b/i, topic: "Software Development", category: "code" },
  { pattern: /\b(website|web\s*app|frontend|backend|fullstack|CSS|HTML)\b/i, topic: "Web Development", category: "code", subcategory: "web" },
  // Research
  { pattern: /\b(research|study|paper|thesis|academic|analyze|analysis|data|statistics|findings)\b/i, topic: "Research", category: "research" },
  // Business
  { pattern: /\b(business\s*plan|startup|revenue|profit|investor|pitch|funding|market\s*size)\b/i, topic: "Business Planning", category: "business" },
  { pattern: /\b(project\s*management|sprint|roadmap|milestone|deadline|timeline|plan|gantt)\b/i, topic: "Project Planning", category: "business", subcategory: "project-management" },
  // Creative
  { pattern: /\b(design|creative|art|illustration|video|music|photo|visual|animation)\b/i, topic: "Creative Work", category: "creative" },
  // Education
  { pattern: /\b(learn|course|tutorial|teach|education|student|lesson|curriculum)\b/i, topic: "Learning", category: "education" },
];

// Phase detection
const PHASE_PATTERNS: { pattern: RegExp; phase: string }[] = [
  { pattern: /\b(what\s*is|explain|tell\s*me|understand|learn|intro|overview|explore)\b/i, phase: "discovery" },
  { pattern: /\b(plan|outline|structure|organize|strategy|brainstorm|ideas|draft)\b/i, phase: "planning" },
  { pattern: /\b(create|build|write|develop|implement|make|generate|produce|do)\b/i, phase: "execution" },
  { pattern: /\b(review|check|edit|revise|improve|fix|refine|polish|feedback)\b/i, phase: "review" },
  { pattern: /\b(finish|complete|final|done|publish|launch|ship|release|submit)\b/i, phase: "completion" },
];

// Sentiment detection
const SENTIMENT_PATTERNS: { pattern: RegExp; sentiment: string }[] = [
  { pattern: /\b(thank|great|awesome|love|amazing|perfect|excellent|wonderful|fantastic)\b/i, sentiment: "positive" },
  { pattern: /\b(help|can you|how|what|could|please)\b/i, sentiment: "neutral" },
  { pattern: /\b(problem|issue|error|bug|wrong|bad|fail|broken|stuck|confused|frustrat)\b/i, sentiment: "negative" },
  { pattern: /\b(terrible|hate|worst|awful|useless|stupid|angry)\b/i, sentiment: "frustrated" },
];

// Milestone detection
const MILESTONE_PATTERNS: { pattern: RegExp; milestone: string }[] = [
  { pattern: /\b(started|beginning|first\s+time|new\s+project)\b/i, milestone: "Project started" },
  { pattern: /\b(outline\s+done|outline\s+complete|finished\s+outline)\b/i, milestone: "Outline completed" },
  { pattern: /\b(chapter\s+(\d+)\s+(done|complete|finish))/i, milestone: "Chapter milestone" },
  { pattern: /\b(launched|published|shipped|deployed|released|went\s+live)\b/i, milestone: "Project launched" },
  { pattern: /\b(half\s*way|50\s*%|midpoint|middle)\b/i, milestone: "Reached midpoint" },
];

/**
 * Extract event metadata from a user message without using any API calls.
 * Uses pattern matching for lightweight classification.
 */
export function extractEventFromMessage(userMessage: string, aiResponse: string): ExtractedEvent {
  const combined = `${userMessage} ${aiResponse}`;
  
  // Find matching topic
  let topic = "General";
  let category = "general";
  let subcategory: string | null = null;
  
  for (const tp of TOPIC_PATTERNS) {
    if (tp.pattern.test(userMessage)) {
      topic = tp.topic;
      category = tp.category;
      if (tp.subcategory) subcategory = tp.subcategory;
      break;
    }
  }

  // Detect phase
  let phase: string | null = null;
  for (const pp of PHASE_PATTERNS) {
    if (pp.pattern.test(userMessage)) {
      phase = pp.phase;
      break;
    }
  }

  // Detect sentiment
  let sentiment = "neutral";
  for (const sp of SENTIMENT_PATTERNS) {
    if (sp.pattern.test(userMessage)) {
      sentiment = sp.sentiment;
      break;
    }
  }

  // Detect milestone
  let milestone: string | null = null;
  for (const mp of MILESTONE_PATTERNS) {
    const match = userMessage.match(mp.pattern);
    if (match) {
      milestone = mp.milestone;
      break;
    }
  }

  // Estimate complexity from message length and question complexity
  const wordCount = userMessage.split(/\s+/).length;
  const complexity = wordCount < 20 ? 1 : wordCount < 80 ? 2 : 3;

  // Generate summary (first 100 chars of user message, cleaned)
  const summary = userMessage.length > 120
    ? userMessage.substring(0, 117).trim() + "..."
    : userMessage;

  // Extract tags from both message and response
  const tags: string[] = [];
  if (category !== "general") tags.push(category);
  if (subcategory) tags.push(subcategory);
  if (phase) tags.push(phase);
  // Extract any hashtag-like terms
  const hashTags = userMessage.match(/#\w+/g);
  if (hashTags) tags.push(...hashTags.map((t) => t.replace("#", "")));

  return {
    topic,
    summary,
    category,
    subcategory,
    phase,
    milestone,
    progressPct: null, // Can't determine without prior context
    sentiment,
    complexity,
    tags,
  };
}

/**
 * Create a user event from a chat interaction.
 * Call this after every successful chat response.
 */
export async function captureUserEvent(params: {
  userId: number;
  conversationId: number;
  messageId: number;
  userMessage: string;
  aiResponse: string;
  toolUsed?: string | null;
  model?: string;
  creditsUsed?: number;
}): Promise<UserEvent> {
  const extracted = extractEventFromMessage(params.userMessage, params.aiResponse);

  const event: InsertUserEvent = {
    userId: params.userId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    topic: extracted.topic,
    summary: extracted.summary,
    category: extracted.category,
    subcategory: extracted.subcategory,
    phase: extracted.phase,
    milestone: extracted.milestone,
    progressPct: extracted.progressPct,
    sentiment: extracted.sentiment,
    complexity: extracted.complexity,
    toolUsed: params.toolUsed || null,
    model: params.model || null,
    creditsUsed: params.creditsUsed || 0,
    tags: JSON.stringify(extracted.tags),
    isActive: true,
  };

  return storage.createUserEvent(event);
}


// =====================
// STORY ARC BUILDER
// =====================

/**
 * Build a complete story arc for a user from their events.
 * Returns aggregated data suitable for AI context injection and admin viewing.
 */
export async function buildUserStoryArc(userId: number): Promise<UserStoryArc> {
  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");

  const stats = await storage.getUserEventStats(userId);
  const activeProjects = await storage.getUserActiveProjects(userId);
  const sentimentTrend = await storage.getUserSentimentTrend(userId, 30);
  const recentEvents = await storage.getUserEvents(userId, 20);

  // Build narrative summary
  const narrativeSummary = buildNarrativeSummary(user.username, stats, activeProjects, recentEvents, sentimentTrend);

  return {
    userId,
    username: user.username,
    totalEvents: stats.totalEvents,
    firstEventDate: stats.firstEventDate || "",
    lastEventDate: stats.lastEventDate || "",
    activeDays: stats.activeDays,
    topTopics: stats.topTopics,
    activeProjects,
    recentEvents,
    sentimentTrend,
    narrativeSummary,
  };
}

/**
 * Build a narrative summary string for AI context injection.
 * This gives the AI a concise understanding of the user's journey.
 */
function buildNarrativeSummary(
  username: string,
  stats: Awaited<ReturnType<typeof storage.getUserEventStats>>,
  activeProjects: Awaited<ReturnType<typeof storage.getUserActiveProjects>>,
  recentEvents: UserEvent[],
  sentimentTrend: { date: string; sentiment: string }[]
): string {
  if (stats.totalEvents === 0) {
    return `${username} is a new user with no interaction history yet.`;
  }

  const parts: string[] = [];

  // Overview
  parts.push(`User "${username}" has had ${stats.totalEvents} interactions across ${stats.activeDays} active days.`);

  // Top topics
  if (stats.topTopics.length > 0) {
    const topicStr = stats.topTopics.slice(0, 5).map((t) => `${t.topic} (${t.count}x)`).join(", ");
    parts.push(`Main interests: ${topicStr}.`);
  }

  // Active projects
  if (activeProjects.length > 0) {
    const projStr = activeProjects.slice(0, 3).map((p) => {
      let s = `${p.topic} (${p.phase}`;
      if (p.progressPct) s += `, ${p.progressPct}%`;
      s += `)`;
      return s;
    }).join(", ");
    parts.push(`Active projects: ${projStr}.`);

    // Milestones
    const allMilestones = activeProjects.flatMap((p) => p.milestones).slice(-3);
    if (allMilestones.length > 0) {
      parts.push(`Recent milestones: ${allMilestones.join(", ")}.`);
    }
  }

  // Recent context
  if (recentEvents.length > 0) {
    const last = recentEvents[0];
    parts.push(`Most recent activity: "${last.topic}" - ${last.summary}`);
  }

  // Sentiment
  const sentCounts: Record<string, number> = {};
  for (const s of sentimentTrend) {
    sentCounts[s.sentiment] = (sentCounts[s.sentiment] || 0) + 1;
  }
  const dominant = Object.entries(sentCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominant) {
    parts.push(`Overall sentiment trend: ${dominant[0]}.`);
  }

  return parts.join(" ");
}

/**
 * Build a compact context string for injecting into AI chat prompts.
 * Shorter than full narrative - focused on actionable context.
 */
export async function buildStoryArcContextForChat(userId: number): Promise<string | null> {
  const stats = await storage.getUserEventStats(userId);
  if (stats.totalEvents < 2) return null; // Not enough history to be useful

  const recentEvents = await storage.getUserEvents(userId, 5);
  const activeProjects = await storage.getUserActiveProjects(userId);

  const parts: string[] = [];

  // What user is working on
  if (activeProjects.length > 0) {
    const projStr = activeProjects.slice(0, 3).map((p) => {
      let s = `${p.topic}`;
      if (p.phase) s += ` (${p.phase})`;
      return s;
    }).join(", ");
    parts.push(`User's ongoing projects: ${projStr}.`);
  }

  // Recent topics for continuity
  const recentTopics = [...new Set(recentEvents.map((e) => e.topic))].slice(0, 3);
  if (recentTopics.length > 0) {
    parts.push(`Recent topics: ${recentTopics.join(", ")}.`);
  }

  // Last interaction for continuity
  if (recentEvents.length > 0) {
    const last = recentEvents[0];
    parts.push(`Last interaction: "${last.summary}"`);
  }

  if (parts.length === 0) return null;
  return `[User Context from Timeline]: ${parts.join(" ")}`;
}
