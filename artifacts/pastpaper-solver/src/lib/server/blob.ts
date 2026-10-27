import { get } from "@vercel/blob";
import type { AiAttachment } from "./ai-provider";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export async function readPrivateBlob(pathname: string): Promise<AiAttachment> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) {
    throw new Error("Uploaded source file could not be found.");
  }
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Source file exceeds the 8 MB processing limit.");
  }
  const contentType = result.blob.contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_FILE_TYPES.includes(contentType)) {
    throw new Error("Source files must be a PDF, JPEG, PNG, or WebP image.");
  }
  const validSignature =
    (contentType === "application/pdf" && buffer.subarray(0, 4).toString() === "%PDF") ||
    (contentType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (contentType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === "image/webp" &&
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP");
  if (!validSignature) {
    throw new Error("Source file contents do not match the uploaded file type.");
  }
  return {
    name: pathname.split("/").pop() || "source-file",
    contentType,
    data: buffer,
  };
}

export function isAllowedBlobPath(pathname: string, paperId: string, kind: "qp" | "ms"): boolean {
  const expected = `pastpaper-solver/${paperId}/${kind}/`;
  return pathname.startsWith(expected) && !pathname.includes("..");
}
