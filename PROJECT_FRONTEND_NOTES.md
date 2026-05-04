# Project Management Module — Frontend Build Notes

## What Was Built

All 7 tasks completed. Here is a summary of every component created and modified.

---

## New Files

### 1. `client/src/pages/projects-list.tsx`
- Lists all projects the current user is a member of.
- Grid layout: 3 columns on desktop, stacks on mobile.
- Each card shows: name, status badge (color-coded), priority label, deadline countdown, overlapping member avatar stack, assignment count, and a left-edge color accent strip using `project.color`.
- Empty state with icon, "No projects yet" text, and a create button.
- "New Project" dialog with: name, description, status, priority, startDate, deadline, color palette (10 swatches), and agent picker (defaults to "Default (Johnny)").
- On submit, creates project via `POST /api/projects` and navigates to `/#/projects/:id`.
- Uses `useAuthFetch` throughout (not `apiRequest`).
- All interactive elements have `data-testid` attributes.

### 2. `client/src/pages/project-detail.tsx`
- Single project view with 4 tabs: Overview | Members | Calendar | Chat.
- **Header**: project color accent (left border), name, status badge, deadline countdown ("N days left" / "N days overdue"), priority badge, owner-only action menu (edit, delete).
- **Overview tab**: 4 KPI cards (total tasks, completed, overdue, members), recent activity feed (last 8 messages + completed assignments, sorted by date), project description.
- **Members tab**: table with name, email, role (editable Select for non-owners), join date, remove button. "Add Member" dialog with two modes: (1) Existing User — autocomplete from `/api/admin/users` with avatar list; (2) Invite by Email — just email + role. On invite, shows toast with invite link if returned by the API.
- **Calendar tab**: assignments grouped by Overdue / Today / This Week / Recurring / Later / Done. Each row: complete checkbox, priority dot, title, due time or cron expression, assigned-to avatar, edit/delete dropdown. "New Assignment" dialog with title, description, assignedTo (member dropdown), type (one_time/recurring), date+time picker for one-time, cron expression + preset buttons for recurring, priority, reminderMinutes.
- **Chat tab**: WhatsApp-style message list with sender avatars, role badge (AI), timestamps. Mention-aware input: typing `@` triggers member dropdown. Enter sends, Shift+Enter = newline. Auto-scrolls to bottom on new messages. Polls `GET /api/projects/:id/messages` every 5s.
- Messages query is lifted to the main page component so Overview tab can show recent activity without a second fetch.
- Uses `useAuthFetch` throughout. All fields have null-safety guards (`?.`).

### 3. `client/src/pages/invite-accept.tsx`
- **Public page** — no authentication required.
- Reads `token` from `useParams` (route `/invite/:token`).
- On mount, calls `GET /api/invites/:token` (no auth header) and shows project name, role, and inviter.
- Handles `status !== "pending"` gracefully (shows "already accepted/expired" screen).
- Form: pre-filled email (disabled), username, password, confirm password.
- Validates: username required, password ≥ 6 chars, passwords match.
- On submit: `POST /api/invites/accept { token, username, password }`. On success, stores JWT in `window.__AUTH_TOKEN__`, shows success screen, and redirects to `/#/projects/:id` with a full page reload to trigger auth re-check.
- All interactive elements have `data-testid`.

### 4. `client/src/components/notification-bell.tsx`
- Bell icon in the topbar with unread count badge.
- Polls `GET /api/notifications/unread-count` every 30s.
- Click opens a Popover with: header ("Notifications" + "Mark all read" button), scrollable list of notifications sorted newest first.
- Each notification: unread dot indicator, emoji type icon, title (bold if unread), body (2-line clamp), time ago.
- Click: marks as read via `POST /api/notifications/:id/read`, navigates to `notification.link`, closes popover.
- "Mark all read" calls `POST /api/notifications/mark-all-read`.
- Invalidates both `notifications` and `notifications-unread-count` queries on changes.

---

## Modified Files

### 5. `client/src/components/app-sidebar.tsx`
- Added `FolderKanban` to lucide-react import.
- Added `{ titleKey: "nav.projects", url: "/projects", icon: FolderKanban }` to `navItemKeys` between Chat and API Keys.

### 6. `client/src/App.tsx`
- Imported `ProjectsListPage`, `ProjectDetailPage`, `InviteAcceptPage`, `NotificationBell`.
- Added `useLocation` import from wouter.
- Added routes: `/projects` → `ProjectsListPage`, `/projects/:id` → `ProjectDetailPage`.
- Added public route bypass: in `AppShell`, if `location.startsWith("/invite/")` the `InviteAcceptPage` renders directly (before auth check).
- Added `<NotificationBell />` in the topbar header next to `<LocaleToggle />` and `<ThemeToggle />`.

### 7. `client/src/lib/i18n.tsx`
- Added 30 translation keys under `projects.*` and `nav.projects` for both `en` and `he` locales.
- Keys: title, newProject, name, description, status, priority, deadline, startDate, color, agent, create, creating, created, cancel, empty, emptyHint, overview, members, calendar, chat, addMember, newAssignment, markDone, chatHint, inviteAccepted, daysLeft, overdue, notifications, markAllRead.

---

## Stubs / Known Limitations

- **`/api/agents` endpoint**: The project creation dialog fetches `/api/agents` for the agent picker. If this endpoint doesn't exist yet, the Select will silently show only the "Default (Johnny)" option (graceful degradation — the `useQuery` result will be undefined, rendered as empty list).
- **Invite link in "Add Member"**: The toast shows the invite link only if the API response includes `inviteLink` or `token` in the JSON body. If the backend doesn't return these, it falls back to "Invite email queued." message.
- **`POST /api/invites/accept` token storage**: The accept flow stores the JWT via `window.__AUTH_TOKEN__` (same in-memory pattern used by `auth.tsx`) and does a `window.location.reload()` to trigger the AuthProvider's `refreshUser`. This is intentional — it avoids coupling invite-accept to AuthContext.
- **ProjectMessage.user info**: The messages API currently returns `userId` (number) but no embedded user object. The Chat tab uses member list lookup by `userId` for names and avatars, which works for project members. System/AI messages (userId=null, role=assistant) show "AI Assistant".
- **Overview tab messages**: Messages are fetched at the main `ProjectDetailPage` level (shared query key `["messages", projectId]`) and passed to OverviewTab. The Chat tab also uses the same query key so there's no duplicate fetch.

---

## Component Paths Summary

| File | Route |
|------|-------|
| `client/src/pages/projects-list.tsx` | `/#/projects` |
| `client/src/pages/project-detail.tsx` | `/#/projects/:id` |
| `client/src/pages/invite-accept.tsx` | `/#/invite/:token` (public) |
| `client/src/components/notification-bell.tsx` | Topbar (always visible when authenticated) |
