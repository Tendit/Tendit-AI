# Project Management Module — Backend Implementation Notes

## What Was Built

### 1. `npm install cron-parser` (v5.5.0)
Used `CronExpressionParser.parse()` (v5 API) to compute `nextRunAt` for recurring assignments.

---

### 2. Storage Methods (`server/storage.ts`)

New imports added:
- Schema types: `Project`, `InsertProject`, `projects`, `ProjectMember`, `InsertProjectMember`, `projectMembers`, `UserInvite`, `InsertUserInvite`, `userInvites`, `ProjectAssignment`, `InsertProjectAssignment`, `projectAssignments`, `ProjectMessage`, `InsertProjectMessage`, `projectMessages`, `Notification`, `InsertNotification`, `notifications`
- Drizzle operators: `lte`, `or`, `isNull`
- Node crypto: `randomBytes`
- cron-parser: `CronExpressionParser`

**IStorage interface additions** (all synchronous, following the better-sqlite3 Drizzle pattern):

#### Projects
- `listProjects(filters?)` — filters by `memberId` (joins via project_members), `ownerId`, `status`, `search`
- `getProject(id)` → `Project | undefined`
- `createProject(data)` → `Project` (sets `createdAt`/`updatedAt`)
- `updateProject(id, data)` → `Project | undefined` (bumps `updatedAt`)
- `deleteProject(id)` → `{ changes }` (cascades: members, assignments, messages)

#### Project Members
- `listProjectMembers(projectId)` — joins user table for `{ id, username, email }`
- `addProjectMember(data)` → `ProjectMember`
- `removeProjectMember(projectId, userId)` → `{ changes }`
- `updateProjectMember(projectId, userId, role)` → `ProjectMember | undefined`
- `isUserInProject(projectId, userId)` → `boolean`

#### Invites
- `createInvite(data)` — auto-generates token via `crypto.randomBytes(24).toString('hex')`; `token` must be omitted from caller data
- `getInviteByToken(token)` → `UserInvite | undefined`
- `listInvitesForProject(projectId)` → `UserInvite[]`
- `acceptInvite(token, userId)` — sets `status="accepted"`, `acceptedAt=now`; also upserts `project_members` row if `projectId` set
- `expireInvite(id)` — sets `status="expired"`

#### Assignments
- `listAssignments(filters)` — in-JS filter by `projectId`, `assignedTo`, `status`, `overdue`, `dueBefore`
- `getAssignment(id)` → `ProjectAssignment | undefined`
- `createAssignment(data)` — auto-computes `nextRunAt` via cron-parser if type="recurring"
- `updateAssignment(id, data)` → `ProjectAssignment | undefined`
- `markAssignmentDone(id, userId)` — for recurring: recomputes `nextRunAt` and resets to `status="pending"`; for one-time: sets `status="done"`
- `deleteAssignment(id)` → `{ changes }`
- `listDueAssignments(now)` — fetches pending+reminderSentAt=null, then JS-filters by `nextRunAt || dueAt <= now`

#### Project Messages
- `listProjectMessages(projectId, limit=100)` — ASC order by `createdAt`
- `createProjectMessage(data)` → `ProjectMessage`

#### Notifications
- `listNotifications(userId, opts?)` — supports `unreadOnly`, `limit`
- `countUnreadNotifications(userId)` → `number`
- `createNotification(data)` → `Notification`
- `markNotificationRead(id, userId)` — scoped to userId for safety
- `markAllNotificationsRead(userId)`

---

### 3. API Routes (`server/routes.ts`)

All project routes added at the bottom of `registerRoutes()`, before `return httpServer`.

Auth helpers defined inside `registerRoutes`:
- `getProjectRole(projectId, userId)` → role string or null
- `canManageProject(projectId, userId)` → boolean (admin, project.ownerId, or role=owner/manager)

#### Projects
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/projects` | authMiddleware | Members see own projects; admin sees all |
| GET | `/api/projects/:id` | authMiddleware | Returns project + members + assignment counts |
| POST | `/api/projects` | authMiddleware | Sets `ownerId` from session; auto-adds owner as member |
| PATCH | `/api/projects/:id` | authMiddleware | owner/manager/admin only |
| DELETE | `/api/projects/:id` | authMiddleware | owner/admin only; cascades |

#### Members
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/projects/:id/members` | authMiddleware (must be member or admin) |
| POST | `/api/projects/:id/members` | authMiddleware (owner/manager/admin) — `{ userId \| email, role }` |
| PATCH | `/api/projects/:id/members/:memberId` | authMiddleware (owner/manager/admin) — `{ role }` |
| DELETE | `/api/projects/:id/members/:memberId` | authMiddleware (self-removal or owner/manager/admin) |

If `email` is provided and the user doesn't exist yet, a `UserInvite` is created with 7-day expiry.

#### Invites
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/invites/:token` | Public — returns email, status, expiresAt, projectId, role |
| POST | `/api/invites/accept` | Public — `{ token, username?, password? }` |

`/api/invites/accept` creates a new user if the email isn't registered yet (requires `username` + `password`), then logs them in and adds them to the project.

#### Assignments
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/projects/:id/assignments` | authMiddleware (member or admin) |
| POST | `/api/projects/:id/assignments` | authMiddleware (owner/manager/admin) |
| PATCH | `/api/assignments/:id` | authMiddleware (owner/manager/admin of the project) |
| POST | `/api/assignments/:id/complete` | authMiddleware (any project member) |
| DELETE | `/api/assignments/:id` | authMiddleware (owner/manager/admin) |

#### Messages
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/projects/:id/messages` | authMiddleware (member or admin) |
| POST | `/api/projects/:id/messages` | authMiddleware (member or admin) |

POST `/api/projects/:id/messages`:
- Accepts `{ content, mentionsUserIds?, attachments? }`
- Creates in-app notifications for all mentioned users
- If content matches `/@johnny/i`, fires async AI reply via `callProvider("perplexity", "sonar", ...)` with a system prompt including project members, recent messages, and active assignments

#### Notifications
| Method | Path | Auth |
|--------|------|------|
| GET | `/api/notifications` | authMiddleware |
| GET | `/api/notifications/unread-count` | authMiddleware |
| POST | `/api/notifications/:id/read` | authMiddleware |
| POST | `/api/notifications/mark-all-read` | authMiddleware |

---

### 4. Johnny Tool Dispatchers (`server/routes.ts`)

Added inside the agent chat handler, after the `crm_query` block:

**`project_query`** — retrieves project data scoped to the current user's membership
- `scope`: `"projects"` | `"members"` | `"assignments"` | `"messages"` | (default = summary)
- `filters`: passed through to respective storage methods
- Emits status `"project_data_fetched"` with result
- Appends `[Project {Label}]` context to `crmQueryContext` for AI reply

**`create_assignment`** — creates a project assignment
- Requires `projectId`, user must be a member AND have role `owner` or `manager`
- Fields: `assignedTo`, `title`, `description`, `type`, `dueAt`, `cronExpression`, `cronTimezone`, `priority`, `reminderMinutes`
- Emits status `"assignment_created"`

**`project_message`** — posts a message to a project chat
- Requires `projectId`, user must be a member
- Field: `content` (or `message`)
- Emits status `"message_posted"`

---

### 5. Telegram Helper (`server/telegram.ts`)

Added `sendProjectAssignmentReminder(assignment, user)`:
- Iterates all active bots, finds a `TelegramLink` for the given `user.id`
- Sends: `📌 **Project #N** — Reminder: **<title>** due <when>` (HTML format)
- Formats due time in `Asia/Jerusalem` timezone
- Sends only once (first matching bot link), then returns
- Silently logs errors — does not throw

---

## Limitations

1. **`listProjects` with `memberId`** loads all projects into memory then JS-filters. For large datasets, a raw SQL join would be better — but matches the codebase's existing pattern.
2. **`listAssignments`** also filters in JS. For production use with thousands of assignments, add a Drizzle `where()` chain with `sql` conditions.
3. **`@johnny` AI reply** is async/fire-and-forget. If the AI errors, it logs but does not notify the user. A WebSocket or polling mechanism would be needed to surface the AI reply in real-time.
4. **Invite `token` field** — `InsertUserInvite` includes `token` in its type (the schema doesn't omit it). The storage interface uses `Omit<InsertUserInvite, "token">` to enforce auto-generation. If zod validation is needed at the route level, callers must not pass `token`.
5. **No DB migration script** — the new tables (`projects`, `project_members`, `user_invites`, `project_assignments`, `project_messages`, `notifications`) need to be created via `drizzle-kit push` or a migration before the API works.

---

## Route Summary

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/members
POST   /api/projects/:id/members
PATCH  /api/projects/:id/members/:memberId
DELETE /api/projects/:id/members/:memberId

GET    /api/invites/:token          (public)
POST   /api/invites/accept          (public)

GET    /api/projects/:id/assignments
POST   /api/projects/:id/assignments
PATCH  /api/assignments/:id
POST   /api/assignments/:id/complete
DELETE /api/assignments/:id

GET    /api/projects/:id/messages
POST   /api/projects/:id/messages

GET    /api/notifications
GET    /api/notifications/unread-count
POST   /api/notifications/:id/read
POST   /api/notifications/mark-all-read
```
