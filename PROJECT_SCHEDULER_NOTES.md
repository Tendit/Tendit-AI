# Project Scheduler + Telegram Routing — Implementation Notes

## Files Created / Modified

### New: `server/project-scheduler.ts`
- Exports `startProjectScheduler()` — the entry point
- Exports `notifyProjectAssignment(assignment, project, user, telegramChatId)` (re-exported from telegram.ts)
- Exports `notifyProjectMembers(projectId, message, excludeUserId?)` (re-exported from telegram.ts)

### Modified: `server/telegram.ts`
Added after `notifyOwnerFromWeb`:
- **`sendProjectAssignmentReminder`** — already existed (added by storage subagent); kept intact
- **`nameToSlug` / `parseProjectMessage` / `resolveProjectBySlug`** — internal helpers
- **`handleProjectMessage`** — processes `@slug content` or `/project slug content`
- **`handleProjectDoneReply`** — handles `✅` / `done` messages
- **`getFirstBotToken`** — internal helper (picks first active bot)
- **`notifyProjectAssignment`** (exported) — sends Telegram reminder for an assignment
- **`notifyProjectMembers`** (exported) — sends a message to all project members with a linked Telegram chat

The project routing fires **before** the existing `/command` and AI chat handlers in `handleTelegramUpdate`, so it only intercepts `@slug` / `/project` patterns or the exact `✅`/`done` text.

### Modified: `server/index.ts`
- Imports `startProjectScheduler` from `./project-scheduler`
- Calls `startProjectScheduler()` inside the `httpServer.listen` callback, after the server is confirmed up

---

## Polling Interval
**60 seconds** (via `setInterval(safeRun, 60_000)`). Also runs once immediately on startup.

---

## Scheduler Logic

### Phase 1 — Due Assignments (`storage.listDueAssignments(now)`)
For each assignment returned (storage method handles the `reminderMinutes` window logic):
1. Create in-app notification: type=`assignment_due`, title=`<project> — reminder`, body=assignment title, link=`/projects/<id>?tab=calendar`
2. Look up user's Telegram chat ID (via `getTelegramLinkByUserId` across all active bots)
3. Send Telegram message via `notifyProjectAssignment`
4. Set `reminderSentAt = now`
5. **For recurring**: parse `cronExpression` with `CronExpressionParser` (cron-parser v5), set `nextRunAt` to next firing, reset `reminderSentAt = null`

### Phase 2 — Overdue Transition
Fetches all `status=pending` assignments. For each `one_time` where `dueAt < now && reminderSentAt != null`:
1. Sets `status = overdue`
2. Creates in-app notification: type=`assignment_overdue`
3. Sends Telegram overdue alert

(Overdue is only triggered once — after `reminderSentAt` is set from Phase 1, preventing double-firing.)

---

## Telegram Project Routing

### Inbound message patterns
| Pattern | Example |
|---|---|
| `@<project-slug> <content>` | `@my-website check the homepage` |
| `/project <slug> <content>` | `/project my-website check the homepage` |

Slug = project name lowercased, spaces replaced with hyphens. Partial match (prefix) supported if unique.

### Steps
1. Resolve project by slug
2. Verify sender is a project member (`storage.isUserInProject`)
3. Create `projectMessage` with `source="telegram"`, `role="user"`
4. Reply `✅ Posted to [<Project>]`
5. Notify other members via `notifyProjectMembers`
6. If `@johnny` appears in content, trigger AI completion and post reply as `role="assistant"` message, also send back to Telegram sender

### ✅ / done handler
When a user sends `✅` or `done`:
1. Finds their most recent `pending` assignment with `reminderSentAt` set (sorted by `reminderSentAt` desc)
2. Calls `storage.markAssignmentDone(id, userId)`
3. Replies `✅ Marked done — <title>`
4. Falls through to normal AI handling if no pending assignment found

---

## Caveats

- **Bot selection**: `notifyProjectAssignment` and the overdue alert use "first active bot" (`getFirstBotToken`). If the platform has multiple bots, the reminder always goes out via the first one. This is intentional simplicity — in practice projects are likely managed by a single bot.
- **Telegram link requirement**: Reminders are only sent when a `TelegramLink` with `userId` is linked to the user. Users who haven't connected their Telegram account won't receive Telegram notifications (in-app notifications still fire for all users).
- **Circular import avoidance**: `notifyProjectAssignment` and `notifyProjectMembers` are defined in `telegram.ts` (not `project-scheduler.ts`), then imported by the scheduler, to avoid a circular dependency.
- **cron-parser version**: Uses v5 API (`CronExpressionParser.parse`). Already present in `node_modules/`.
- **Storage methods**: `listDueAssignments`, `listAssignments`, `getProject`, `createNotification`, `markAssignmentDone`, `updateAssignment`, `listProjectMessages`, `createProjectMessage`, `listProjectMembers`, and `isUserInProject` are called as synchronous methods (matching the `IStorage` interface definitions in storage.ts). If these methods are async in the actual implementation, TypeScript will handle it transparently via `await`.
