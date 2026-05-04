/**
 * Project Scheduler
 *
 * Runs every 60 seconds. For each due assignment:
 *  - Sends an in-app notification
 *  - Sends a Telegram reminder if the assigned user has a telegram_chat_id linked
 *  - Marks reminderSentAt = now
 *  - For recurring assignments: recomputes nextRunAt via cron-parser after processing
 *  - Transitions overdue one_time assignments to status "overdue"
 *
 * NOTE: notifyProjectAssignment and notifyProjectMembers are defined in
 * telegram.ts (to avoid a circular import) and re-exported from here for
 * convenience.
 */

import { storage } from "./storage";
import type { ProjectAssignment } from "@shared/schema";
import { CronExpressionParser } from "cron-parser";
import {
  sendTelegramMessage,
  notifyProjectAssignment,
  notifyProjectMembers,
} from "./telegram";
import { format, parseISO } from "date-fns";

// Re-export helpers so callers can import from either module
export { notifyProjectAssignment, notifyProjectMembers };

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Format an ISO timestamp in a human-friendly form. */
function humanDate(iso: string | null | undefined): string {
  if (!iso) return "no due date";
  try {
    const d = parseISO(iso);
    return format(d, "EEE, MMM d 'at' h:mm a");
  } catch {
    return iso;
  }
}

/**
 * Look up a user's active Telegram chat ID by iterating all active bots.
 * Returns null if not found.
 */
async function getUserTelegramChatId(userId: number): Promise<string | null> {
  try {
    const bots = await storage.getActiveTelegramBots();
    for (const bot of bots) {
      const link = await storage.getTelegramLinkByUserId(bot.id, userId);
      if (link && link.isActive && link.telegramChatId) {
        return link.telegramChatId;
      }
    }
  } catch (e: any) {
    console.error("[project-scheduler] getUserTelegramChatId error:", e.message);
  }
  return null;
}

/** Get the first active bot token. Returns null if no bot configured. */
async function getFirstBotToken(): Promise<string | null> {
  try {
    const bots = await storage.getActiveTelegramBots();
    const active = bots.find((b) => b.isActive && b.botToken);
    return active?.botToken ?? null;
  } catch {
    return null;
  }
}

// ─── Core scheduler ─────────────────────────────────────────────────────────

async function runScheduler(): Promise<void> {
  const now = new Date();

  // ── 1. Process due assignments ──────────────────────────────────────────
  let dueAssignments: ProjectAssignment[] = [];
  try {
    dueAssignments = storage.listDueAssignments(now);
  } catch (e: any) {
    console.error("[project-scheduler] listDueAssignments error:", e.message);
    return;
  }

  for (const assignment of dueAssignments) {
    try {
      const project = storage.getProject(assignment.projectId);
      if (!project) continue;

      const user = await storage.getUser(assignment.assignedTo);
      if (!user) continue;

      // Create in-app notification
      try {
        storage.createNotification({
          userId: assignment.assignedTo,
          type: "assignment_due",
          title: `${project.name} — reminder`,
          body: assignment.title,
          link: `/projects/${project.id}?tab=calendar`,
          projectId: assignment.projectId,
          assignmentId: assignment.id,
        });
      } catch (e: any) {
        console.error("[project-scheduler] createNotification error:", e.message);
      }

      // Send Telegram reminder
      try {
        const chatId = await getUserTelegramChatId(assignment.assignedTo);
        await notifyProjectAssignment(assignment, project, user, chatId);
      } catch (e: any) {
        console.error("[project-scheduler] telegram notify error:", e.message);
      }

      // Mark reminderSentAt = now
      try {
        storage.updateAssignment(assignment.id, { reminderSentAt: now.toISOString() });
      } catch (e: any) {
        console.error("[project-scheduler] updateAssignment reminderSentAt error:", e.message);
      }

      // For RECURRING: recompute nextRunAt and reset reminderSentAt to null
      if (assignment.type === "recurring" && assignment.cronExpression) {
        try {
          const tz = assignment.cronTimezone || "UTC";
          const interval = CronExpressionParser.parse(assignment.cronExpression, {
            currentDate: now.toISOString(),
            tz,
          });
          const next = interval.next();
          storage.updateAssignment(assignment.id, {
            lastRunAt: now.toISOString(),
            nextRunAt: next.toDate().toISOString(),
            reminderSentAt: null as any,
          });
        } catch (e: any) {
          console.error(
            `[project-scheduler] cron recompute error for assignment ${assignment.id}:`,
            e.message
          );
        }
      }
    } catch (e: any) {
      console.error(
        `[project-scheduler] Error processing due assignment ${assignment.id}:`,
        e.message
      );
    }
  }

  // ── 2. Mark overdue assignments ─────────────────────────────────────────
  // Any pending one_time assignment where dueAt < now AND reminderSentAt is set
  // should transition to "overdue" with a separate notification.
  let pendingAssignments: ProjectAssignment[] = [];
  try {
    pendingAssignments = storage.listAssignments({ status: "pending" });
  } catch (e: any) {
    console.error("[project-scheduler] listAssignments (overdue check) error:", e.message);
    return;
  }

  for (const assignment of pendingAssignments) {
    if (assignment.type !== "one_time") continue;
    if (!assignment.dueAt) continue;
    const dueAt = new Date(assignment.dueAt);
    // Only mark overdue if the due time has passed AND reminder was already sent
    if (dueAt < now && assignment.reminderSentAt) {
      try {
        storage.updateAssignment(assignment.id, { status: "overdue" });

        const project = storage.getProject(assignment.projectId);
        if (project) {
          try {
            storage.createNotification({
              userId: assignment.assignedTo,
              type: "assignment_overdue",
              title: `${project.name} — overdue`,
              body: assignment.title,
              link: `/projects/${project.id}?tab=calendar`,
              projectId: assignment.projectId,
              assignmentId: assignment.id,
            });
          } catch (e: any) {
            console.error(
              "[project-scheduler] createNotification (overdue) error:",
              e.message
            );
          }

          // Telegram overdue alert
          try {
            const token = await getFirstBotToken();
            const chatId = await getUserTelegramChatId(assignment.assignedTo);
            if (token && chatId) {
              const text =
                `⚠️ <b>Overdue!</b> [${project.name}]\n${assignment.title}\n\n` +
                `Was due: ${humanDate(assignment.dueAt)}\n\n` +
                `Visit https://www.tendit.io/#/projects/${project.id}?tab=calendar`;
              await sendTelegramMessage(token, chatId, text, { parse_mode: "HTML" });
            }
          } catch (e: any) {
            console.error(
              "[project-scheduler] telegram overdue notify error:",
              e.message
            );
          }
        }
      } catch (e: any) {
        console.error(
          `[project-scheduler] overdue transition error for assignment ${assignment.id}:`,
          e.message
        );
      }
    }
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

export function startProjectScheduler(): void {
  console.log("[project-scheduler] Starting — interval: 60s");

  const safeRun = async () => {
    try {
      await runScheduler();
    } catch (e: any) {
      console.error("[project-scheduler] Unhandled error in scheduler run:", e.message);
    }
  };

  // Run immediately on start
  safeRun();

  // Then every 60 seconds
  setInterval(safeRun, 60_000);
}
