import type { AgentStep, ToolCall, ToolResult, AgentToolConfig, AgentToolRule } from "@shared/schema";
import { AGENT_SYSTEM_PROMPT, buildAgentSystemPrompt } from "@shared/schema";
import { executeTool, parseToolCalls } from "./tool-executor";
import { storage } from "./storage";
import { buildTimelineContext, buildTimelinePrompt } from "./calendar-engine";
import { buildStoryArcContextForChat } from "./story-arc";

const MAX_TOOL_STEPS = 5;

interface OrchestratorContext {
  userId: number;
  conversationId: number;
  model: string;
  provider: string;
  perplexityKey?: string;
  callProvider: (provider: string, model: string, messages: any[], attachments?: any[]) => Promise<{
    content: string;
    citations: string | null;
    usage: { prompt_tokens: number; completion_tokens: number };
  }>;
  onStep?: (step: AgentStep) => void; // SSE callback for streaming steps
}

/**
 * Run the agent orchestration loop:
 * 1. Send user message + system prompt to AI
 * 2. If AI responds with tool_call blocks, execute them
 * 3. Feed results back to AI
 * 4. Repeat until AI gives a final response (no tool calls) or max steps reached
 */
export async function runAgentLoop(
  userMessage: string,
  history: { role: string; content: string }[],
  attachments: any[],
  ctx: OrchestratorContext
): Promise<{
  finalResponse: string;
  steps: AgentStep[];
  totalToolCalls: number;
  artifacts: { filename: string; url: string; mimetype: string }[];
  usage: { prompt_tokens: number; completion_tokens: number };
}> {
  const steps: AgentStep[] = [];
  const allArtifacts: { filename: string; url: string; mimetype: string }[] = [];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  let toolCallCount = 0;

  // Load tools + rules from DB for dynamic system prompt
  let dbTools: AgentToolConfig[] = [];
  let dbRules: AgentToolRule[] = [];
  try {
    dbTools = await storage.getEnabledAgentTools();
    dbRules = await storage.getAllToolRules();
  } catch {}

  const systemPrompt = dbTools.length > 0
    ? buildAgentSystemPrompt(dbTools, dbRules)
    : AGENT_SYSTEM_PROMPT;

  // Build conversation messages with agent system prompt
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject story arc context
  try {
    const storyCtx = await buildStoryArcContextForChat(ctx.userId);
    if (storyCtx) {
      messages.push({ role: "system", content: storyCtx });
    }
  } catch {}

  // Inject calendar context
  try {
    const calCtx = await buildTimelineContext();
    const calPrompt = buildTimelinePrompt(calCtx, "general");
    if (calPrompt) {
      messages.push({ role: "system", content: `[Calendar context]: ${calPrompt}` });
    }
  } catch {}

  // Add conversation history (last 10 messages)
  messages.push(...history.slice(-10));

  // Add the current user message
  messages.push({ role: "user", content: userMessage });

  // Agent loop
  for (let step = 0; step < MAX_TOOL_STEPS + 1; step++) {
    // Call AI
    const stepNum = steps.length + 1;

    // Emit thinking step
    const thinkingStep: AgentStep = {
      stepNumber: stepNum,
      type: "thinking",
      content: step === 0 ? "Analyzing your request..." : "Processing tool results...",
      timestamp: new Date().toISOString(),
    };
    steps.push(thinkingStep);
    ctx.onStep?.(thinkingStep);

    const result = await ctx.callProvider(ctx.provider, ctx.model, messages, step === 0 ? attachments : undefined);
    totalUsage.prompt_tokens += result.usage.prompt_tokens;
    totalUsage.completion_tokens += result.usage.completion_tokens;

    // Parse response for tool calls
    const { toolCalls, cleanText } = parseToolCalls(result.content);

    if (toolCalls.length === 0 || toolCallCount >= MAX_TOOL_STEPS) {
      // No tool calls = final response
      const finalStep: AgentStep = {
        stepNumber: steps.length + 1,
        type: "response",
        content: result.content,
        timestamp: new Date().toISOString(),
      };
      steps.push(finalStep);
      ctx.onStep?.(finalStep);

      return {
        finalResponse: result.content,
        steps,
        totalToolCalls: toolCallCount,
        artifacts: allArtifacts,
        usage: totalUsage,
      };
    }

    // Execute tool calls (check if tool is enabled in DB)
    const enabledToolIds = new Set(dbTools.length > 0 ? dbTools.map(t => t.toolId) : ["run_code", "browse_web", "generate_file", "search_web", "analyze_data"]);
    for (const tc of toolCalls) {
      if (toolCallCount >= MAX_TOOL_STEPS) break;

      // Check if tool is enabled
      if (!enabledToolIds.has(tc.tool)) {
        const blockedStep: AgentStep = {
          stepNumber: steps.length + 1,
          type: "tool_result",
          content: `✗ Tool "${tc.tool}" is disabled by admin. Skipping.`,
          toolResult: { toolCallId: tc.id, tool: tc.tool, success: false, output: "", error: `Tool "${tc.tool}" is disabled` },
          timestamp: new Date().toISOString(),
        };
        steps.push(blockedStep);
        ctx.onStep?.(blockedStep);
        messages.push({ role: "user", content: `[Tool "${tc.tool}" is disabled by the platform admin. Please use a different approach.]` });
        continue;
      }

      toolCallCount++;

      // Emit tool call step
      const tcStep: AgentStep = {
        stepNumber: steps.length + 1,
        type: "tool_call",
        content: `Using ${tc.tool}: ${summarizeToolInput(tc)}`,
        toolCall: tc,
        timestamp: new Date().toISOString(),
      };
      steps.push(tcStep);
      ctx.onStep?.(tcStep);

      // Execute
      const toolResult = await executeTool(tc, {
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        perplexityKey: ctx.perplexityKey,
      });

      // Collect artifacts
      if (toolResult.artifacts) {
        allArtifacts.push(...toolResult.artifacts);
      }

      // Emit tool result step
      const trStep: AgentStep = {
        stepNumber: steps.length + 1,
        type: "tool_result",
        content: toolResult.success
          ? `✓ ${tc.tool} completed${toolResult.duration ? ` (${toolResult.duration}ms)` : ""}`
          : `✗ ${tc.tool} failed: ${toolResult.error}`,
        toolResult,
        timestamp: new Date().toISOString(),
      };
      steps.push(trStep);
      ctx.onStep?.(trStep);

      // Feed result back to AI as assistant + tool result message
      messages.push({
        role: "assistant",
        content: cleanText || `[Used tool: ${tc.tool}]`,
      });
      messages.push({
        role: "user",
        content: `[Tool result from ${tc.tool}]:\n${toolResult.output}${toolResult.error ? `\nError: ${toolResult.error}` : ""}${toolResult.artifacts ? `\nGenerated files: ${toolResult.artifacts.map((a) => a.filename).join(", ")}` : ""}`,
      });
    }
  }

  // If we exhausted the loop, return last AI response
  return {
    finalResponse: "I've completed the maximum number of tool executions for this request. Here's what I've done so far:\n\n" +
      steps.filter((s) => s.type === "tool_result").map((s) => `- ${s.content}`).join("\n"),
    steps,
    totalToolCalls: toolCallCount,
    artifacts: allArtifacts,
    usage: totalUsage,
  };
}

function summarizeToolInput(tc: ToolCall): string {
  const input = tc.input;
  switch (tc.tool) {
    case "run_code":
      return `${input.language} code (${(input.code || "").length} chars)`;
    case "browse_web":
      return input.url || "URL";
    case "generate_file":
      return `${input.format} - "${input.title}"`;
    case "search_web":
      return `"${input.query}"`;
    case "analyze_data":
      return input.task || "data analysis";
    default:
      return JSON.stringify(input).slice(0, 100);
  }
}
