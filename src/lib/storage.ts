/**
 * Local media storage. Generated/uploaded files are persisted under the project
 * `storage/` directory and served through /api/media/[...path].
 */
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

export const STORAGE_DIR = path.join(process.cwd(), "storage");

export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export function mediaUrl(filename: string): string {
  return `/api/media/${filename}`;
}

export async function saveBuffer(
  buffer: Buffer,
  ext: string,
  prefix = "asset"
): Promise<{ filename: string; url: string; path: string; size: number }> {
  await ensureStorageDir();
  const filename = `${prefix}_${Date.now()}_${randomBytes(6).toString("hex")}${ext}`;
  const filePath = path.join(STORAGE_DIR, filename);
  await fs.writeFile(filePath, buffer);
  return { filename, url: mediaUrl(filename), path: filePath, size: buffer.length };
}

export async function saveBase64(
  base64: string,
  ext: string,
  prefix = "img"
): Promise<{ filename: string; url: string; path: string; size: number }> {
  const buffer = Buffer.from(base64, "base64");
  return saveBuffer(buffer, ext, prefix);
}

/** Download a remote URL to local storage and return the local media descriptor. */
export async function downloadToStorage(
  remoteUrl: string,
  ext: string,
  prefix = "dl"
): Promise<{ filename: string; url: string; path: string; size: number }> {
  const res = await fetch(remoteUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  return saveBuffer(buffer, ext, prefix);
}

export async function readMedia(filename: string): Promise<{ buffer: Buffer; ext: string }> {
  const filePath = path.join(STORAGE_DIR, filename);
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filename);
  return { buffer, ext };
}

export async function deleteMedia(filename: string): Promise<void> {
  const filePath = path.join(STORAGE_DIR, filename);
  await fs.unlink(filePath).catch(() => {});
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
  };
  return map[mime] || ".bin";
}

export function mimeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
  };
  return map[ext] || "application/octet-stream";
}
