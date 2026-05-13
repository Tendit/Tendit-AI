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

## Part V — Tools as Capability Expansion

You nailed the underlying principle: **the architecture is a funnel for
information sources**. Every free API, scraper, dataset, or service we plug
into **B4 (Agent / Johnny)** widens what the system can answer and act on.
More tools = more answerable questions = more credit-efficient routing
(cheap data tool first, expensive LLM only when needed).

### The tool catalog — what to plug into Johnny

| Domain | Free API / Source | Auth | What it unlocks for you |
|---|---|---|---|
| **General data** | [public-apis/public-apis](https://github.com/public-apis/public-apis) (1,400+ catalog) | varies | Master index — pick by use case |
| **No-key APIs** | [Mixed Analytics list](https://mixedanalytics.com/blog/list-actually-free-open-no-auth-needed-apis/) · [apipheny](https://apipheny.io/free-api/) | none | Instant integration, zero friction |
| **Web search** | Perplexity Sonar (you have a key) | key | Already wired — your primary research tool |
| **Weather** | [OpenWeatherMap](https://openweathermap.org/api) | free tier | Current + 5-day forecast for any location — useful for OrthoCare follow-ups, A3 exam scheduling |
| **Geocoding / maps** | OpenStreetMap Nominatim, Mapbox free tier | none / key | Address → coords, route lookup for assignments |
| **News** | NewsAPI free tier, Hacker News API, Reddit API | key / none | Industry monitoring for LaunchKit competitor research |
| **Finance** | Yahoo Finance (unofficial), CoinGecko, Frankfurter (FX) | none | Market context for LaunchKit validation, business decisions |
| **Legal / regulatory** | CourtListener, EUR-Lex, Israeli Knesset open data | none / key | Your comparative-law research, A3 license compliance |
| **Health / medical** | OpenFDA, PubMed E-utilities, ICD-10 API | none / key | OrthoCare evidence layer — meds, contraindications, studies |
| **Astronomy** | NASA APOD + Open APIs, JPL Horizons | free key | Your space science interest, content for chat |
| **Calendar / time** | TimeAPI.io, public holiday APIs (Nager.Date) | none | Cron scheduling that respects Israeli/global holidays |
| **Translation** | LibreTranslate self-host, DeepL free tier | none / key | Hebrew ↔ English bridge for Johnny |
| **OCR / docs** | Tesseract (self-host), Mistral OCR free tier | none / key | Upload-a-photo workflows on Telegram |
| **Email lookup** | Hunter free tier, mail-tester | free tier | Invite-by-email validation in projects module |
| **Domain / DNS** | Cloudflare API, WHOIS APIs | key | Auto-provision subdomains for tenant sites |
| **Phone / SMS (free)** | Telegram Bot API ✓ already wired | bot token | Your primary channel — already done |
| **Storage** | Cloudinary free tier, R2 free tier | key | Image/PDF hosting for A3 certificates, OrthoCare reports |
| **Open LLM fallbacks** | Groq free tier, Cerebras free tier, Hugging Face Inference | key | Cheap routing target when Perplexity/Anthropic too expensive |

### The funnel principle (how it maps to the layers)

```
R1 (Research)  ← every new tool added at B4 widens the questions R1 can answer
     ▲
     │  Johnny picks cheapest sufficient tool
     │  (free API > Sonar > GPT > Claude)
     ▼
B4 (Agent)     ← tool catalog grows here; each tool = one dispatcher
     │
     ▼
B7 (Governance) ← rate-limit and cost-cap per tool, per plan
```

### Why this matters for credit economics
- A free weather API call costs $0. An LLM answering "will it rain tomorrow in Tel Aviv" without that tool costs credits and may hallucinate.
- Cron jobs (B3) can pre-fetch and cache: morning weather, daily exchange rates, news headlines — Johnny serves from cache instead of hitting an LLM.
- Tools you self-host (LibreTranslate, Tesseract) are zero marginal cost forever.
- The governance layer (B7) sets a per-plan tool budget — free users get 5 tools, pro gets 30, enterprise gets all.

### How to add a new tool (the recipe)
1. **R3 decision** — pick the API, confirm free tier limits, confirm no key OR get a key.
2. **B4 dispatcher** — add one Johnny tool function (e.g. `weather_query({location, days})`) that wraps the HTTP call.
3. **B3 cron** (optional) — pre-fetch and cache common queries.
4. **B7 governance** — register the tool in the plan matrix with rate limits.
5. **R2 codify** — add the tool to this catalog. Done.

Each new tool = one PR, one dispatcher, one row in this table. Compounding
leverage: the more tools Johnny has, the fewer LLM calls you need, the lower
your cost per answer, the wider the questions you can ask.

---

*Canonical at `aiproxy/ARCHITECTURE_LAYERS.md`. Versioned with the codebase
so every future session starts from the same stack.*
