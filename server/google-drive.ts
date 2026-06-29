// ============================================================================
// Google OAuth + Drive API integration
// ============================================================================
import Database from "better-sqlite3";
import { randomBytes } from "crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "https://www.tendit.io/api/google/oauth/callback";

// Scopes: drive.file = only files Tendit creates or the user explicitly opens
// drive.readonly = read everything the user shares with us (needed to list a folder they pick)
// We use drive.readonly + drive.file together so we can both browse user-picked folders AND create files.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

// In-memory state store for CSRF protection during OAuth handshake (state -> {userId, ts})
const oauthStateStore = new Map<string, { userId: number; ts: number }>();

// Cleanup old states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, info] of oauthStateStore.entries()) {
    if (now - info.ts > 10 * 60 * 1000) oauthStateStore.delete(state);
  }
}, 10 * 60 * 1000).unref?.();

export function createOAuthState(userId: number): string {
  const state = randomBytes(24).toString("hex");
  oauthStateStore.set(state, { userId, ts: Date.now() });
  return state;
}

export function consumeOAuthState(state: string): number | null {
  const info = oauthStateStore.get(state);
  if (!info) return null;
  oauthStateStore.delete(state);
  if (Date.now() - info.ts > 10 * 60 * 1000) return null;
  return info.userId;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent", // force refresh_token issuance
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email || null;
  } catch {
    return null;
  }
}

// ─── Token storage (sqlite) ─────────────────────────────────────────────────
export function saveUserToken(
  sqlite: Database.Database,
  userId: number,
  token: GoogleTokenResponse,
  email: string | null
): void {
  const expiresAt = Date.now() + token.expires_in * 1000;
  const existing = sqlite
    .prepare("SELECT id, refresh_token FROM user_google_tokens WHERE user_id = ?")
    .get(userId) as { id: number; refresh_token: string | null } | undefined;

  const refresh = token.refresh_token || existing?.refresh_token || null;

  if (existing) {
    sqlite
      .prepare(
        `UPDATE user_google_tokens SET access_token=?, refresh_token=?, expires_at=?, scope=?, email=COALESCE(?, email), updated_at=datetime('now') WHERE user_id=?`
      )
      .run(token.access_token, refresh, expiresAt, token.scope, email, userId);
  } else {
    sqlite
      .prepare(
        `INSERT INTO user_google_tokens (user_id, email, access_token, refresh_token, expires_at, scope) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, email, token.access_token, refresh, expiresAt, token.scope);
  }
}

export async function getValidAccessToken(
  sqlite: Database.Database,
  userId: number
): Promise<string | null> {
  const row = sqlite
    .prepare(
      "SELECT access_token, refresh_token, expires_at FROM user_google_tokens WHERE user_id = ?"
    )
    .get(userId) as
    | { access_token: string; refresh_token: string | null; expires_at: number }
    | undefined;
  if (!row) return null;

  // If token is still valid for >60s, return it
  if (row.expires_at > Date.now() + 60_000) return row.access_token;

  // Else refresh
  if (!row.refresh_token) return null;
  try {
    const fresh = await refreshAccessToken(row.refresh_token);
    const expiresAt = Date.now() + fresh.expires_in * 1000;
    sqlite
      .prepare(
        `UPDATE user_google_tokens SET access_token=?, expires_at=?, scope=COALESCE(?,scope), updated_at=datetime('now') WHERE user_id=?`
      )
      .run(fresh.access_token, expiresAt, fresh.scope, userId);
    return fresh.access_token;
  } catch (e) {
    console.error("[google] token refresh failed for user", userId, e);
    return null;
  }
}

export function deleteUserToken(sqlite: Database.Database, userId: number): void {
  sqlite.prepare("DELETE FROM user_google_tokens WHERE user_id = ?").run(userId);
}

// ─── Drive API helpers ──────────────────────────────────────────────────────

// Parse a Drive folder URL or raw ID to a folder ID.
// Accepts: full URLs (https://drive.google.com/drive/folders/<ID>) or just <ID>.
export function parseDriveFolderId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // URL form
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // Raw ID (Google IDs are typically 25+ chars of [A-Za-z0-9_-])
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function getFolderMetadata(
  accessToken: string,
  folderId: string
): Promise<{ id: string; name: string; webViewLink?: string; mimeType: string } | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,webViewLink,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return res.json() as Promise<any>;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  size?: string;
}

export async function listFolderFiles(
  accessToken: string,
  folderId: string,
  opts: { mimeType?: string; query?: string; pageSize?: number } = {}
): Promise<DriveFile[]> {
  const q: string[] = [`'${folderId}' in parents`, "trashed = false"];
  if (opts.mimeType) q.push(`mimeType = '${opts.mimeType.replace(/'/g, "\\'")}'`);
  if (opts.query) q.push(`name contains '${opts.query.replace(/'/g, "\\'")}'`);
  const params = new URLSearchParams({
    q: q.join(" and "),
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size)",
    pageSize: String(Math.min(opts.pageSize || 50, 200)),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive list failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files || [];
}

export async function readDocAsText(accessToken: string, fileId: string): Promise<string> {
  // First get metadata to determine mimeType
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) throw new Error(`drive get failed: ${metaRes.status}`);
  const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string };

  // Google Doc → export as text/plain
  if (meta.mimeType === "application/vnd.google-apps.document") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`drive export failed: ${res.status}`);
    return res.text();
  }

  // Google Sheets → export as CSV
  if (meta.mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`drive export failed: ${res.status}`);
    return res.text();
  }

  // Plain text / markdown / etc → download raw
  if (meta.mimeType.startsWith("text/") || meta.mimeType === "application/json") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`drive download failed: ${res.status}`);
    return res.text();
  }

  throw new Error(`Unsupported mimeType for text read: ${meta.mimeType}`);
}

export async function createGoogleDoc(
  accessToken: string,
  folderId: string,
  title: string,
  body: string
): Promise<{ id: string; webViewLink?: string }> {
  // multipart upload: metadata + content as text/plain → Drive converts to Google Doc
  const boundary = "----tendit-" + Math.random().toString(36).slice(2);
  const metadata = {
    name: title,
    parents: [folderId],
    mimeType: "application/vnd.google-apps.document",
  };
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    body +
    `\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive create doc failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ id: string; webViewLink?: string }>;
}

export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  opts: { name: string; mimeType?: string; sourceUrl?: string; contentBase64?: string }
): Promise<{ id: string; webViewLink?: string }> {
  let buffer: Buffer;
  let mimeType = opts.mimeType || "application/octet-stream";

  if (opts.sourceUrl) {
    const r = await fetch(opts.sourceUrl);
    if (!r.ok) throw new Error(`source url fetch failed: ${r.status}`);
    const arrayBuf = await r.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
    const ct = r.headers.get("content-type");
    if (ct && !opts.mimeType) mimeType = ct.split(";")[0].trim();
  } else if (opts.contentBase64) {
    buffer = Buffer.from(opts.contentBase64, "base64");
  } else {
    throw new Error("upload requires sourceUrl or contentBase64");
  }

  const boundary = "----tendit-" + Math.random().toString(36).slice(2);
  const metadata = { name: opts.name, parents: [folderId] };
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const multipartBody = Buffer.concat([
    Buffer.from(head, "utf8"),
    Buffer.from(buffer.toString("base64"), "utf8"),
    Buffer.from(tail, "utf8"),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`drive upload failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ id: string; webViewLink?: string }>;
}
