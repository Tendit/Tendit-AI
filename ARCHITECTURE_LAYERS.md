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

### The 6-step recipe for adding a new API
1. **Pick the layer** — which shelf does this belong on? (Don't reflexively dump it in B4.)
2. **R3 decide** — confirm free tier limits, auth method, rate caps.
3. **B4 dispatcher** — if Johnny needs runtime access, add a tool function (e.g. `holiday_check({date, country})`).
4. **B3 cron** *(optional)* — pre-fetch + cache if it's called often.
5. **B7 governance** — register in plan matrix with per-call rate limit + cost cap.
6. **R2 codify** — add a row to this table on the right shelf. Done.

Each addition = one shelf row, one optional dispatcher, one plan-matrix
entry. Compounding leverage: more shelves stocked → more questions
answerable → fewer LLM calls → lower cost → wider business reach.

---

*Canonical at `aiproxy/ARCHITECTURE_LAYERS.md`. Versioned with the codebase
so every future session starts from the same stack.*
