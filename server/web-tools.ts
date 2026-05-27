// =====================================================
// Web Tools — Part VII of the architecture.
//
// Public, unauthenticated web access for Johnny's "eyes": search the open web
// and fetch a page as plain text. Provider selection is stubbed (T1 only) for
// Phase A; later phases will add Brave/Tavily/etc. behind pickProvider().
// =====================================================

// --- Provider selection (stub) -------------------------------------------------

export type WebCapability = "search" | "fetch";

export interface ProviderChoice {
  tier: "T1" | "T2" | "T3";
  name: string;
}

/**
 * Pick a provider for a given capability. In Phase A we always return the T1
 * free tier: DuckDuckGo HTML for search, raw fetch+strip for page reads.
 * Later we'll consult provider keys / usage budgets here.
 */
export function pickProvider(capability: WebCapability): ProviderChoice {
  if (capability === "search") return { tier: "T1", name: "duckduckgo_html" };
  return { tier: "T1", name: "raw_fetch" };
}

// --- Search --------------------------------------------------------------------

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html/";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Decode common HTML entities found in DuckDuckGo result text.
 * Intentionally minimal — we don't want a full HTML parser dependency.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Search the open web. Returns up to `limit` results. Best-effort scrape of
 * DuckDuckGo's HTML SERP — if DDG changes its markup we'll get fewer results
 * but never throw.
 */
export async function webSearch(query: string, limit = 8): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const res = await fetch(DDG_HTML_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`web_search: DuckDuckGo returned ${res.status}`);
  }
  const html = await res.text();

  const results: WebSearchResult[] = [];
  // DDG HTML SERP rows look like:
  //   <a rel="nofollow" class="result__a" href="URL">TITLE</a>
  //   ... <a class="result__snippet" ...>SNIPPET</a>
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const linkMatches: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && linkMatches.length < limit) {
    let url = decodeEntities(m[1]);
    // DDG sometimes wraps results in /l/?uddg=... — try to unwrap.
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]); } catch { /* keep original */ }
    }
    linkMatches.push({ url, title: stripTags(decodeEntities(m[2])) });
  }
  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) && snippets.length < linkMatches.length) {
    snippets.push(stripTags(decodeEntities(m[1])));
  }
  for (let i = 0; i < linkMatches.length; i++) {
    results.push({
      title: linkMatches[i].title || linkMatches[i].url,
      url: linkMatches[i].url,
      snippet: snippets[i] || "",
    });
  }
  return results;
}

// --- Fetch page ---------------------------------------------------------------

export interface FetchPageResult {
  url: string;
  title: string;
  text: string;
  status: number;
  truncated: boolean;
}

const MAX_PAGE_CHARS = 20_000;

/**
 * Fetch a URL and return its visible text content. Drops <script>/<style>
 * blocks and strips remaining tags. Truncates to MAX_PAGE_CHARS so we don't
 * blow Johnny's context window.
 */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  // Basic safety: only allow http(s).
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("fetch_page: only http(s) URLs are allowed");
  }
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  const status = res.status;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/") && !contentType.includes("xml") && !contentType.includes("json")) {
    return { url, title: "", text: `[non-text content: ${contentType}]`, status, truncated: false };
  }
  const raw = await res.text();
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(decodeEntities(titleMatch[1])) : "";

  // Strip script + style first (their content is not visible text).
  const cleaned = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  let text = stripTags(decodeEntities(cleaned));
  const truncated = text.length > MAX_PAGE_CHARS;
  if (truncated) text = text.slice(0, MAX_PAGE_CHARS) + "…";

  return { url, title, text, status, truncated };
}

// =====================================================
// Voice transcription (Part IX)
// T1: Groq Whisper Large v3 → T2: OpenAI Whisper-1
// =====================================================

export interface TranscribeResult {
  text: string;
  durationSec: number;
  provider: "groq" | "openai";
}

import { storage as _storage } from "./storage";

async function transcribeViaGroq(buffer: Buffer, mimeType: string): Promise<TranscribeResult> {
  const profile = _storage.pickAuthProfile("groq");
  // Auth profile is a label-only rotation cue; the actual key still comes from env.
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
  form.append("file", blob, "audio.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw Object.assign(new Error(`Groq Whisper ${res.status}: ${txt}`), { status: res.status });
  }
  const data: any = await res.json();
  if (profile) _storage.incrementProfileUsage(profile.id);
  return {
    text: String(data?.text || ""),
    durationSec: Number(data?.duration || 0),
    provider: "groq",
  };
}

async function transcribeViaOpenAI(buffer: Buffer, mimeType: string): Promise<TranscribeResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || "audio/webm" });
  form.append("file", blob, "audio.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw Object.assign(new Error(`OpenAI Whisper ${res.status}: ${txt}`), { status: res.status });
  }
  const data: any = await res.json();
  return {
    text: String(data?.text || ""),
    durationSec: Number(data?.duration || 0),
    provider: "openai",
  };
}

/**
 * Transcribe an audio buffer using a tiered provider ladder.
 * T1 Groq Whisper → T2 OpenAI Whisper. Throws if both fail.
 */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<TranscribeResult> {
  // Try Groq first if key is set
  if (process.env.GROQ_API_KEY) {
    try {
      return await transcribeViaGroq(buffer, mimeType);
    } catch (e: any) {
      const code = e?.status || 0;
      // Fall through to OpenAI on rate limit / server error / missing key
      if (code !== 429 && (code < 500 || code >= 600)) {
        // Other errors — only fall through if we have OpenAI key
        if (!process.env.OPENAI_API_KEY) throw e;
      }
      console.warn("[transcribeAudio] Groq failed, falling back to OpenAI:", e?.message);
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return await transcribeViaOpenAI(buffer, mimeType);
  }
  throw new Error("No transcription provider configured (set GROQ_API_KEY or OPENAI_API_KEY)");
}
