# The Roy/Massive Working Architecture

> A unified layer stack derived from how you actually work with Perplexity —
> not just what we built. Research, decisions, iteration, building, deployment.
> Every project (Tendit, Massive, A3 Academy, OrthoCare, LaunchKit, Johnny,
> personal life) flows through these same layers. The platform and Johnny
> agent should mirror this end-to-end.

---

## Part I — How you actually work with me

Six observed behaviors that drive everything below.

| # | Pattern | Evidence |
|---|---|---|
| 1 | **Cross-disciplinary, synthesis-heavy research.** AI + law, AI + medicine, philosophy + product, fitness + optimization, music + culture — all in one mind. | Every memory domain — work, interests, knowledge, lifestyle. |
| 2 | **Broad → decomposed → reusable framework.** Big question gets split into structured sub-layers (admin, providers, pricing, rate limits, rules engine…) and codified as a template, not a one-off answer. | Tendit "Perplexity Computer" arc; LaunchKit's research segment with `viability_score / market_size / competitors / key_risk / key_opportunity`. |
| 3 | **Tradeoff-first decisions.** Margin, cost, abuse risk, business leverage. Decide from a table, then defer implementation. Recurring phrases: *"yes," "good," "let's," "nice"* — momentum-driven approval with continuous tuning, no resets. | Pricing multiplier discussion; provider cost tables; plan margin tables. |
| 4 | **Show, then adjust.** Want a live artifact (demo user, demo credentials, the page itself) before refining. Iterate in batches. Notice the moment something disappears: *"where are the agent tools and ai rules that we had earlier?"* | Tendit/Massive rollout arc; OrthoCare demo flow. |
| 5 | **Personal life integration — one ecosystem, not silos.** Massive Group, A3 Academy, OrthoCare, LaunchKit, Tendit, fitness, philosophy, music, family — Johnny is expected to carry context across all of them. | Memory of all projects + Johnny's pass-through + AI relay role. |
| 6 | **Terse, operational, low-noise communication.** English for technical builds, Hebrew (RTL Word format) for high-trust or official documents. Bullets, tables, decision trees when the topic is complex. | Communication-style and literal-interpretation memories; session language patterns. |

---

## Part II — The Universal Layer Stack

Eleven layers. Layers **R0–R3** are the *thinking* phase (research and decisions).
Layers **B1–B7** are the *building* phase (architecture and ship). Every request flows R → B.

### R0 — Intent & Constraints
- Capture the broad ask in one sentence + the business goal it serves.
- 1–4 sharp clarifying questions on **membership / channels / cost / sync / scope**.
- Freeze a one-paragraph spec everything else anchors to.
- *Your phrase that triggers this:* "let's define X for a moment."

### R1 — Cross-Domain Research
- Pull in evidence across disciplines: technical comparisons, legal/regulatory angles, market data, philosophy/principle alignment, health/optimization parallels.
- Run parallel searches, not sequential. Cite primary sources inline.
- Default output shape: a **comparison table** or a **decision matrix**, not prose.
- *Your phrase that triggers this:* "is it working like X?" / "how does it compare to…"

### R2 — Synthesis → Reusable Framework
- Collapse research into a named framework that can be reused: scoring rubric, JSON schema, decision tree, checklist, phased timeline.
- Examples we already have:
  - **LaunchKit research segment** — `viability_score`, `market_size`, `competitors`, `key_risk`, `key_opportunity`.
  - **OrthoCare triage** — structured JSON decision trees per body region.
  - **Tendit user timeline** — chats → categorized events → narrative summary.
- Output is *operational* (you can act on it), not encyclopedic.

### R3 — Decision with Tradeoffs
- Present 2–4 options as a tradeoff table: cost, margin, complexity, risk, time-to-ship.
- Recommend one with reasoning. Wait for *"good"* / *"yes, let's"* / *"actually, no — do X instead."*
- Lock the decision; everything after this is execution.

### B1 — Data Layer (Schema First)
- Drizzle tables in `shared/schema.ts`. All FKs, enums, JSON columns (no SQLite arrays).
- Insert/select Zod schemas via `drizzle-zod`.
- **Idempotent startup migration** (`CREATE TABLE IF NOT EXISTS`) — Railway-safe.

### B2 — Storage & Backend Layer
- `IStorage` interface in `server/storage.ts`. Sync Drizzle (`.get()` / `.all()` / `.run()`).
- Thin Express routes in `registerRoutes()`. Validate with Zod, call storage, return JSON.
- Bearer-token auth for admin; `useAuthFetch()` on the client.

### B3 — Scheduler / Cron Layer
- 60s interval, two-phase pass: fire due items → transition past-due → overdue.
- `CronExpressionParser.parse(...)` (cron-parser v5). Always `try/catch`.

### B4 — Agent / AI Layer (Johnny)
- Shared agent across all projects; context loaded per chat.
- Tool dispatchers: `project_query`, `crm_query`, `create_assignment`, `project_message`, plus per-business tools (A3 exam, OrthoCare triage, LaunchKit validation).
- One agent, many surfaces — web, Telegram, future voice.

### B5 — Bridge & Notification Layer
- **Telegram** as primary phone channel: `@<slug>`, `/project <slug>`, `✅ / done`.
- Pass-through + AI relay mode (your Phase 2 rule).
- In-app `notifications` table, 30s bell polling, deep links. Free channels only.

### B6 — Frontend / Presentation Layer
- Wouter hash routing, shadcn/ui, Tailwind v3.
- 4-tab pattern for entity detail: Overview · Members · Calendar · Chat.
- TanStack Query for all data. `data-testid` on every interactive element.
- Hebrew RTL + English i18n on day one.

### B7 — Governance & Deploy Layer
- Plan-based rate limits (free / starter / pro / enterprise) with admin exemption.
- Role matrix (owner / manager / contributor / viewer).
- Push → Railway auto-deploys → idempotent migration runs → smoke test
  (login → create entity → cross-channel test web ↔ Telegram → Playwright visual QA).
- **Codify into memory/template for reuse** — close the loop back to R2.

---

## Part III — The mirror

When you send any future request — research question, feature, or business
decision — I will respond with this template before writing code or prose:

```
R0 (Intent)        →  <one-paragraph spec + clarifying questions>
R1 (Research)      →  <cross-domain table or decision matrix>
R2 (Synthesis)     →  <reusable framework: schema / tree / checklist>
R3 (Decision)      →  <tradeoff table + recommendation>
─────────────────────────────────────────────
B1 (Schema)        →  <tables / FKs / enums>
B2 (Backend)       →  <storage methods + API surface>
B3 (Cron)          →  <scheduled jobs, if any>
B4 (Agent)         →  <Johnny tools to add>
B5 (Bridge)        →  <Telegram routing + notifications>
B6 (Frontend)      →  <pages / tabs / components>
B7 (Governance)    →  <roles + rate limits + deploy + memory codification>
```

Tell me which layers are in scope — *"just R1 and R2, no build yet"* for a
pure research question, *"skip R, jump to B1"* for a known feature, *"do all
eleven"* for a new module from scratch. The Tendit platform and Johnny will
follow the same flow.

---

## Part IV — Three real lifecycle arcs (for reference)

**Arc 1 — Perplexity Computer build-out**
R0 broad ask → R1 capability comparison vs real Computer → R2 admin/providers/pricing/rules framework → R3 multiplier decision → B1–B7 admin dashboard + agent tools + calendar engine + RTL + uploads + governance.

**Arc 2 — Tendit/Massive rollout**
R0 platform + domain → R1 DNS/provider/auth options → R2 brand & UI patterns → R3 remove old provider exposure → B1–B7 demo user → Johnny phone relay → CRM → project module → ship.

**Arc 3 — Personal AI Agent (Hebrew)**
R0 Hebrew agent need → R1 local vs external model tradeoffs → R2 phased timeline (skeleton → orchestration → learning loop → voice) → R3 text-only MVP first → B1–B7 ongoing.

The common shape every time:
**broad intent → clarify business goal → structured framework → live artifact
→ patch → extend horizontally → codify to template → next idea.**

---

*Canonical at `aiproxy/ARCHITECTURE_LAYERS.md`. Versioned with the codebase
so every future session starts from the same stack.*
