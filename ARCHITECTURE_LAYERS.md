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

## Part V — APIs per Layer (Tools as Capability Expansion)

You named the real shape: **every layer has its own API slot**, not just B4.
The architecture is a funnel for information sources, and each layer pulls
from a different shelf of free APIs. Johnny picks the right shelf at the
right step instead of routing everything through one giant tool drawer.

### The shelves — one per layer

#### R0 — Intent & Constraints · *clarification APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Memory recall | Internal `memory_search` | — | Pull past decisions, preferences, prior arcs |
| Disambiguation | [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access) | none | Resolve entities, person/place/concept lookup |
| Translation | LibreTranslate (self-host), DeepL free | none / key | Confirm intent across Hebrew ↔ English |

#### R1 — Cross-Domain Research · *evidence APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Web search | Perplexity Sonar ✓ wired | key | Live web with citations |
| News | [NewsAPI](https://newsapi.org/) · HN Algolia · Reddit JSON | key / none | Industry + culture monitoring |
| Academic | [OpenAlex](https://docs.openalex.org/) · [arXiv](https://info.arxiv.org/help/api/) · PubMed E-utilities | none | Papers, citations, scientific evidence |
| Legal | [CourtListener](https://www.courtlistener.com/help/api/) · EUR-Lex · Knesset Open Data | none / key | Comparative law + A3 compliance |
| Medical | [OpenFDA](https://open.fda.gov/apis/) · PubMed · ICD-10 API | none | OrthoCare evidence layer |
| Finance | CoinGecko · [Frankfurter FX](https://www.frankfurter.app/) · Yahoo Finance | none | LaunchKit market context |
| Astronomy | [NASA Open APIs](https://api.nasa.gov/) · JPL Horizons | free key | Your space-science interest |
| Catalog | [public-apis/public-apis](https://github.com/public-apis/public-apis) (1,400+) | varies | Master index for new shelves |

#### R2 — Synthesis · *framework APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Schema generation | OpenAI/Anthropic structured output ✓ wired | key | JSON-schema-conformant outputs |
| Diagrams | [Mermaid](https://mermaid.js.org/) · [Kroki](https://kroki.io/) | none | Decision trees, system diagrams |
| Template store | Internal DB (your codified frameworks) | — | LaunchKit `viability_score`, OrthoCare triage, etc. |

#### R3 — Decision · *tradeoff APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Pricing data | Provider pricing pages (cached) | none | Cost-per-1k-token tables |
| FX rates | Frankfurter | none | USD ↔ ILS for margin math |
| Risk lookup | OFAC SDN list, sanctioned-IP APIs | none | Compliance check before commit |

#### B1 — Data Layer · *schema enrichment APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Geocoding | [Nominatim](https://nominatim.org/release-docs/latest/api/Overview/) · Mapbox free | none / key | Address → lat/lng on insert |
| Holidays | [Nager.Date](https://date.nager.at/) | none | Populate work-calendar tables |
| Currency | Frankfurter | none | Normalize budget fields to USD |
| Email validation | Hunter free, mail-tester | free tier | Validate `user_invites.email` before save |

#### B2 — Backend / Routes · *runtime APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Auth fallback | Clerk free · Auth0 free | key | Optional SSO for enterprise tenants |
| Rate limiting | Upstash Redis free | key | Per-route + per-tool budgets |
| Webhooks in | Telegram ✓ · Stripe · GitHub | key | External events trigger routes |

#### B3 — Scheduler / Cron · *time & event APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Timezones | [TimeAPI.io](https://timeapi.io/) · WorldTimeAPI | none | Cron correctness for global members |
| Holidays | Nager.Date · Hebcal (Jewish calendar) | none | Skip assignments on Shabbat / Yom Tov |
| Weather pre-fetch | OpenWeatherMap | free tier | Cache morning forecast so chat is instant |
| FX pre-fetch | Frankfurter | none | Daily rate snapshot |

#### B4 — Agent / Johnny · *tool-use APIs* (the widest shelf)
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Primary LLMs ✓ wired | Perplexity · OpenAI · Anthropic · Gemini | key | Reasoning & generation |
| Cheap fallback LLMs | [Groq](https://console.groq.com/) · [Cerebras](https://inference-docs.cerebras.ai/) · HuggingFace Inference | free key | Route low-stakes calls cheaply |
| Voice STT/TTS | OpenAI Whisper · ElevenLabs free · Coqui (self-host) | key / none | Future voice channel |
| OCR | Tesseract (self-host) · Mistral OCR free | none / key | Photo → text on Telegram |
| Image gen | Pollinations · HuggingFace SDXL | none / key | Inline media in chat |
| Code exec | Local Node sandbox · Piston API | none | Computation tools |
| Plus every R1 shelf | (re-exposed as Johnny tools) | — | Search/finance/legal/medical/etc. |

#### B5 — Bridge / Notifications · *delivery APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Telegram ✓ wired | Bot API | bot token | Primary phone channel |
| Push (web) | Web Push (VAPID, free) | self-keys | Browser notifications |
| Email | Resend free tier · Brevo free | key | Future, only if you lift the "free channels" rule |
| Calendar invites | ICS generation (no API needed) | — | Attach `.ics` to assignment emails |

#### B6 — Frontend · *UI/asset APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Maps | Leaflet + OSM tiles | none | Project location previews |
| Charts | Recharts (lib, no API) | — | Dashboards |
| Avatars | DiceBear · Gravatar | none | Default member avatars |
| Storage | Cloudinary free · Cloudflare R2 free | key | User uploads, A3 certificates, OrthoCare reports |
| Translation strings | LibreTranslate | none | Auto-generate Hebrew i18n keys |

#### B7 — Governance & Deploy · *operations APIs*
| Slot | API / Source | Auth | Purpose |
|---|---|---|---|
| Deploy | Railway API ✓ wired · Vercel · Netlify | key | Auto-deploy on push |
| Git | GitHub API ✓ wired | PAT | Code + PRs |
| DNS | Cloudflare API | key | Auto-provision tenant subdomains (LaunchKit) |
| Monitoring | UptimeRobot free · BetterStack free | key | Health checks per service |
| Cost tracking | Provider billing APIs (OpenAI usage, Anthropic usage) | key | Real margin math per plan |
| Sanctions/compliance | OFAC SDN, EU sanctions list | none | Block restricted users at sign-up |

### The funnel diagram

```
R0 ─ Wikidata, memory, translate
R1 ─ Sonar, news, academic, legal, medical, finance, astro
R2 ─ structured-output, Mermaid, template store
R3 ─ pricing, FX, sanctions
  ▼
B1 ─ Nominatim, holidays, currency, email-validate
B2 ─ auth, rate-limit, webhooks
B3 ─ time, holidays (Hebcal), weather pre-fetch, FX pre-fetch
B4 ─ Johnny: every shelf above + LLM fallbacks + voice + OCR + image
B5 ─ Telegram, web push, email (optional), ICS
B6 ─ maps, charts, avatars, R2/Cloudinary, translation
B7 ─ Railway, GitHub, Cloudflare DNS, monitoring, billing, sanctions
```

Johnny doesn't have one tool drawer — he has **eleven shelves**, and the
layer he's currently in dictates which shelf he reaches for.

### The credit-economics argument
- Free API call to `Nager.Date` for tomorrow's holiday = $0. An LLM answering "is tomorrow a holiday in Israel" = credits + possibly wrong.
- B3 pre-fetches the common stuff (weather, FX, news headlines) into cache. Johnny serves from cache. LLM only used when the answer needs reasoning.
- Self-hosted tools (LibreTranslate, Tesseract, Piston) = zero marginal cost forever.
- B7 governance sets per-plan **tool budgets**: free=5 tools, starter=15, pro=30, enterprise=all.

---

## Part VI — Price-Tiered Routing (Tools Per Tier, Per Layer)

Each shelf isn't a flat list — it's a **three-tier ladder**: free → cheap →
expensive. Johnny tries tier 1 first; if it fails (rate limit, downtime,
price hike, geo-block, ToS change), he falls through to tier 2, then tier 3.
If Base44 (or any vendor) changes their pricing tomorrow, you swap the
tier-1 entry in one file and everything keeps working at the new cheapest
price. **This is what makes the funnel anti-fragile.**

This pattern is proven in production: [LiteLLM](https://docs.litellm.ai/docs/routing) uses `order=1/2/3`
for LLM fallback, [OpenRouter](https://openrouter.ai/pricing) does it with `:floor` sorting. We apply the same
idea to every layer's shelf, not just LLMs.

### The tier ladder shape

| Tier | Cost target | Use when | Example pick |
|---|---|---|---|
| **T1 Free** | $0 / call, no key OR free tier under cap | Always try first | Nager.Date holidays, Frankfurter FX, OSM Nominatim |
| **T2 Cheap** | < $0.001 / call OR generous free tier | T1 rate-limited, downtime, or insufficient quality | Groq, Cerebras, OpenWeatherMap free, Cloudinary free |
| **T3 Expensive** | Premium / authoritative | T1+T2 fail OR task needs top quality (paying customer, legal/medical) | Claude Opus, GPT-5, Mapbox paid, DeepL Pro |

### Example tiers per shelf (illustrative — stored in DB, not hardcoded)

| Layer | Capability | T1 Free | T2 Cheap | T3 Expensive |
|---|---|---|---|---|
| R1 | Web search | DuckDuckGo HTML | Brave Search free 2k/mo | Perplexity Sonar |
| R1 | News | HN Algolia, Reddit JSON | NewsAPI free 100/day | NewsAPI paid |
| R1 | Legal | EUR-Lex, Knesset open data | CourtListener free | Westlaw / Nevo |
| R1 | Medical | PubMed, OpenFDA | RxNorm | UpToDate (paid) |
| B1 | Geocoding | OSM Nominatim | Mapbox 100k/mo free | Google Maps Geocoding |
| B1 | Holidays | Nager.Date + Hebcal | Calendarific free | Calendarific paid |
| B3 | Weather | Open-Meteo (no key, free) | OpenWeatherMap free tier | Tomorrow.io |
| B4 | LLM (low-stakes) | Groq Llama-3.3 free | Gemini Flash | Sonnet 4.6 |
| B4 | LLM (reasoning) | DeepSeek free | GPT-5-mini | Claude Opus 4.7 |
| B4 | OCR | Tesseract self-host | Mistral OCR free 1k/day | Google Document AI |
| B4 | Image gen | Pollinations (no key) | HuggingFace SDXL | Imagen / DALL·E |
| B4 | Voice STT | Whisper.cpp self-host | Groq Whisper free | ElevenLabs paid |
| B5 | Email | None (skip per your rule) | Resend free 3k/mo | SendGrid paid |
| B5 | SMS | Telegram (your standing rule) | Twilio free trial | Twilio paid |
| B6 | Storage | Local disk + R2 free 10GB | Cloudinary free 25GB | S3 paid |
| B7 | Monitoring | UptimeRobot free 50 monitors | BetterStack free | Datadog |

### The Tool Router — one table that drives everything

Store the ladder in a **`tool_providers`** table so you can swap tiers
without a redeploy:

```sql
tool_providers (
  capability      TEXT,      -- 'web_search', 'geocoding', 'llm_reasoning', ...
  layer           TEXT,      -- 'R1', 'B1', 'B4', ...
  tier            INTEGER,   -- 1, 2, 3
  provider_name   TEXT,      -- 'groq', 'openrouter', 'sonar', ...
  endpoint        TEXT,
  auth_profile_id INTEGER,   -- FK to auth_profiles (↓ below)
  cost_per_call   REAL,      -- in USD, for routing math
  rate_limit_rpm  INTEGER,
  monthly_cap     INTEGER,
  enabled         INTEGER DEFAULT 1,
  priority        INTEGER    -- within a tier, tie-break
)
```

When Johnny needs `web_search`, the router runs:
```
SELECT * FROM tool_providers
WHERE capability='web_search' AND enabled=1
ORDER BY tier ASC, priority ASC
```
...and walks the list until one succeeds. **No code change needed when
pricing shifts.**

### The Profile Pool — multiple accounts per provider to multiply free tiers

Each provider can have N free-tier accounts pooled behind one logical
capability. The router picks the account with the most remaining quota.
This is exactly what [GPT-Load](https://www.reddit.com/r/selfhosted/comments/1mwv6gg/) and similar self-hosted poolers do.

```sql
auth_profiles (
  id              INTEGER PRIMARY KEY,
  provider_name   TEXT,        -- 'groq', 'openweathermap', 'base44', ...
  account_label   TEXT,        -- 'roy_personal', 'massive_corp', 'a3_academy'
  api_key         TEXT,        -- encrypted
  monthly_quota   INTEGER,
  used_this_month INTEGER DEFAULT 0,
  resets_at       TEXT,        -- when the free tier resets
  enabled         INTEGER DEFAULT 1
)
```

**Pooling examples for your stack:**
- Groq free tier: 14,400 req/day per account. Pool 3 accounts (personal + Massive + A3) = 43,200 req/day, zero cost.
- OpenWeatherMap: 1,000 calls/day per account. Pool 4 accounts = 4,000/day.
- Base44: each plan has integration credits. Pool one per business entity if you must use Base44 for prototyping.
- NewsAPI free: 100 req/day. Pool 5 accounts = 500/day.

**Rules of the road** (so you stay within ToS):
- One account per *real* legal entity (Roy personal, Massive Group LLC, A3 Academy, OrthoCare, LaunchKit). You actually have multiple businesses — use them legitimately.
- Don't create burner accounts under fake names. That breaks ToS and risks bans on your real ones.
- Self-host where you can (LibreTranslate, Tesseract, Whisper.cpp, Piston) — those have no quota at all.

### Failover & cost-watch loop

The router runs three guardrails on every call:

1. **Pre-flight quota check.** If `used_this_month >= monthly_quota * 0.95`, skip this profile, try the next one in the same tier.
2. **On-error tier escalation.** If the call returns 429/402/5xx, mark the profile cooled-down for N minutes and try the next provider in the same tier; if all tier-1 providers exhaust, escalate to tier 2.
3. **Price-drift alarm (cron, B3).** Daily job pulls each provider's current pricing page. If T1 cost > T2 cost, send a notification: *"Provider X moved out of tier 1 — demote and pick replacement."* Johnny proposes a swap; you approve.

### What changes when Base44 (or anyone) raises prices

1. Cron detects the price drift, posts to Johnny.
2. Johnny queries the catalog for alternative providers of the same capability.
3. Returns a 2–3 option tradeoff table (R3 shelf).
4. You pick — e.g. "move email from Resend to Brevo."
5. One UPDATE on `tool_providers` swaps the tier. Zero code redeploy.

This is the **anti-fragility property**. You're never locked into any
single vendor at any single price point on any single layer.

### The 6-step recipe for adding a new API (updated for tiers + pooling)
1. **Pick the layer & capability** — which shelf, which capability slot?
2. **Assign the tier** — free/cheap/expensive based on cost-per-call.
3. **Register account profile(s)** — add one row per legitimate account in `auth_profiles`.
4. **Add the route entry** — one row in `tool_providers` linking capability+tier+profile.
5. **B3 cron pre-fetch** *(optional)* — cache hot queries.
6. **B7 governance** — plan matrix decides which tiers each user plan can use.

Each addition = one shelf row, one or more profile rows, one route entry.
Compounding leverage: more shelves stocked + more profiles pooled → more
questions answerable at lower cost → anti-fragile against any single
vendor's pricing changes.

---

## Part VII — Web/Browse Shelf (Johnny's Eyes on the Open Web)

Up through Part VI, Johnny only had three project-management tools.
He could not see the open web. Part VII gives him **four capabilities**
that slot into the R1 (research) and B4 (agent runtime) layers. Each
capability is itself a 3-tier shelf following the Part VI ladder.

### The four capabilities

| Tool | What it does | R1/B4 layer |
|---|---|---|
| `web_search(query, freshness?)` | Google-style query, returns titles + snippets + URLs | R1 |
| `fetch_page(url, extract_prompt?)` | Pull one URL, optionally ask an LLM to extract specific info | R1 + R2 |
| `browse_page(url, task)` *(Phase B)* | Full JS execution, click/fill/scroll | B4 |
| `screenshot_url(url, viewport?)` *(Phase B)* | Visual snapshot of a page | R1 + B4 |

Phase A ships only the first two — they cover ~80% of what Johnny needs
to answer factual questions ("what's the dollar/shekel today", "summarize
this article", "who is this Fiverr seller"). Phase B adds JS-rendered
browsing and screenshots once we have the Mac mini for the heavier work.

### Tier ladder per capability

| Capability | T1 (free) | T2 (cheap) | T3 (expensive) |
|---|---|---|---|
| **web_search** | DuckDuckGo HTML, Brave Search Free | Brave API ($3/1k), Serper ($0.30/1k) | Perplexity Sonar, Tavily |
| **fetch_page** | Node fetch + Readability.js | Jina Reader free (1M tokens/mo), Firecrawl free | Firecrawl paid, Browserless |
| **browse_page** | Self-hosted Playwright on Mac mini | Browserless hobby, ScrapingBee | Browserless scale, Bright Data |
| **screenshot_url** | Self-hosted Playwright | ApiFlash free 100/mo, Urlbox | ApiFlash paid |

All four route through the same `pickProvider(capability)` function from
Part VI, so the price-drift cron and profile pooling already apply.

### Why this is not the same as Part VIII

Part VII reads the **public** web. No accounts, no cookies, no login.
If a Fiverr seller's profile is public, `fetch_page` can read it.
If the page requires login (the inbox, the order page, the buyer
dashboard), Part VII cannot. That's what Part VIII is for.

---

## Part VIII — Managed Sessions (Johnny's Hands on the Logged-In Web)

The core idea: Johnny operates a **real Chrome browser logged into your
real accounts** (Fiverr, Alibaba, etc.) under **manager approval for
every outbound action**. No scraping. No bot accounts. No headless
fingerprinting risk.

This is the human-in-the-loop computer-use pattern: agent reads page,
proposes action, pauses, manager approves/edits/rejects in Telegram or
the Tendit dashboard, agent executes.

### Layer touches

| Layer | What gets added |
|---|---|
| R0 Intent | New intent type: `provider_outreach` |
| B1 Schema | `managed_sessions`, `session_accounts`, `pending_actions`, `action_approvals` |
| B2 Routes | List sessions, queue action, approve/reject, replay, audit log |
| B3 Cron | Session keepalive (refresh cookies), stale-approval reminder |
| B4 Agent | New tools: `read_session_page`, `propose_action`, `wait_for_approval` |
| B5 Telegram | Approval cards with inline Approve / Edit / Reject keyboard |
| B6 Frontend | New **Provider Sessions** page: live screenshot + pending queue + audit log |
| B7 Governance | Every action logged with approver, timestamp, page state hash |

### Runtime tier ladder

The browser runtime is itself a tiered shelf. Same `pickProvider()` lookup.

| Tier | Runtime | Cost | Fingerprint risk | When to use |
|---|---|---|---|---|
| **T1 — owned hardware** | Mac mini at office running real Chrome, persistent profile | $599 once + $0/mo | None — it IS a real desktop | Fiverr, Alibaba, anything anti-bot-aggressive |
| **T2 — cloud headless** | Browserless with persistent session ID | Free 1k/mo per account × 5 = 5k/mo | Medium — they fingerprint headless | Low-risk sites, internal tools |
| **T3 — anti-detect cloud** | Bright Data Scraping Browser, Multilogin | $$$/session | Lowest of cloud options | Fallback only |

### The interface

```ts
interface BrowserRuntime {
  openPage(sessionId: string, url: string): Promise<PageState>;
  readPage(sessionId: string): Promise<PageState>;
  proposeAction(sessionId: string, action: Action): Promise<{ actionId: string }>;
  executeApprovedAction(actionId: string): Promise<ActionResult>;
  screenshot(sessionId: string): Promise<Buffer>;
}
```

Three implementations on the shelf:
- `MockRuntime` — canned page state, used for Phase A end-to-end testing before hardware arrives
- `LocalChromeRuntime` — talks to the Mac mini relay agent over Cloudflare Tunnel (Phase B)
- `BrowserlessRuntime` — cloud fallback (Phase B+)

Swapping runtimes = one row update in `tool_providers`. Same Part VI
anti-fragility property applied to runtimes instead of APIs.

### The approval flow

1. **Johnny reads the page** via `read_session_page(sessionId)` and decides an action is needed ("send this draft message to seller X")
2. **Johnny calls `propose_action`** with the action payload + reasoning + page state hash
3. **Tendit creates a `pending_action` row** and pushes notifications: Telegram card to manager, badge on Provider Sessions page
4. **Manager reviews** in either channel: sees draft text, page screenshot, reasoning. Picks Approve / Edit / Reject
5. **On approval**, Tendit calls `executeApprovedAction(actionId)` against the runtime; runtime clicks Send in real Chrome
6. **Result + screenshot logged** to `action_approvals` with manager ID, timestamp, before/after page state

Every outbound action has a manager signature. No agent ever sends
autonomously. This is the contract you set in the May 18 thread.

### Phase A vs Phase B split

| Phase | Ships | Hardware needed |
|---|---|---|
| **A1** | Part VII tools (`web_search`, `fetch_page`) | No |
| **A2** | Part VIII schema + routes + frontend + Telegram + `MockRuntime` | No |
| **B** | Mac mini relay agent + `LocalChromeRuntime` + first Fiverr adapter | Yes — Mac mini at office |

Phase A delivers a **fully tested approval flow** against the mock, so
when the Mac mini arrives we only need to write the relay agent (~200
lines) and the Fiverr-specific selectors. The schema, the UI, the
approval queue, the audit log, the Telegram cards — all already shipped
and battle-tested against the mock.

### Site adapters

Each marketplace gets its own adapter under `server/adapters/`:

```
server/adapters/
  fiverr.ts       # selectors: inbox, compose, send, profile
  alibaba.ts      # selectors: RFQ, supplier message, quote
  _adapter.ts     # shared adapter interface
```

Adapter responsibilities:
- Recognize "are we on the right page?"
- Extract structured page state (current thread, seller name, last message)
- Map abstract actions (`sendMessage`, `requestQuote`) to concrete DOM clicks
- Detect anti-bot challenges and pause for manager intervention

Adding a new marketplace = one new adapter file + one row in
`tool_providers`. Same shelf pattern. Same anti-fragility.

---

## Part IX — Multi-Project Operations Layer

Parts I–VIII built the agent runtime, the research stack, the tool
shelves, and the approval rail for risky outbound actions. Part IX is
the **business layer**: real projects with real members, real money, real
milestones, and a multi-agent workforce.

Five components, all interlocking, shipped as one push:

1. **Project portfolio seed** — the 11 ventures preloaded
2. **Voice in project chat** — record → transcribe → audio + transcript both kept
3. **Chat-reply approval gate** — Johnny's replies in project chat pause for owner approval
4. **Agent registry & switching** — multiple LLMs/models routed per project & capability
5. **Milestones with dependencies** — "do X next month, but only if Y and Z are done"
6. **Credits, ledger & billing** — token-based internal accounting, Stripe checkout, overdraft queue

### Layer touches

| Layer | What gets added |
|---|---|
| R0 Intent | New intent types: `project_chat_query`, `milestone_advance` |
| R3 Decision | Credit-check gate before any paid action |
| B1 Schema | `agents`, `agent_assignments`, `milestones`, `milestone_deps`, `user_credits`, `project_credits`, `credit_ledger`, `credit_packages`, `system_credit_queue`; extends `project_messages` with `audio_url`, `transcript`, `duration_sec` |
| B2 Routes | Voice upload, transcription, agent registry CRUD, milestone CRUD, credit purchase, Stripe webhook, system-credit-queue approval |
| B3 Cron | Milestone dependency resolver (daily), stale-approval reminder (every 30 min), credit-low warning (when balance < 100) |
| B4 Agent | Johnny gains: `transcribe_audio`, `check_credits`, `consume_credits`, `route_to_agent`; new shared infrastructure for multi-agent orchestration |
| B5 Telegram | Approval cards for chat replies (reuses Part VIII queue); credit-low DM to user |
| B6 Frontend | Voice record button in chat, admin **Approvals** page, **Agents** page, **Milestones** tab on project detail, **Credits** page with Stripe checkout, **System Queue** (admin only) |
| B7 Governance | Every paid action logged in `credit_ledger` with txn type, amount, before/after balance |

### Component 1 — Project portfolio seed

One-time migration inserts these 11 projects on first boot:

| Slug | Name | Status |
|---|---|---|
| massive | Massive Group | active (parent) |
| a3-academy | A3 Academy | live (a3m.pplx.app) |
| orthocare | OrthoCare AI | active build |
| launchkit | LaunchKit | active build |
| tendit | Tendit AI | live (this platform) |
| spc | SPC Pool Safety | grant-stage |
| foraviset | Foraviset Biotech | fundraising |
| hatala | HaTala / Lati Fridges | concept |
| listening | AI Listening Service | concept |
| personal-os | Personal OS / Private Phone | research |
| ai-game | AI Game Dev | research |

Idempotent: only inserts rows whose slug doesn't yet exist. User can
edit/archive/delete in UI after.

### Component 2 — Voice in project chat

Flow:
1. Member taps mic in chat tab → `MediaRecorder` captures `.webm` audio
2. Upload to Tendit → stored on [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) ($0.015/GB/mo, free egress — essentially free at our scale)
3. Transcribe via tiered shelf: T1 [Groq Whisper](https://console.groq.com/) (14,400 req/day per account × 5 pooled accounts ≈ unlimited) → T2 [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text) ($0.006/min) → T3 self-hosted whisper.cpp
4. Both `audio_url` and `transcript` stored on the `project_messages` row — members can read or replay
5. Johnny treats the transcript as a regular text message for response purposes

Credit cost: 3 credits per minute of audio.

### Component 3 — Chat-reply approval gate

**Key constraint:** Johnny can still *talk* to members in chat to acknowledge
("give me a moment, running this"), but any **content reply** — actual
answer to the user's question — routes through admin approval first.

Reuses Part VIII's `pending_actions` table with `actionType="chat_reply"`:

1. Member posts message in project chat
2. Johnny processes, drafts a reply
3. Johnny posts an acknowledgement immediately: "On it, give me a moment." (this is a system-flagged message, no approval needed)
4. Johnny creates `pending_action(actionType="chat_reply", payload=draftReply, projectId, sessionId=chatId)`
5. **Project owner** (not Massive admin — the person who runs that project) sees Approval card in admin console + Telegram
6. Owner approves → reply posts to chat as Johnny. Edit → owner's edit posts. Reject → dropped, members see a single "can't help with that" generic.
7. All routed through the **same approval queue** built in Phase A. Zero new tables.

### Component 4 — Agent registry & switching

New table `agents`:
```
id, name, slug, provider (openai|anthropic|sonar|groq|ollama|local),
model (e.g. "claude-sonnet-4.6"), capabilities (JSON array),
system_prompt, status (active|paused), created_at
```

New table `agent_assignments`:
```
id, agent_id FK, project_id FK (nullable — null = global default),
capability (chat_reply | financial_modeling | exam_grading | code_review | ...),
priority (lower wins ties)
```

Resolution logic when Johnny needs an agent for capability `C` on project `P`:
1. Look up `agent_assignments` where `project_id=P` and `capability=C` → use that agent
2. Fallback to `project_id=NULL` row → the global default for that capability
3. Hard fallback to Johnny on claude-sonnet

This is how you route OrthoCare's chat to a medical-tuned model,
LaunchKit's financial modeling to GPT-5, A3 Academy's exam grading to
Groq (cost-optimal). One row in `agent_assignments`.

### Component 5 — Milestones with dependencies

New table `milestones`:
```
id, project_id FK, name, description, due_date, status (locked|ready|in_progress|done|skipped),
agent_assignment_id FK (nullable), created_at, completed_at, completed_by
```

New table `milestone_deps`:
```
id, milestone_id FK (the dependent), depends_on_milestone_id FK (the prerequisite)
```

Daily B3 cron job:
```
for each milestone where status=locked:
  prereqs = SELECT depends_on FROM milestone_deps WHERE milestone_id=this
  if all prereqs have status=done:
    set status=ready
    notify project owner in chat + Telegram
    if agent_assignment_id set: spawn assignment for that agent
```

Your example becomes three rows:
```
#1  Foraviset → "FTO Patent Filing"      → status=ready, due=2026-06-15
#2  Foraviset → "Q3 Financial Report"    → status=ready, due=2026-06-20
#3  Foraviset → "VC Website Launch"      → status=locked, due=2026-07-01
          depends_on → [#1, #2]
```

Milestone #3 stays locked until both #1 and #2 flip to done. Then
auto-flips to ready, notifies, and (if `agent_assignment_id` is set)
kicks off the assigned agent to start work.

### Component 6 — Credits, ledger & billing

The accounting layer that gates everything.

**Conversion table (1 credit = 1k LLM tokens equivalent):**

| Action | Credits | Notes |
|---|---|---|
| LLM call | actual_tokens / 1000 | Rounded up to nearest credit |
| Voice transcription | 3 × minutes | |
| Web search | 1 | |
| Page fetch | 1 | |
| Managed-session action (Part VIII) | 5 | Owner approval is the gate; credits are the bill |
| Image generation | 10 | Future Phase X |
| Long-running agent task | sum of sub-actions | |

**Balance model — project-funded:**

- Massive admin (you) opens a project for a client
- Project gets a `project_credits.balance` seeded by you (e.g. 1,000 credits trial)
- Every member action in that project deducts from `project_credits`
- When balance > 0: Johnny runs freely, deducts in real-time
- When balance hits 0 mid-task: current sub-action completes, then next action queues for system approval

**Personal balance (secondary):**

User also has `user_credits.balance` for non-project actions (DMing Johnny
outside any project, personal queries). Bought via Stripe like project
credits.

**Overdraft & system credit queue:**

New table `system_credit_queue`:
```
id, project_id FK, user_id FK, action_payload JSON, estimated_credits,
requested_at, status (awaiting | approved | denied | executed),
approved_by (user_id of Massive admin), approved_at
```

When `project_credits.balance` hits 0:
- New actions don't run — they insert into `system_credit_queue` with `status=awaiting`
- Massive admin sees them in **System Queue** page (admin-only)
- Approve → action runs, cost added to `project_credits.overdraft_balance`
- Hard ceiling: `project.overdraft_ceiling` (default 500 credits, per-project configurable). Past ceiling → no more approvals, hard stop, user must top up.

When user next buys credits via Stripe:
- New credits land in `project_credits.balance`
- Settlement runs first: if `overdraft_balance > 0`, deduct from new balance until overdraft is cleared
- Remainder is usable balance

**Ledger (the audit truth):**

New table `credit_ledger` — immutable append-only log:
```
id, project_id FK (nullable), user_id FK, txn_type (debit | credit | overdraft_settle | refund),
amount, balance_after, action_ref (nullable, points to action_audit_log or pending_action),
stripe_charge_id (nullable), created_at
```

Every credit movement of any kind writes a row here. Source of truth for
billing reconciliation, dispute resolution, user receipts.

**Stripe integration (extends existing scaffold):**

Tendit already has `stripeCustomerId` and `stripeSubscriptionId` columns
on the users table and a billing.tsx page — scaffolded but inert (no
`stripe` package installed, no webhook handler, no checkout route).
Part IX finishes the wiring:

1. Install [`stripe` npm package](https://www.npmjs.com/package/stripe)
2. New table `credit_packages`: id, name, credits, price_usd, price_ils, stripe_price_id
3. Seed packages: Starter (100 credits @ $5), Growth (500 @ $20), Pro (2,000 @ $70), Scale (10,000 @ $300)
4. Route `POST /api/billing/checkout` — creates [Stripe Checkout Session](https://stripe.com/docs/payments/checkout), returns redirect URL
5. Route `POST /api/billing/webhook` — [Stripe webhook](https://stripe.com/docs/webhooks) handler, on `checkout.session.completed` → credit user/project, write ledger entry, settle overdraft if any
6. Frontend: Credits page shows current balance(s), package selector, Stripe checkout button, ledger view (last 50 txns)
7. **"Need more than this?"** button next to packages → opens [Calendly](https://calendly.com/) for consulting call (your manual-payment funnel for big engagements)

### Phasing within Part IX

All one push, but ordered to minimize risk:

1. **Schema migrations** (idempotent CREATE TABLE IF NOT EXISTS) — commits cleanly, no behavior change
2. **Seed 11 projects** — inserts on next boot, idempotent by slug
3. **Agent registry** — inserts default "Johnny" agent assignment as the global default for `chat_reply`
4. **Credits ledger + project_credits** — every project gets 0 balance until topped up; system-credit-queue page lets admin top up manually
5. **Voice transcription endpoint + chat upload UI**
6. **Chat-reply approval gate** — reuses Part VIII
7. **Milestone tables + dependency cron**
8. **Stripe checkout + webhook** — last because it requires Stripe API keys in Railway env

Every step is independently shippable. We can split into two deploys if
any part needs more bake time.

### Anti-fragility properties Part IX preserves

- Voice transcription routes through Part VI tier ladder — Groq goes paid? swap to OpenAI Whisper, one row
- LLM agent routing routes through Part VI — Anthropic raises prices? swap to Sonar for chat_reply, one row
- Stripe goes down? `credit_packages` table can point to alternate processor (PayPlus, PayPal) by changing the checkout route
- All credit-spending actions write to `credit_ledger` — single source of truth survives any frontend or processor change

---

## Part X — Project Arms (Functional Sub-Branches with Named AI Managers)

Part X adds **arms** — functional sub-branches inside each project. Where Part IX
gave us projects, members, credits, and the approval rail, Part X subdivides the
work *inside* a project into the four functions every operation needs:

| Arm slug    | AI manager | Function                                  |
|-------------|------------|-------------------------------------------|
| `providers` | **Shira**  | Sourcing & supplier relationships         |
| `marketing` | **Maya**   | Demand, content, positioning              |
| `legal`     | **Eitan**  | Contracts, compliance, risk               |
| `finance`   | **Noa**    | Budgets, spend, counterparty terms        |

Every project is seeded with all four arms on boot (4 × 11 projects = **44 arms**).
Each arm is **owned by exactly one teammate** (nullable until claimed), run by one
named AI manager, and carries a **versioned living instruction document** plus a
set of **target counterparties** with AI-drafted instruction sheets that flow
through the Part IX approval gate before they can go outbound.

### What it reuses (extension, not rebuild)

- **AI managers live in the existing `agents` table** with `scope='arm'` and a new
  `display_name` column — no separate `arm_agents` table. The four managers use
  `provider='groq'`, `model='groq/llama-3.3-70b-versatile'`.
- **Tier ladder (Part VI):** tier-1 arm chat replies go through the **Groq free
  pool** (`callGroqArm`, direct fetch with `auth_profiles` round-robin across the
  5 entities — **never Base44**). Deep-work replies escalate to Claude
  (`callProvider('anthropic', ...)`).
- **Approval gate (Part IX):** outbound target instruction sheets create a
  `pending_actions` row with `actionType='arm_instruction'` (sessionId=0 for
  web-originated actions). Only the **arm owner or an admin** may approve/reject.
- **Credit ledger (Part IX):** every spend writes through `storage.debitCredits`.
- **Voice (Part IX):** arm voice messages reuse the Whisper transcription path
  and R2 audio upload.

### Schema (all tables `p10_`-prefixed, autoincrement INTEGER keys)

| Table                         | Purpose                                                        |
|-------------------------------|----------------------------------------------------------------|
| `p10_arms`                    | One row per (project, function). Unique index (project_id, slug). Owner, agent, visibility, active flag. |
| `p10_arm_documents`           | One living document per arm (shell seeded on boot).            |
| `p10_arm_document_versions`   | Append-only version history; `current_version_id` on document. |
| `p10_arm_targets`             | Target counterparties for an arm.                             |
| `p10_arm_target_instructions` | AI-drafted instruction sheets; `pending_action_id` FK → gate.  |
| `p10_arm_messages`            | Per-arm chat with the AI manager (text + voice).               |
| `p10_arm_activity_log`        | Audit + credit-cost trail powering the manager dashboard.      |

Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` in
try/catch). The seed checks existence before insert and runs on every boot —
second boot is a verified no-op (0 arms created).

### Visibility

Every read enforces `canViewArm(arm, userId, isAdmin)`: admins see all;
`project_public` arms are visible to any project member; `owner_private`
(default) arms are visible only to their owner and admins.

### Pricing (credits)

| Arm action                       | Credits | Notes                              |
|----------------------------------|---------|------------------------------------|
| Chat reply (Groq tier-1)         | 1       | `callGroqArm`, free pool           |
| Deep-work reply (Claude)         | 5       | `callProvider('anthropic', …)`     |
| Voice transcription              | 3 / min | min 1 minute billed                |
| Target instruction draft         | 3       | creates the gate row               |
| Document AI-assist               | 2       | Groq revision of the living doc    |

### Frontend

- **Arms tab** inside project detail (`project-arms.tsx`) — lists visible arms,
  create form with manager picker.
- **Arm detail** (`arm-detail.tsx`) — three sub-tabs: **Chat** (text + voice,
  deep-work toggle), **Living Document** (edit, AI-assist, version history with
  restore), **Targets** (add target, generate instruction sheet, approve/reject
  through the gate).
- **Arms manager dashboard** (`admin-arms-dashboard.tsx`, admin-only) — stat
  cards (total / active / unassigned / pending), by-manager breakdown, recent
  activity, and the full cross-project arms table with spend.
- All strings are i18n'd in Hebrew + English; pages are `dir`/RTL aware.

### Anti-fragility properties Part X preserves

- Arm AI routing rides the Part VI ladder — Groq goes paid? swap the tier-1
  provider, one place (`callGroqArm` → `callProvider`).
- Outbound is gated, not autonomous — no instruction sheet leaves without a human
  owner/admin approval through the same `pending_actions` rail as Part VIII/IX.
- Every credit-spending arm action writes `p10_arm_activity_log` + `credit_ledger`
  — the dashboard and billing both read from durable truth.

See `aiproxy/PART_X_TRACE.md` for end-to-end flow traces.

---

*Canonical at `aiproxy/ARCHITECTURE_LAYERS.md`. Versioned with the codebase
so every future session starts from the same stack.*
