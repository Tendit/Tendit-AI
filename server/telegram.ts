/**
 * Telegram Bot Relay Engine
 * 
 * Architecture:
 * - Owner (admin) messages Johnny on Telegram → AI processes → relays to web users
 * - Web users message Johnny on platform → AI processes → relays summary to owner's Telegram
 * - AI sits in between: pass-through by default, but can enhance, suggest, or handle actions
 * 
 * Commands:
 * /start - Initialize and link account
 * /users - List connected web platform users
 * /talk <name> - Start talking to a specific user (relay mode)
 * /ai <question> - Ask Johnny AI directly  
 * /schedule - See upcoming schedule items
 * /stop - Stop current relay conversation
 */

import { storage } from "./storage";
import type { TelegramBot, PlatformAgent, TelegramLink } from "@shared/schema";
import { buildAgentChatPrompt } from "@shared/schema";

// Telegram API helper
async function tgApi(token: string, method: string, body?: any): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error (${method}):`, data.description);
  }
  return data;
}

// Send message to Telegram chat
export async function sendTelegramMessage(
  token: string, 
  chatId: string, 
  text: string, 
  options?: { parse_mode?: string; reply_markup?: any }
): Promise<any> {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode || "HTML",
    reply_markup: options?.reply_markup,
  });
}

// Set webhook for a bot
export async function setTelegramWebhook(token: string, webhookUrl: string, secret?: string): Promise<any> {
  const params: any = { url: webhookUrl };
  if (secret) params.secret_token = secret;
  return tgApi(token, "setWebhook", params);
}

// Get bot info
export async function getTelegramBotInfo(token: string): Promise<any> {
  return tgApi(token, "getMe");
}

// In-memory state for active relay conversations
// Maps: ownerChatId -> { targetUserId, targetUserName }
const activeRelays = new Map<string, { userId: number; userName: string; botId: number }>();

// Reference to callProvider (injected from routes.ts to avoid circular deps)
let callProviderFn: ((provider: string, model: string, messages: any[]) => Promise<any>) | null = null;

export function setCallProvider(fn: (provider: string, model: string, messages: any[]) => Promise<any>) {
  callProviderFn = fn;
}

/**
 * Process incoming Telegram webhook update
 */
export async function handleTelegramUpdate(bot: TelegramBot, agent: PlatformAgent, update: any) {
  const message = update.message;
  if (!message?.text) return; // Only handle text messages for now

  const chatId = String(message.chat.id);
  const text = message.text.trim();
  const firstName = message.from?.first_name || "User";
  const username = message.from?.username || "";

  // Ensure this Telegram user has a link entry
  let link = await storage.getTelegramLink(bot.id, chatId);
  const noOwnerYet = !bot.ownerTelegramChatId;
  if (!link) {
    // Auto-create link — first person to message when no owner is set becomes owner
    const isOwnerLink = bot.ownerTelegramChatId === chatId || noOwnerYet;
    link = await storage.createTelegramLink({
      telegramChatId: chatId,
      telegramUsername: username,
      telegramFirstName: firstName,
      botId: bot.id,
      role: isOwnerLink ? "owner" : "contact",
      isActive: true,
    });
    // If first person, also set the owner chat ID on the bot
    if (noOwnerYet) {
      await storage.updateTelegramBot(bot.id, { ownerTelegramChatId: chatId });
      bot.ownerTelegramChatId = chatId;
    }
  }

  // Log incoming message
  await storage.createRelayMessage({
    botId: bot.id,
    direction: "telegram_in",
    telegramChatId: chatId,
    senderName: firstName,
    originalMessage: text,
    messageType: "text",
    metadata: JSON.stringify({ message_id: message.message_id, username }),
  });

  // Check if this is the owner (admin)
  const isOwner = link.role === "owner" || bot.ownerTelegramChatId === chatId;

  // Handle commands
  if (text.startsWith("/")) {
    await handleCommand(bot, agent, chatId, text, isOwner, link);
    return;
  }

  if (isOwner) {
    await handleOwnerMessage(bot, agent, chatId, text);
  } else {
    await handleContactMessage(bot, agent, chatId, text, firstName, link);
  }
}

/**
 * Handle slash commands
 */
async function handleCommand(bot: TelegramBot, agent: PlatformAgent, chatId: string, text: string, isOwner: boolean, link: TelegramLink) {
  const [cmd, ...args] = text.split(" ");
  const arg = args.join(" ").trim();

  switch (cmd.toLowerCase().replace(/@.*$/, "")) {
    case "/start": {
      // If no owner is set yet, the person who /starts claims ownership
      const claimOwner = isOwner || !bot.ownerTelegramChatId;
      if (claimOwner) {
        // Set owner chat ID
        if (bot.ownerTelegramChatId !== chatId) {
          await storage.updateTelegramBot(bot.id, { ownerTelegramChatId: chatId });
          bot.ownerTelegramChatId = chatId;
        }
        if (link.role !== "owner") {
          await storage.updateTelegramLink(link.id, { role: "owner" });
        }
        await sendTelegramMessage(bot.botToken, chatId,
          `🤖 <b>${agent.name} is connected!</b>\n\n` +
          `You are the owner. Commands:\n` +
          `/users — List web platform users\n` +
          `/talk &lt;name&gt; — Start relaying to a user\n` +
          `/ai &lt;question&gt; — Ask ${agent.name} directly\n` +
          `/schedule — View upcoming items\n` +
          `/stop — End current relay\n\n` +
          `Or just type a message — if you're in a relay, it goes to the user. Otherwise, ${agent.name} AI will respond.`
        );
      } else {
        await sendTelegramMessage(bot.botToken, chatId,
          `👋 Hi! I'm <b>${agent.name}</b>.\n\n` +
          `${agent.description || "I'm an AI assistant."}\n\n` +
          `Just send me a message and I'll help you out!`
        );
      }
      break;
    }

    case "/users": {
      if (!isOwner) {
        await sendTelegramMessage(bot.botToken, chatId, "⛔ Only the owner can use this command.");
        return;
      }
      // List users who have this agent assigned
      const assignments = await storage.getAgentAssignments(agent.id);
      if (assignments.length === 0) {
        await sendTelegramMessage(bot.botToken, chatId, "No users assigned to this agent yet.");
        return;
      }
      let msg = `<b>👥 Connected Users</b>\n\n`;
      for (const a of assignments) {
        const user = await storage.getUser(a.userId);
        if (user) {
          msg += `• <b>${user.username}</b> (${user.email})\n`;
        }
      }
      msg += `\nUse /talk &lt;username&gt; to start a relay conversation.`;
      await sendTelegramMessage(bot.botToken, chatId, msg);
      break;
    }

    case "/talk": {
      if (!isOwner) {
        await sendTelegramMessage(bot.botToken, chatId, "⛔ Only the owner can use this command.");
        return;
      }
      if (!arg) {
        await sendTelegramMessage(bot.botToken, chatId, "Usage: /talk &lt;username&gt;");
        return;
      }
      // Find the user
      const assignments = await storage.getAgentAssignments(agent.id);
      let targetUser = null;
      for (const a of assignments) {
        const user = await storage.getUser(a.userId);
        if (user && (user.username.toLowerCase() === arg.toLowerCase() || user.email.toLowerCase() === arg.toLowerCase())) {
          targetUser = user;
          break;
        }
      }
      if (!targetUser) {
        await sendTelegramMessage(bot.botToken, chatId, `❌ User "${arg}" not found or not assigned to ${agent.name}.`);
        return;
      }
      // Set active relay
      activeRelays.set(chatId, { userId: targetUser.id, userName: targetUser.username, botId: bot.id });
      await sendTelegramMessage(bot.botToken, chatId,
        `🔗 <b>Relay active</b> → talking to <b>${targetUser.username}</b>\n\n` +
        `Your messages will be sent to ${targetUser.username}'s chat on the web platform.\n` +
        `Their replies will come back here.\n\n` +
        `Type /stop to end relay, or /ai to ask ${agent.name} directly.`
      );
      break;
    }

    case "/stop": {
      if (activeRelays.has(chatId)) {
        const relay = activeRelays.get(chatId)!;
        activeRelays.delete(chatId);
        await sendTelegramMessage(bot.botToken, chatId, `✅ Relay to <b>${relay.userName}</b> stopped.`);
      } else {
        await sendTelegramMessage(bot.botToken, chatId, "No active relay to stop.");
      }
      break;
    }

    case "/ai": {
      if (!arg) {
        await sendTelegramMessage(bot.botToken, chatId, `Usage: /ai &lt;your question&gt;`);
        return;
      }
      await handleAiQuery(bot, agent, chatId, arg);
      break;
    }

    case "/schedule": {
      if (!isOwner) {
        await sendTelegramMessage(bot.botToken, chatId, "⛔ Only the owner can use this command.");
        return;
      }
      const items = await storage.getUserSchedule(1); // admin user id = 1
      if (items.length === 0) {
        await sendTelegramMessage(bot.botToken, chatId, "📅 No upcoming schedule items.");
        return;
      }
      let msg = `<b>📅 Upcoming Schedule</b>\n\n`;
      for (const item of items.slice(0, 10)) {
        const emoji = item.type === "event" ? "📅" : item.type === "reminder" ? "⏰" : item.type === "alarm" ? "🔔" : "✅";
        msg += `${emoji} <b>${item.title}</b>\n   ${item.date}${item.time ? " " + item.time : ""}\n\n`;
      }
      await sendTelegramMessage(bot.botToken, chatId, msg);
      break;
    }

    default:
      await sendTelegramMessage(bot.botToken, chatId, "❓ Unknown command. Try /start for help.");
  }
}

/**
 * Handle message from the owner — either relay to user or AI chat
 */
async function handleOwnerMessage(bot: TelegramBot, agent: PlatformAgent, chatId: string, text: string) {
  const relay = activeRelays.get(chatId);

  if (relay) {
    // Active relay: forward message to the web user's agent conversation
    // Create a schedule item / notification for the web user
    await storage.createRelayMessage({
      botId: bot.id,
      direction: "telegram_out",
      telegramChatId: chatId,
      userId: relay.userId,
      senderName: "Owner",
      originalMessage: text,
      messageType: "text",
    });

    // Create a notification-style message in the user's agent chat via schedule item
    await storage.createScheduleItem({
      userId: relay.userId,
      agentId: agent.id,
      type: "reminder",
      title: `Message from ${agent.name}`,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().substring(0, 5),
      notes: text,
      priority: "high",
      status: "active",
    });

    await sendTelegramMessage(bot.botToken, chatId,
      `✉️ → <b>${relay.userName}</b>: Message delivered.\n<i>(They'll see it in their schedule & notifications)</i>`
    );
  } else {
    // No active relay: talk to AI directly
    await handleAiQuery(bot, agent, chatId, text);
  }
}

/**
 * Handle message from an external contact (non-owner)
 */
async function handleContactMessage(bot: TelegramBot, agent: PlatformAgent, chatId: string, text: string, senderName: string, link: TelegramLink) {
  // AI responds to the contact
  await handleAiQuery(bot, agent, chatId, text);

  // Also notify the owner about this message
  if (bot.ownerTelegramChatId) {
    // Generate a brief AI summary for the owner
    let summary = text;
    if (text.length > 100 && callProviderFn) {
      try {
        const summaryResult = await callProviderFn("perplexity", "sonar", [
          { role: "system", content: "Summarize this message in one brief sentence (max 50 words). Keep it factual." },
          { role: "user", content: text },
        ]);
        summary = summaryResult.content || text;
      } catch {
        summary = text.length > 200 ? text.substring(0, 200) + "..." : text;
      }
    }

    await sendTelegramMessage(bot.botToken, bot.ownerTelegramChatId,
      `📨 <b>New message</b> from <b>${senderName}</b>${link.telegramUsername ? ` (@${link.telegramUsername})` : ""}:\n\n` +
      `<i>${summary}</i>\n\n` +
      `Use /talk ${senderName} to reply.`
    );

    // Log the relay notification
    await storage.createRelayMessage({
      botId: bot.id,
      direction: "telegram_out",
      telegramChatId: bot.ownerTelegramChatId,
      senderName: "System",
      originalMessage: `Notification: ${senderName} said: ${summary}`,
      messageType: "notification",
      aiSummary: summary,
    });
  }
}

/**
 * Handle AI query — send to agent AI and return response
 */
async function handleAiQuery(bot: TelegramBot, agent: PlatformAgent, chatId: string, text: string) {
  if (!callProviderFn) {
    await sendTelegramMessage(bot.botToken, chatId, "⚠️ AI is not configured. Please set up API providers.");
    return;
  }

  try {
    // Send "typing" indicator
    await tgApi(bot.botToken, "sendChatAction", { chat_id: chatId, action: "typing" });

    const agentPrompt = buildAgentChatPrompt(agent);
    const result = await callProviderFn("perplexity", "sonar", [
      { role: "system", content: agentPrompt },
      { role: "user", content: text },
    ]);

    let content = result.content || "I couldn't process that. Please try again.";

    // Parse for action JSON blocks
    const jsonRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
    const jsonBlocks: any[] = [];
    let match;
    while ((match = jsonRegex.exec(content)) !== null) {
      try { jsonBlocks.push(JSON.parse(match[1])); } catch {}
    }

    // Process actions (auto-approve for owner, create schedule items)
    for (const block of jsonBlocks) {
      if (block.action) {
        const request = await storage.createAgentRequest({
          agentId: agent.id,
          userId: 1, // admin
          actionType: block.action,
          actionData: JSON.stringify(block),
          status: agent.approvalMode === "auto" ? "auto_approved" : "pending",
        });

        if (agent.approvalMode === "auto") {
          await storage.createScheduleItem({
            userId: 1,
            agentId: agent.id,
            requestId: request.id,
            type: block.action === "create_event" ? "event" : block.action === "create_task" ? "task" : block.action === "set_alarm" ? "alarm" : "reminder",
            title: block.title || "Untitled",
            date: block.date || block.dueDate || new Date().toISOString().split("T")[0],
            time: block.time || block.dueTime,
            endTime: block.endTime,
            location: block.location,
            notes: block.notes,
            reminderMinutes: block.reminderMinutes || 60,
            priority: block.priority || "medium",
            status: "active",
          });
        }
      }
    }

    // Clean response (remove JSON blocks) and format for Telegram
    let cleanContent = content.replace(/```json\s*\n?[\s\S]*?\n?```/g, "").trim();
    // Convert markdown bold to HTML bold for Telegram
    cleanContent = cleanContent.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    // Truncate if too long for Telegram (4096 char limit)
    if (cleanContent.length > 4000) {
      cleanContent = cleanContent.substring(0, 4000) + "\n\n<i>... (message truncated)</i>";
    }

    // Add action confirmation if any
    if (jsonBlocks.length > 0) {
      cleanContent += "\n\n";
      for (const block of jsonBlocks) {
        const emoji = block.action === "create_event" ? "📅" : block.action === "create_task" ? "✅" : block.action === "set_alarm" ? "🔔" : "⏰";
        cleanContent += `${emoji} <b>${block.action?.replace("_", " ")}</b>: ${block.title || ""}`;
        if (block.date) cleanContent += ` (${block.date}${block.time ? " " + block.time : ""})`;
        cleanContent += agent.approvalMode === "auto" ? " ✓ Created\n" : " ⏳ Pending approval\n";
      }
    }

    await sendTelegramMessage(bot.botToken, chatId, cleanContent || "Done.");

    // Log the AI response
    await storage.createRelayMessage({
      botId: bot.id,
      direction: "telegram_out",
      telegramChatId: chatId,
      senderName: agent.name,
      originalMessage: cleanContent,
      messageType: jsonBlocks.length > 0 ? "action" : "text",
    });
  } catch (e: any) {
    console.error("Telegram AI error:", e.message);
    await sendTelegramMessage(bot.botToken, chatId, `⚠️ Error: ${e.message}`);
  }
}

/**
 * Notify owner via Telegram when a web user sends a message to the agent
 */
export async function notifyOwnerFromWeb(agentId: number, userName: string, message: string, actions?: any[]) {
  const bot = await storage.getTelegramBotByAgentId(agentId);
  if (!bot || !bot.isActive || !bot.ownerTelegramChatId) return;

  let msg = `💬 <b>${userName}</b> (web):\n\n<i>${message.length > 300 ? message.substring(0, 300) + "..." : message}</i>`;

  if (actions && actions.length > 0) {
    msg += "\n\n<b>Actions:</b>\n";
    for (const a of actions) {
      const emoji = a.action === "create_event" ? "📅" : a.action === "create_task" ? "✅" : "⏰";
      msg += `${emoji} ${a.title || a.action} ${a.status === "pending_approval" ? "⏳" : "✓"}\n`;
    }
  }

  await sendTelegramMessage(bot.botToken, bot.ownerTelegramChatId, msg);

  // Log
  await storage.createRelayMessage({
    botId: bot.id,
    direction: "web_in",
    telegramChatId: bot.ownerTelegramChatId,
    senderName: userName,
    originalMessage: message,
    messageType: actions?.length ? "action" : "text",
  });
}

/**
 * Initialize all active Telegram bots (called on server startup)
 */
export async function initTelegramBots(baseUrl: string) {
  try {
    const bots = await storage.getActiveTelegramBots();
    for (const bot of bots) {
      const webhookUrl = `${baseUrl}/api/telegram/webhook/${bot.id}`;
      const result = await setTelegramWebhook(bot.botToken, webhookUrl, bot.webhookSecret || undefined);
      console.log(`Telegram bot ${bot.botUsername || bot.id}: webhook ${result.ok ? "set" : "failed"} → ${webhookUrl}`);
    }
  } catch (e: any) {
    console.error("Failed to init Telegram bots:", e.message);
  }
}
