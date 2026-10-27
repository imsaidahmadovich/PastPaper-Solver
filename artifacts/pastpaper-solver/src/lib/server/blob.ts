// File storage backed by Supabase Storage (private bucket). File name kept as blob.ts
// so existing imports keep working. Uses plain fetch: no extra dependencies.
import type { AiAttachment } from "./ai-provider";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function cfg() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "papers";
  if (!url || !key) {
    throw new Error("File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { base: `${url}/storage/v1`, key, bucket };
}

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Returns a one-time URL the browser can PUT the file to. */
export async function createSignedUpload(pathname: string): Promise<string> {
  const { base, key, bucket } = cfg();
  const res = await fetch(`${base}/object/upload/sign/${bucket}/${enc(pathname)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: "{}",
  });
  const data = (await res.json().catch(() => null)) as { url?: string; message?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(
      data?.message || data?.error || `Storage refused the upload (${res.status}). Check that the "${bucket}" bucket exists.`,
    );
  }
  return `${base}${data.url}`;
}

export async function getObject(pathname: string): Promise<Response> {
  const { base, key, bucket } = cfg();
  const res = await fetch(`${base}/object/${bucket}/${enc(pathname)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Uploaded source file could not be found.");
  return res;
}

export async function deleteObjects(paths: string[]): Promise<void> {
  const { base, key, bucket } = cfg();
  const res = await fetch(`${base}/object/${bucket}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error("Storage delete failed.");
}

function sniff(buffer: Buffer): string | null {
  if (buffer.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export async function readPrivateBlob(pathname: string): Promise<AiAttachment> {
  const res = await getObject(pathname);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Source file exceeds the 8 MB processing limit.");
  }
  const contentType = sniff(buffer);
  if (!contentType || !ALLOWED_FILE_TYPES.includes(contentType)) {
    throw new Error("Source files must be a PDF, JPEG, PNG, or WebP image.");
  }
  return { name: pathname.split("/").pop() || "source-file", contentType, data: buffer };
}

export function isAllowedBlobPath(pathname: string, paperId: string, kind: "qp" | "ms"): boolean {
  const expected = `pastpaper-solver/${paperId}/${kind}/`;
  return pathname.startsWith(expected) && !pathname.includes("..");
}
