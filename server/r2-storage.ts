// =====================================================
// R2 Storage Helper — Part IX
// Cloudflare R2 (S3-compatible) audio/media storage with filesystem fallback for dev.
// =====================================================

import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET || "tendit-media";
const PUBLIC_URL_PREFIX = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const r2Configured = !!(ACCOUNT_ID && ACCESS_KEY && SECRET_KEY);

let warnedOnce = false;
function warnUnconfiguredOnce() {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn("[r2-storage] R2 env vars not set — falling back to local filesystem (./uploads). Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL for production.");
}

let r2: S3Client | null = null;
if (r2Configured) {
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
  });
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Upload an audio buffer to R2 (or local FS fallback). Returns the URL and key.
 */
export async function uploadAudio(buffer: Buffer, key: string, mimeType: string): Promise<UploadResult> {
  if (r2 && r2Configured) {
    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));
    const url = PUBLIC_URL_PREFIX
      ? `${PUBLIC_URL_PREFIX}/${key}`
      : `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
    return { url, key };
  }
  warnUnconfiguredOnce();
  // Filesystem fallback: write to ./uploads, return /api/uploads/<filename>
  const safeName = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const subdir = path.dirname(safeName);
  if (subdir && subdir !== ".") fs.mkdirSync(path.join(UPLOADS_DIR, subdir), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
  return { url: `/api/uploads/${safeName}`, key: safeName };
}

export async function deleteObject(key: string): Promise<void> {
  if (r2 && r2Configured) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (e: any) {
      console.error("[r2-storage] delete error:", e?.message);
    }
    return;
  }
  // FS fallback
  const fp = path.join(UPLOADS_DIR, key);
  if (fs.existsSync(fp)) {
    try { fs.unlinkSync(fp); } catch { /* ignore */ }
  }
}

export function isR2Configured(): boolean {
  return r2Configured;
}
