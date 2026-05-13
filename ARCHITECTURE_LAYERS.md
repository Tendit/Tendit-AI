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

*Canonical at `aiproxy/ARCHITECTURE_LAYERS.md`. Versioned with the codebase
so every future session starts from the same stack.*
