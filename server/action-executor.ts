// ============================================================================
// Action Executor — runs approved actions against project connections
// ============================================================================
// Supports executor types:
//   - http_webhook: generic POST/GET/PUT/DELETE to configured URL with templating
//   - wordpress: WordPress REST API helper (uses WP application password)
//   - whatsapp: WhatsApp Cloud API helper
//   - email: Resend / SendGrid / SMTP helper
//
// The MVP focuses on http_webhook which covers ~80% of integrations.

import { sqlite } from "./storage";

export interface ConnectionConfig {
  // generic http_webhook
  baseUrl?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;                              // appended to baseUrl, supports {{var}} templating
  headers?: Record<string, string>;
  authType?: "none" | "bearer" | "basic" | "header" | "query";
  authToken?: string;                         // for bearer / header
  authHeaderName?: string;                    // for "header" authType
  authUsername?: string;                      // for basic auth
  authPassword?: string;                      // for basic auth (also used as WP app password)
  bodyTemplate?: string;                      // JSON string with {{var}} placeholders
  queryTemplate?: Record<string, string>;     // query params with {{var}} support
  // wordpress-specific
  wpUrl?: string;                             // e.g. https://shirhadash.co.il
  // whatsapp-specific
  phoneNumberId?: string;                     // WhatsApp Business phone_number_id
  // shared
  notes?: string;
}

export interface ExecuteResult {
  success: boolean;
  statusCode?: number;
  request: { url: string; method: string; headers: Record<string, string>; body?: any };
  response?: any;
  errorMessage?: string;
  durationMs: number;
}

// Simple {{var}} template renderer — supports nested via dot path (e.g. {{user.name}})
function render(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const parts = path.split(".");
    let cur: any = vars;
    for (const p of parts) {
      if (cur == null) return "";
      cur = cur[p];
    }
    return cur == null ? "" : String(cur);
  });
}

function renderObject(obj: Record<string, string>, vars: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = render(v, vars);
  return out;
}

/**
 * Execute an action against a project connection.
 * Both the connection config and the input from the proposal are passed in.
 * Returns the request sent + response received for audit logging.
 */
export async function executeAction(params: {
  actionSlug: string;
  executorType: string;
  config: ConnectionConfig;
  input: Record<string, any>;
}): Promise<ExecuteResult> {
  const { executorType, config, input } = params;
  const start = Date.now();

  try {
    switch (executorType) {
      case "http_webhook":
        return await executeHttpWebhook(config, input, start);
      case "wordpress":
        return await executeWordPress(config, input, start);
      case "whatsapp":
        return await executeWhatsApp(config, input, start);
      case "email":
        return await executeEmail(config, input, start);
      default:
        return {
          success: false,
          request: { url: "", method: "", headers: {} },
          errorMessage: `Unknown executor type: ${executorType}`,
          durationMs: Date.now() - start,
        };
    }
  } catch (e: any) {
    return {
      success: false,
      request: { url: "", method: "", headers: {} },
      errorMessage: e?.message || "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

async function executeHttpWebhook(
  config: ConnectionConfig,
  input: Record<string, any>,
  start: number,
): Promise<ExecuteResult> {
  if (!config.baseUrl) {
    return {
      success: false,
      request: { url: "", method: "", headers: {} },
      errorMessage: "Connection config missing baseUrl",
      durationMs: Date.now() - start,
    };
  }

  const method = config.method || "POST";
  const path = config.path ? render(config.path, input) : "";
  let url = `${config.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : path ? `/${path}` : ""}`;

  // Query params
  if (config.queryTemplate) {
    const rendered = renderObject(config.queryTemplate, input);
    const qs = new URLSearchParams(rendered).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  // Auth via query param
  if (config.authType === "query" && config.authToken) {
    const tokenName = config.authHeaderName || "api_key";
    url += (url.includes("?") ? "&" : "?") + `${tokenName}=${encodeURIComponent(config.authToken)}`;
  }

  // Headers
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(config.headers || {}) };
  for (const [k, v] of Object.entries(headers)) headers[k] = render(v, input);

  if (config.authType === "bearer" && config.authToken) {
    headers["Authorization"] = `Bearer ${config.authToken}`;
  } else if (config.authType === "basic" && config.authUsername) {
    const b64 = Buffer.from(`${config.authUsername}:${config.authPassword || ""}`).toString("base64");
    headers["Authorization"] = `Basic ${b64}`;
  } else if (config.authType === "header" && config.authToken) {
    headers[config.authHeaderName || "X-API-Key"] = config.authToken;
  }

  // Body — either template or raw input as JSON
  let body: any = null;
  if (method !== "GET" && method !== "DELETE") {
    if (config.bodyTemplate) {
      const rendered = render(config.bodyTemplate, input);
      try { body = JSON.parse(rendered); } catch { body = rendered; }
    } else {
      body = input;
    }
  }

  const req = { url, method, headers, body };

  // For dev/test connections (URL starts with mock:// or no baseUrl): return simulated success
  if (url.startsWith("mock://") || url.includes("example.com/mock")) {
    return {
      success: true,
      statusCode: 200,
      request: req,
      response: { mocked: true, message: "Mock execution succeeded (no real HTTP call)", echo: input },
      durationMs: Date.now() - start,
    };
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let respBody: any;
  const text = await resp.text();
  try { respBody = JSON.parse(text); } catch { respBody = text.slice(0, 4000); }

  return {
    success: resp.ok,
    statusCode: resp.status,
    request: req,
    response: respBody,
    errorMessage: resp.ok ? undefined : `HTTP ${resp.status}: ${typeof respBody === "string" ? respBody : JSON.stringify(respBody).slice(0, 500)}`,
    durationMs: Date.now() - start,
  };
}

async function executeWordPress(
  config: ConnectionConfig,
  input: Record<string, any>,
  start: number,
): Promise<ExecuteResult> {
  // WordPress REST API: POST /wp-json/wp/v2/posts
  if (!config.wpUrl) {
    return {
      success: false, request: { url: "", method: "", headers: {} },
      errorMessage: "WordPress connection missing wpUrl", durationMs: Date.now() - start,
    };
  }
  const url = `${config.wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const b64 = Buffer.from(`${config.authUsername || ""}:${config.authPassword || ""}`).toString("base64");
  const headers = { "Content-Type": "application/json", "Authorization": `Basic ${b64}` };
  const body = {
    title: input.title,
    content: input.body,
    excerpt: input.excerpt,
    status: input.status || "draft",
    categories: input.category ? [input.category] : undefined,
    featured_media: undefined,
  };
  const req = { url, method: "POST", headers, body };

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await resp.text();
  let respBody: any;
  try { respBody = JSON.parse(text); } catch { respBody = text.slice(0, 4000); }
  return {
    success: resp.ok, statusCode: resp.status, request: req, response: respBody,
    errorMessage: resp.ok ? undefined : `WP ${resp.status}: ${typeof respBody === "string" ? respBody : JSON.stringify(respBody).slice(0, 500)}`,
    durationMs: Date.now() - start,
  };
}

async function executeWhatsApp(
  config: ConnectionConfig,
  input: Record<string, any>,
  start: number,
): Promise<ExecuteResult> {
  if (!config.phoneNumberId || !config.authToken) {
    return {
      success: false, request: { url: "", method: "", headers: {} },
      errorMessage: "WhatsApp connection missing phoneNumberId or authToken", durationMs: Date.now() - start,
    };
  }
  const url = `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`;
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.authToken}` };
  const body: any = {
    messaging_product: "whatsapp",
    to: input.to,
    type: "text",
    text: { body: input.message },
  };
  const req = { url, method: "POST", headers, body };
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await resp.text();
  let respBody: any;
  try { respBody = JSON.parse(text); } catch { respBody = text.slice(0, 4000); }
  return {
    success: resp.ok, statusCode: resp.status, request: req, response: respBody,
    errorMessage: resp.ok ? undefined : `WhatsApp ${resp.status}: ${typeof respBody === "string" ? respBody : JSON.stringify(respBody).slice(0, 500)}`,
    durationMs: Date.now() - start,
  };
}

async function executeEmail(
  config: ConnectionConfig,
  input: Record<string, any>,
  start: number,
): Promise<ExecuteResult> {
  // Use Resend API (simplest) if authToken present; otherwise fallback to http_webhook style.
  if (!config.authToken) {
    return {
      success: false, request: { url: "", method: "", headers: {} },
      errorMessage: "Email connection missing authToken (Resend/SendGrid API key)", durationMs: Date.now() - start,
    };
  }
  const url = "https://api.resend.com/emails";
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${config.authToken}` };
  const body: any = {
    from: config.notes || "Tendit <noreply@tendit.io>",
    to: input.to,
    subject: input.subject,
    html: input.body,
    reply_to: input.replyTo,
  };
  const req = { url, method: "POST", headers, body };
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await resp.text();
  let respBody: any;
  try { respBody = JSON.parse(text); } catch { respBody = text.slice(0, 4000); }
  return {
    success: resp.ok, statusCode: resp.status, request: req, response: respBody,
    errorMessage: resp.ok ? undefined : `Resend ${resp.status}: ${typeof respBody === "string" ? respBody : JSON.stringify(respBody).slice(0, 500)}`,
    durationMs: Date.now() - start,
  };
}

/**
 * Record an execution in the audit log + update the proposal.
 */
export function logExecution(proposalId: number, actionSlug: string, connectionId: number, result: ExecuteResult): number {
  const insert = sqlite.prepare(
    `INSERT INTO action_executions (proposal_id, action_slug, connection_id, request, response, status_code, success, error_message, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const r = insert.run(
    proposalId,
    actionSlug,
    connectionId,
    JSON.stringify({ ...result.request, headers: maskHeaders(result.request.headers) }),
    JSON.stringify(result.response ?? null).slice(0, 8000),
    result.statusCode ?? null,
    result.success ? 1 : 0,
    result.errorMessage ?? null,
    result.durationMs,
  );
  const execId = Number(r.lastInsertRowid);

  // Update the proposal status
  sqlite.prepare(
    `UPDATE action_proposals SET status = ?, execution_id = ? WHERE id = ?`
  ).run(result.success ? "executed" : "failed", execId, proposalId);

  return execId;
}

// Don't store raw auth headers in the audit log
function maskHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (/auth|api[-_]?key|token/i.test(k)) {
      out[k] = v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-2)}` : "***";
    } else {
      out[k] = v;
    }
  }
  return out;
}
