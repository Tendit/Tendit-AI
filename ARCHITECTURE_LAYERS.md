# Tendit / Massive Architecture — The Universal Layer Stack

> A reusable mental model derived from every system we've built together
> (Tendit AI Platform · Johnny · A3 Academy · OrthoCare AI · LaunchKit · AI Query System).
> Mirror this on every new request — clarify the layers first, then build.

---

## 1. What we've already built (inventory)

| System | Layer signature |
|---|---|
| **Tendit AI Platform** (Railway, multi-provider) | Data → Storage → Backend → Agent dispatchers (Johnny) → Cron → Telegram bridge → Frontend → Admin |
| **Johnny** (Telegram pass-through + AI) | Webhook → Routing layer (`@slug`, `/project`, `✅`) → AI intervention layer → Notification fan-out |
| **A3 Global License Academy** | Exams → Certificates → Templates → Landing chat → Subdomain (`a3.pplx.app`) |
| **OrthoCare AI** | Structured JSON triage flows → Decision tree → Treatment / meds / exercise / follow-up output |
| **LaunchKit** | Tenant control plane (Bolt) → Site generator → External hosting (Vercel/Netlify) |
| **AI Query System (AI Proxy)** | Agent Tools (5) → Smart follow-ups (low-cost model) → Plan-based rate limits → Admin governance |
| **Personal AI Agent** | Local Hebrew LLM → Orchestration/tools → Learning loop → Voice/polish |
| **Project Management module** (just shipped) | Schema → Storage → Routes → Cron scheduler → Telegram routing → Johnny tools → Frontend tabs → Deploy |

---

## 2. The architecture layers I use to handle your requests

These are the layers I've been running — in this order — every time you say
**"let's start core and layer it in"**. They are now formalized:

### Layer 0 — Intent & Clarification
- 1–4 sharp questions on **membership / permissions / channels / sync mode / cost ceiling**.
- Output: a frozen one-paragraph spec the rest of the build is anchored to.

### Layer 1 — Data Layer (Schema First)
- Drizzle tables in `shared/schema.ts`, all FKs, all enums.
- Insert/select Zod schemas via `drizzle-zod`.
- **Idempotent startup migration** (`CREATE TABLE IF NOT EXISTS`) — Railway-safe.
- Rule: SQLite has no arrays → JSON text columns.

### Layer 2 — Storage Layer
- `IStorage` interface in `server/storage.ts`.
- All Drizzle queries terminated with `.get()` / `.all()` / `.run()` (sync driver).
- One method per business operation, not per SQL query.

### Layer 3 — Backend / Routes Layer
- Express routes registered inside `registerRoutes(httpServer, app)`.
- Thin handlers — validate with Zod, call storage, return JSON.
- Bearer-token auth for admin endpoints; `useAuthFetch()` on the client.

### Layer 4 — Scheduler / Cron Layer
- 60s interval, two-phase pass: (a) fire due items, (b) transition past-due → overdue.
- `CronExpressionParser.parse(...)` (cron-parser v5).
- Always wrapped in `try/catch` — must never crash the server.

### Layer 5 — Agent / AI Layer (Johnny)
- Shared agent across all projects; project context loaded per chat.
- Tool dispatchers: `project_query`, `crm_query`, `create_assignment`, `project_message`, etc.
- One agent, many surfaces (web chat, Telegram, future voice).

### Layer 6 — Communication Bridge Layer (Telegram)
- Pass-through + AI mode (the relay rule you set in Phase 2).
- Routing patterns: `@<slug> …`, `/project <slug> …`, `✅ / done` to mark last reminder done.
- Membership check before any project-scoped write.

### Layer 7 — Notification / Fan-out Layer
- In-app `notifications` table + Telegram message + (future) email.
- 30s bell polling, unread badge, deep links to the source item.
- Free channels only — your standing rule.

### Layer 8 — Frontend / Presentation Layer
- Wouter hash routing (`/#/projects/:id`), shadcn/ui, Tailwind v3.
- 4-tab pattern for any "entity detail" page: Overview · Members · Calendar · Chat.
- TanStack Query for all data; never raw `fetch()`.
- `data-testid` on every interactive element.

### Layer 9 — Governance / Admin Layer
- Plan-based rate limits (free / starter / pro / enterprise).
- Role matrix (owner / manager / contributor / viewer).
- Admin-user exemption switch.
- This is what you called *"AI as a governance layer to manage business/home rules."*

### Layer 10 — Deploy & Verify Layer
- Push → Railway auto-deploys → idempotent migration auto-runs.
- Smoke test order: login → create entity → list → cross-channel test (web ↔ Telegram).
- Playwright visual QA on all primary screens.

---

## 3. Your recurring preferences (codified)

| Preference | What it means in practice |
|---|---|
| **Modular, API-first** | Every layer above is independently swappable. |
| **"Start core and layer it in"** | Build L1→L3 first, ship, then add L4–L7 in order. |
| **Multi-tenant by default** | Every entity has an `ownerId` and a membership table. |
| **Multi-provider** | Perplexity + OpenAI + Anthropic + Gemini keys, picked per task. |
| **Single agent everywhere** | Johnny is shared across projects; no agent-per-project sprawl. |
| **Hebrew + English** | i18n keys on day one, never retrofitted. |
| **Free channels** | In-app + Telegram. No SMS / paid email until you say so. |
| **Governance on top** | Rules and rate limits sit *above* the AI, not inside it. |

---

## 4. The mirror — how every future request will be handled

When you send a new feature request, I will respond with this template
**before writing any code**:

```
Layer 0 (Intent)        →  <one-paragraph spec + clarifying questions>
Layer 1 (Schema)        →  <tables / columns / FKs>
Layer 2 (Storage)       →  <storage methods>
Layer 3 (Routes)        →  <API surface>
Layer 4 (Cron)          →  <scheduled jobs, if any>
Layer 5 (Agent)         →  <Johnny tools to add>
Layer 6 (Telegram)      →  <routing patterns, if any>
Layer 7 (Notifications) →  <in-app + telegram events>
Layer 8 (Frontend)      →  <pages / tabs / components>
Layer 9 (Governance)    →  <roles / rate limits / plan gating>
Layer 10 (Deploy)       →  <migration + smoke test plan>
```

You can answer with just the layers that matter ("only L1, L3, L8" or
"skip L6 this time") and I'll build exactly that slice.

---

*Saved at `aiproxy/ARCHITECTURE_LAYERS.md` — versioned with the codebase so
every future session has the same starting point.*
