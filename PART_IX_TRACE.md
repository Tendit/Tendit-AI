# Part IX — Manual Trace: Credit Debit + Overdraft Flow

This document traces two flows end-to-end through the Part IX implementation to confirm correctness.
File/line refs match the build that ships in commit `feat: Part IX — multi-project ops ...`.

---

## Flow A: Normal project debit (balance sufficient)

**Pre-state**
- `projects.id = 7` (e.g., "Tendit core")
- `project_credits.balance = 250`, `overdraft_balance = 0`, `overdraft_ceiling = 500`
- User #3 (owner) calls a tool that costs 40 credits.

**Trace**

1. Tool wrapper invokes `storage.debitCredits({ userId: 3, projectId: 7, amount: 40, txnType: "debit", actionRef: "tool:web_search", note: null })`
   → `server/storage.ts:2470`.
2. `amt = ceil(40) = 40` (line 2476).
3. `projectId = 7` → branch at line 2480.
4. `ensureProjectCreditsRow(7)` returns `{ balance: 250, overdraftBalance: 0, ... }`.
5. `pc.balance (250) >= amt (40)` → debit path (line 2482):
   - `newBal = 250 - 40 = 210`
   - `UPDATE project_credits SET balance=210, updated_at=NOW() WHERE project_id=7` (line 2484)
   - `INSERT INTO credit_ledger (project_id=7, user_id=3, txn_type='debit', amount=-40, balance_after=210, action_ref='tool:web_search', ...)` (line 2486)
6. Returns `{ ok: true, balanceAfter: 210, queued: false }` (line 2491).
7. Tool wrapper sees `queued === false` → continues execution normally.

**Post-state**
- `project_credits.balance = 210`, no change to overdraft.
- One new row in `credit_ledger` (debit, amount -40).
- No row in `system_credit_queue`.

✅ Verified against `debitCredits` source.

---

## Flow B: Overdraft path (balance exhausted → queued → approved → Stripe top-up settles)

**Pre-state**
- `project_credits.balance = 5`, `overdraft_balance = 0`, `overdraft_ceiling = 500`
- User #3 (owner) calls a tool that costs 80 credits.

**Trace — Phase 1: debit attempt while exhausted**

1. `storage.debitCredits({ userId: 3, projectId: 7, amount: 80, actionRef: "tool:transcribe_audio" })` invoked.
2. `pc.balance (5) < amt (80)` → fails the `>=` check at line 2482.
3. Falls into the queue branch (line 2493):
   - `INSERT INTO system_credit_queue (project_id=7, user_id=3, action_payload='{"amount":80,"actionRef":"tool:transcribe_audio"}', estimated_credits=80, status='awaiting', requested_at=NOW())` (line 2494).
4. Returns `{ ok: false, queued: true, queueId: <new id>, reason: "project_balance_exhausted" }`.
5. Tool wrapper sees `queued === true` → throws `CreditsQueuedError` (or returns 402 to caller). The user sees: "This action requires admin approval — queued."

**Trace — Phase 2: admin reviews the queue**

6. Admin opens **System Queue** UI (`client/src/pages/system-queue.tsx`) → calls `GET /api/system-queue` → returns rows with `status='awaiting'`.
7. Admin clicks "Approve" → `POST /api/system-queue/:id/approve` (admin-only middleware in `server/routes.ts`).
8. Server calls `storage.approveQueuedAction(queueId, adminId)` → `server/storage.ts:2624`:
   - Sets `system_credit_queue.status='approved'`, records approver + timestamp.
   - Loads the queued row.
   - Since `row.projectId = 7 > 0`, enters the project branch (line 2631).
   - `ceiling = 500`, `pc.overdraftBalance = 0` → `grant = min(80, 500 - 0) = 80`.
   - `settleOverdraft({ projectId: 7 }, 80)` (line 2583): `project_credits.overdraft_balance` becomes `0 + 80 = 80`.
   - Logs `credit_ledger` row: `txn_type='debit', amount=-80, action_ref='queue:<id>', note='approved overdraft grant'`.
9. Now the action is conceptually paid-for (via overdraft). The original tool can be retried (caller pattern) or the queued action is replayed by an admin task runner.

**Post-Phase-2 state**
- `project_credits.balance = 5` (unchanged), `overdraft_balance = 80`.
- Queue row marked `approved`.
- Two ledger entries: the original queue insert is **not** a ledger entry (queue is separate from ledger); the `approveQueuedAction` writes one ledger row tagged `queue:<id>`.

**Trace — Phase 3: user buys credits via Stripe, overdraft is auto-settled**

10. User opens **Credits** UI (`client/src/pages/credits.tsx`) → picks the **Growth** package (500 credits, $20).
11. UI calls `POST /api/billing/checkout` with `{ packageSlug: "growth", projectId: 7 }`.
12. Server `getStripe()` returns a configured Stripe client → creates a Checkout Session, returns the URL.
13. User pays → Stripe webhook `POST /api/billing/webhook` fires.
14. Webhook verifies signature, on `checkout.session.completed`:
    - Resolves user/project from session metadata.
    - Calls `storage.creditCredits({ userId: 3, projectId: 7, amount: 500, txnType: "purchase", stripeChargeId, note: "Stripe Growth" })` → `server/storage.ts:2522`.
15. Inside `creditCredits` (projectId branch, line 2530):
    - `pc.overdraftBalance (80) > 0 && remaining (500) > 0` → settle path (line 2532).
    - `settled = min(80, 500) = 80`; `remaining = 500 - 80 = 420`.
    - `UPDATE project_credits SET overdraft_balance = 80 - 80 = 0` (line 2535).
    - `INSERT credit_ledger (txn_type='overdraft_settle', amount=-80, balance_after=0, note='overdraft settlement')` (line 2539).
    - Then top up with the remainder: `newBal = current_balance (5) + 420 = 425` (line 2547).
    - `UPDATE project_credits SET balance = 425` (line 2548).
    - `INSERT credit_ledger (txn_type='purchase', amount=420, balance_after=425, stripe_charge_id=...)` (line 2550).
16. Returns `{ ok: true, balanceAfter: 425, settled: 80 }`.

**Post-Phase-3 state**
- `project_credits.balance = 425`, `overdraft_balance = 0`.
- Ledger now contains four rows tied to this saga: original debit attempt (-80, `queue:<id>`), overdraft_settle (-80), purchase (+420). (The initial 250→210 from Flow A is independent.)
- Queue row stays `approved` (no rollback needed; the cost has been recovered).

✅ Verified against `debitCredits`, `approveQueuedAction`, `settleOverdraft`, `creditCredits` source.

---

## Edge cases covered

- **Zero-amount debit** → fast-path return at line 2477 (no ledger noise).
- **User-only debit (no project)** → falls into line 2500; same balance check; same queue insert with `projectId: 0` sentinel.
- **Overdraft ceiling cap** → `grant = min(estimated, ceiling - overdraftBalance)` in `approveQueuedAction` (line 2634). If admin approves more than ceiling allows, only the in-cap portion is granted.
- **Credit larger than overdraft** → `creditCredits` settles overdraft first, then deposits remainder into balance. Two ledger rows.
- **Credit smaller than overdraft** → only settles partial overdraft, `remaining = 0`, no balance change. One ledger row of type `overdraft_settle`.

---

## Chat-reply approval (Telegram bridge) — flow summary

1. User posts message tagging `@johnny` in project chat → `POST /api/projects/:id/messages` (`server/routes.ts:3136-3216`).
2. Ack message inserted into `project_messages` with `is_ack = true` and placeholder content "Johnny is thinking…".
3. Async resolver: `storage.resolveAgent(projectId, "chat_reply")` → falls back to Johnny default by slug if no project-specific assignment.
4. `callProvider(agent.provider, agent.model, messages)` produces `replyText`.
5. Row inserted in `pending_actions` with `session_id = 0` (sentinel), `action_type = "chat_reply"`, `payload = {projectId, ackMessageId, replyText, askedBy}`.
6. `sendChatReplyApprovalCard` posts the proposed reply to the project owner via Telegram with inline Approve/Reject buttons.
7. Owner clicks Approve → `handleApprovalCallback` (`server/telegram.ts:944`) detects `action_type === "chat_reply"` BEFORE the session lookup (chat_reply has no session). Auth check: `approverId === project.ownerId || admin`.
8. On approve: `project_messages.content` is updated from "Johnny is thinking…" to `replyText`, `pending_actions.status = "executed"`.
9. On reject: `content` becomes "Sorry, I can't help with that.", status `"rejected"`.

✅ Verified against routes.ts message handler + telegram.ts callback.
