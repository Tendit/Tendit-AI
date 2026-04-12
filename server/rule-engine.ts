/**
 * AI Rule Engine - Evaluates conditions and produces prompt injections
 * 
 * Sits between user request and AI model call. Intercepts all requests,
 * evaluates rules, stacks matching ones by priority, and injects context.
 */

import { storage } from "./storage";
import { buildTimelineContext } from "./calendar-engine";
import type { AiRule, RuleCondition, RuleAction, RuleEvalResult, CalendarEvent } from "@shared/schema";

// Context passed into the rule evaluator for each request
export interface RequestContext {
  message: string;
  userPlan: string;
  userRole: string;
  model: string;
  provider: string;
  tool?: string;         // active agent tool id
  endpoint: "chat" | "api"; // whether from chat UI or API proxy
  currentDate: Date;
  season: string;
  upcomingHolidays: { name: string; date: string; daysAway: number; category: string }[];
  recentHolidays: { name: string; date: string; daysAgo: number; category: string }[];
}

// Build request context (called once per request)
export async function buildRequestContext(params: {
  message: string;
  userPlan: string;
  userRole: string;
  model: string;
  provider: string;
  tool?: string;
  endpoint: "chat" | "api";
}): Promise<RequestContext> {
  const now = new Date();
  const timelineCtx = await buildTimelineContext();

  // Determine season from month
  const month = now.getMonth() + 1;
  let season = "Winter";
  if (month >= 3 && month <= 5) season = "Spring";
  else if (month >= 6 && month <= 8) season = "Summer";
  else if (month >= 9 && month <= 11) season = "Fall";

  return {
    ...params,
    currentDate: now,
    season,
    upcomingHolidays: timelineCtx.upcomingHolidays,
    recentHolidays: timelineCtx.recentHolidays,
  };
}

// Evaluate a single condition against the request context
function evaluateCondition(condition: RuleCondition, ctx: RequestContext): boolean {
  const { type, operator, field, value, metadata } = condition;

  let actual: string | number | undefined;

  switch (type) {
    case "topic":
      // field = "message" typically, check if user message matches
      actual = ctx.message.toLowerCase();
      break;

    case "user_plan":
      actual = ctx.userPlan;
      break;

    case "user_role":
      actual = ctx.userRole;
      break;

    case "model":
      actual = ctx.model;
      break;

    case "provider":
      actual = ctx.provider;
      break;

    case "tool":
      actual = ctx.tool || "";
      break;

    case "calendar": {
      // Calendar conditions check holidays/season
      if (field === "season") {
        actual = ctx.season.toLowerCase();
      } else if (field === "holiday_nearby") {
        // Check if any upcoming holiday matches the value within N days
        const daysThreshold = parseInt(metadata || "7");
        const matchedHoliday = ctx.upcomingHolidays.find(h =>
          h.name.toLowerCase().includes(value.toLowerCase()) && h.daysAway <= daysThreshold
        );
        return !!matchedHoliday;
      } else if (field === "holiday_category_nearby") {
        const daysThreshold = parseInt(metadata || "30");
        const matched = ctx.upcomingHolidays.find(h =>
          h.category.toLowerCase() === value.toLowerCase() && h.daysAway <= daysThreshold
        );
        return !!matched;
      } else if (field === "any_holiday_within") {
        const daysThreshold = parseInt(value || "7");
        return ctx.upcomingHolidays.some(h => h.daysAway <= daysThreshold);
      } else if (field === "month") {
        actual = String(ctx.currentDate.getMonth() + 1);
      } else if (field === "quarter") {
        actual = `Q${Math.ceil((ctx.currentDate.getMonth() + 1) / 3)}`;
      }
      break;
    }

    case "time_of_day": {
      const hour = ctx.currentDate.getHours();
      actual = String(hour);
      break;
    }

    case "day_of_week": {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      actual = days[ctx.currentDate.getDay()];
      break;
    }

    case "custom": {
      // Custom: field is evaluated as a simple expression on ctx.message
      actual = ctx.message.toLowerCase();
      break;
    }

    default:
      return false;
  }

  if (actual === undefined) return false;

  // Apply operator
  const actualStr = String(actual).toLowerCase();
  const valueStr = value.toLowerCase();

  switch (operator) {
    case "equals":
      return actualStr === valueStr;

    case "not_equals":
      return actualStr !== valueStr;

    case "contains":
      return actualStr.includes(valueStr);

    case "not_contains":
      return !actualStr.includes(valueStr);

    case "in": {
      try {
        const list = JSON.parse(value) as string[];
        return list.map(v => v.toLowerCase()).includes(actualStr);
      } catch {
        return value.split(",").map(v => v.trim().toLowerCase()).includes(actualStr);
      }
    }

    case "not_in": {
      try {
        const list = JSON.parse(value) as string[];
        return !list.map(v => v.toLowerCase()).includes(actualStr);
      } catch {
        return !value.split(",").map(v => v.trim().toLowerCase()).includes(actualStr);
      }
    }

    case "gt":
      return parseFloat(actualStr) > parseFloat(valueStr);

    case "lt":
      return parseFloat(actualStr) < parseFloat(valueStr);

    case "between": {
      try {
        const [min, max] = JSON.parse(value) as [number, number];
        const num = parseFloat(actualStr);
        return num >= min && num <= max;
      } catch {
        return false;
      }
    }

    case "regex": {
      try {
        const regex = new RegExp(value, "i");
        return regex.test(actualStr);
      } catch {
        return false;
      }
    }

    case "near_date": {
      // Already handled in calendar type above
      return false;
    }

    default:
      return false;
  }
}

// Evaluate all conditions for a rule
function evaluateRule(rule: AiRule, ctx: RequestContext): { matches: boolean; matchedConditions: string[] } {
  let conditions: RuleCondition[];
  try {
    conditions = JSON.parse(rule.conditions);
  } catch {
    return { matches: false, matchedConditions: [] };
  }

  if (conditions.length === 0) {
    // Rules with no conditions always match (like a global rule)
    return { matches: true, matchedConditions: ["Always active (no conditions)"] };
  }

  // Check appliesTo filter
  if (rule.appliesTo !== "all") {
    if (rule.appliesTo === "chat" && ctx.endpoint !== "chat") return { matches: false, matchedConditions: [] };
    if (rule.appliesTo === "api" && ctx.endpoint !== "api") return { matches: false, matchedConditions: [] };
    if (rule.appliesTo.startsWith("tool:")) {
      const requiredTool = rule.appliesTo.replace("tool:", "");
      if (ctx.tool !== requiredTool) return { matches: false, matchedConditions: [] };
    }
  }

  const results: { condition: RuleCondition; matched: boolean }[] = [];

  for (const cond of conditions) {
    const matched = evaluateCondition(cond, ctx);
    results.push({ condition: cond, matched });
  }

  const matchedDescriptions = results
    .filter(r => r.matched)
    .map(r => `${r.condition.type}:${r.condition.field} ${r.condition.operator} "${r.condition.value}"`);

  if (rule.conditionLogic === "OR") {
    return { matches: results.some(r => r.matched), matchedConditions: matchedDescriptions };
  } else {
    // AND (default)
    return { matches: results.every(r => r.matched), matchedConditions: matchedDescriptions };
  }
}

/**
 * Main rule engine entry point.
 * Evaluates all active rules against the request context.
 * Returns matched rules sorted by priority (lowest number = highest priority).
 */
export async function evaluateRules(ctx: RequestContext): Promise<RuleEvalResult[]> {
  const allRules = await storage.getActiveAiRules();
  const matchedResults: RuleEvalResult[] = [];

  for (const rule of allRules) {
    const { matches, matchedConditions } = evaluateRule(rule, ctx);
    if (matches) {
      let actions: RuleAction[];
      try {
        actions = JSON.parse(rule.actions);
      } catch {
        actions = [];
      }

      if (actions.length > 0) {
        matchedResults.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          actions,
          matchedConditions,
        });
      }
    }
  }

  // Already sorted by priority from DB query, but ensure
  matchedResults.sort((a, b) => a.priority - b.priority);

  return matchedResults;
}

/**
 * Apply matched rules to the messages array before sending to the AI model.
 * Returns modified messages array and any model override.
 */
export function applyRuleActions(
  matchedRules: RuleEvalResult[],
  messagesForApi: { role: string; content: string }[]
): {
  messages: { role: string; content: string }[];
  modelOverride?: string;
  blocked?: string;
  disclaimers: string[];
} {
  const disclaimers: string[] = [];
  let modelOverride: string | undefined;
  let blocked: string | undefined;

  const systemInjections: { priority: number; content: string; position: string }[] = [];
  const contextInjections: { priority: number; content: string; position: string }[] = [];

  for (const result of matchedRules) {
    for (const action of result.actions) {
      switch (action.type) {
        case "inject_system_prompt":
          systemInjections.push({
            priority: result.priority,
            content: action.value,
            position: action.position || "before",
          });
          break;

        case "inject_user_context":
          contextInjections.push({
            priority: result.priority,
            content: action.value,
            position: action.position || "before",
          });
          break;

        case "force_model":
          if (!modelOverride) {
            modelOverride = action.value;
          }
          break;

        case "add_disclaimer":
          disclaimers.push(action.value);
          break;

        case "block_request":
          blocked = action.value || "Request blocked by platform rules.";
          break;

        case "modify_temperature":
          // Temperature modifications would need to be passed to callProvider
          // Stored for future use
          break;
      }
    }
  }

  // If blocked, return immediately
  if (blocked) {
    return { messages: messagesForApi, blocked, disclaimers };
  }

  // Apply system prompt injections
  const beforeSystem: string[] = [];
  const afterSystem: string[] = [];

  for (const inj of systemInjections) {
    if (inj.position === "after") {
      afterSystem.push(inj.content);
    } else {
      beforeSystem.push(inj.content);
    }
  }

  // Build the combined rule injection
  if (beforeSystem.length > 0 || afterSystem.length > 0) {
    const rulePrompt = [
      ...beforeSystem,
      ...afterSystem,
    ].join("\n\n");

    messagesForApi.unshift({
      role: "user" as const,
      content: `[Platform Rules - Follow these instructions precisely]:\n${rulePrompt}`,
    });
  }

  // Apply context injections
  for (const inj of contextInjections) {
    if (inj.position === "after") {
      messagesForApi.push({
        role: "user" as const,
        content: `[Additional context]: ${inj.content}`,
      });
    } else {
      messagesForApi.unshift({
        role: "user" as const,
        content: `[Context]: ${inj.content}`,
      });
    }
  }

  return { messages: messagesForApi, modelOverride, disclaimers };
}

/**
 * Default rules to seed on first startup
 */
export function getDefaultRules(): InsertAiRule[] {
  return [
    // === CALENDAR RULES ===
    {
      name: "Holiday Sensitivity - Yom HaShoah",
      description: "When Yom HaShoah (Holocaust Remembrance Day) is within 7 days, add sensitivity context to all responses",
      conditions: JSON.stringify([
        { type: "calendar", operator: "near_date", field: "holiday_nearby", value: "Yom HaShoah", metadata: "7" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "IMPORTANT: Yom HaShoah (Holocaust Remembrance Day) is approaching. If the conversation touches on related topics, be respectful and sensitive. Avoid humor or casual treatment of Holocaust-related subjects.", position: "before" },
      ] as RuleAction[]),
      priority: 5,
      category: "calendar",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },
    {
      name: "Holiday Sensitivity - Ramadan",
      description: "During Ramadan period, add cultural awareness context",
      conditions: JSON.stringify([
        { type: "calendar", operator: "near_date", field: "holiday_nearby", value: "Ramadan", metadata: "30" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "Note: Ramadan is currently being observed. If the conversation relates to food, scheduling, or cultural topics, be mindful of fasting schedules and cultural practices. For marketing plans, consider Ramadan-appropriate timing.", position: "before" },
      ] as RuleAction[]),
      priority: 10,
      category: "calendar",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },
    {
      name: "Q4 Shopping Season Awareness",
      description: "During Q4 (Oct-Dec), inject shopping season context for marketing topics",
      conditions: JSON.stringify([
        { type: "calendar", operator: "in", field: "month", value: "[10,11,12]" },
        { type: "topic", operator: "regex", field: "message", value: "marketing|campaign|sale|promotion|ads|advertising|launch|black.?friday|cyber.?monday|christmas" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "CONTEXT: We are in Q4 shopping season. Consider Black Friday, Cyber Monday, Christmas/Hanukkah/holiday shopping, and end-of-year campaigns in your response. Timing is critical - plan campaigns with adequate lead time for each key date.", position: "before" },
      ] as RuleAction[]),
      priority: 15,
      category: "calendar",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },

    // === TOPIC RULES ===
    {
      name: "Book Writing - Structure Guide",
      description: "When user is writing a book, inject chapter structure and pacing guidelines",
      conditions: JSON.stringify([
        { type: "topic", operator: "regex", field: "message", value: "book|novel|chapter|story|write.*fiction|manuscript|publish" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "You are helping with book creation. Apply these principles:\n1. STRUCTURE: Maintain consistent chapter length (2000-5000 words). Each chapter needs a hook, rising action, and cliffhanger/resolution.\n2. CONTINUITY: Track character names, traits, relationships, and plot threads. Never contradict established facts.\n3. PACING: Alternate between high-tension and reflective chapters. Build toward act climaxes at 25%, 50%, 75%, and 100% of the book.\n4. TIMELINE: Anchor events to real-world seasons and holidays when appropriate for authenticity.\n5. VOICE: Maintain consistent narrative voice and tense throughout.", position: "before" },
      ] as RuleAction[]),
      priority: 20,
      category: "topic",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },
    {
      name: "Marketing Plan - Framework",
      description: "When user discusses marketing, inject strategic framework",
      conditions: JSON.stringify([
        { type: "topic", operator: "regex", field: "message", value: "marketing.*(plan|strategy|calendar)|campaign.*(plan|strategy)|content.?calendar|social.?media.*(plan|strategy)" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "You are creating a marketing plan. Apply these principles:\n1. CALENDAR ALIGNMENT: All campaigns must align with relevant holidays, seasons, and cultural events.\n2. LEAD TIME: Major campaigns need 4-6 weeks prep, social media needs 2 weeks, email campaigns 1 week.\n3. BUDGET AWARENESS: Suggest budget allocation percentages across channels.\n4. METRICS: Define KPIs for each campaign phase (awareness, consideration, conversion).\n5. AUDIENCE: Segment recommendations by target demographic.\n6. CHANNELS: Recommend channel mix based on campaign goals.", position: "before" },
      ] as RuleAction[]),
      priority: 20,
      category: "topic",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },

    // === USER PLAN RULES ===
    {
      name: "Free Plan - Concise Responses",
      description: "For free plan users, encourage shorter responses to save credits",
      conditions: JSON.stringify([
        { type: "user_plan", operator: "equals", field: "plan", value: "free" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "Keep your response concise and focused. Aim for clarity over length. Use bullet points when appropriate. The user has limited credits, so be efficient with token usage while still being helpful.", position: "before" },
      ] as RuleAction[]),
      priority: 30,
      category: "user",
      appliesTo: "chat",
      isActive: true,
      createdBy: "system",
    },
    {
      name: "Enterprise Plan - Detailed Responses",
      description: "Enterprise users get more detailed, comprehensive responses",
      conditions: JSON.stringify([
        { type: "user_plan", operator: "in", field: "plan", value: "[\"pro\",\"enterprise\"]" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "Provide comprehensive, detailed responses. Include examples, edge cases, and nuanced explanations. Feel free to use longer-form structured answers with headers, tables, and code blocks when helpful.", position: "before" },
      ] as RuleAction[]),
      priority: 30,
      category: "user",
      appliesTo: "chat",
      isActive: true,
      createdBy: "system",
    },

    // === SAFETY RULES ===
    {
      name: "Content Safety - General",
      description: "Global safety rule applied to all requests",
      conditions: JSON.stringify([]),  // No conditions = always active
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "Platform policy: Do not generate content that promotes violence, illegal activities, or discrimination. If asked to generate harmful content, politely decline and offer a constructive alternative.", position: "before" },
      ] as RuleAction[]),
      priority: 1,  // Highest priority
      category: "safety",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },

    // === QUALITY RULES ===
    {
      name: "Yearly Planning - Calendar Integration",
      description: "When user asks for a yearly plan, inject comprehensive calendar context",
      conditions: JSON.stringify([
        { type: "topic", operator: "regex", field: "message", value: "yearly.*(plan|calendar|schedule)|annual.*(plan|calendar)|12.?month.*(plan|strategy)|year.*(plan|ahead|long)" },
      ] as RuleCondition[]),
      conditionLogic: "AND",
      actions: JSON.stringify([
        { type: "inject_system_prompt", value: "The user wants a yearly plan. IMPORTANT: Structure the plan month-by-month or quarter-by-quarter. For EACH month/quarter, cross-reference with the calendar to include:\n- Relevant holidays and observances (adjust by user's region)\n- Seasonal factors that affect the plan\n- Key marketing dates if applicable (Super Bowl, Valentine's, Back to School, Black Friday, etc.)\n- Cultural/religious events that may impact timing\n- End-of-quarter and fiscal year deadlines\nPresent as a structured timeline with clear milestones and deadlines.", position: "before" },
      ] as RuleAction[]),
      priority: 15,
      category: "quality",
      appliesTo: "all",
      isActive: true,
      createdBy: "system",
    },
  ];
}

export type { InsertAiRule };
