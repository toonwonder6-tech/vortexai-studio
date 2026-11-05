/**
 * Centralized Z.ai service modules. Every AI request the frontend makes is
 * proxied through these helpers so the owner's API key never leaves the server.
 */
import { getZAI, ZAI_DEFAULTS } from "@/lib/zai";
import { db } from "@/lib/db";
import { saveBase64, downloadToStorage } from "@/lib/storage";

/* ------------------------------- Text service ------------------------------ */

export interface TextOptions {
  system?: string;
  model?: string;
  thinking?: boolean;
  json?: boolean;
}

export async function zaiText(prompt: string, opts: TextOptions = {}) {
  const zai = await getZAI();
  const model = opts.model || ZAI_DEFAULTS.textModel;
  const messages: any[] = [];
  if (opts.system) messages.push({ role: "assistant", content: opts.system });
  if (opts.json) {
    messages.push({
      role: "assistant",
      content:
        (opts.system ? "" : "You are a helpful assistant. ") +
        "Respond with valid JSON only, no markdown fences, no commentary.",
    });
  }
  messages.push({ role: "user", content: prompt });

  const completion = await zai.chat.completions.create({
    model,
    messages,
    thinking: { type: opts.thinking ? "enabled" : "disabled" },
  } as any);

  const content = completion?.choices?.[0]?.message?.content ?? "";
  return content;
}

/** Best-effort JSON extraction from an LLM response. */
export function extractJson<T = any>(text: string): T | null {
  if (!text) return null;
  // Strip markdown fences
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Find first { or [ and last } or ]
  const first = t.search(/[{[]/);
  if (first === -1) return null;
  const lastBrace = t.lastIndexOf("}");
  const lastBracket = t.lastIndexOf("]");
  const last = Math.max(lastBrace, lastBracket);
  if (last === -1) return null;
  const slice = t.slice(first, last + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

/* ------------------------------ Image service ------------------------------ */

export const IMAGE_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export async function zaiGenerateImage(
  prompt: string,
  size: ImageSize = "1024x1024",
  model?: string
): Promise<{ base64: string; localUrl: string; size: number }> {
  const zai = await getZAI();
  const res = await zai.images.generations.create({
    prompt,
    size,
    model,
  } as any);
  const base64 = res.data?.[0]?.base64;
  if (!base64) throw new Error("Image generation returned no data");
  const saved = await saveBase64(base64, ".png", "img");
  return { base64, localUrl: saved.url, size: saved.size };
}

export async function zaiEditImage(
  prompt: string,
  imageBase64: string,
  size: ImageSize = "1024x1024",
  model?: string
) {
  const zai = await getZAI();
  const res = await zai.images.generations.edit({
    prompt,
    image: imageBase64,
    size,
    model,
  } as any);
  const base64 = res.data?.[0]?.base64;
  if (!base64) throw new Error("Image edit returned no data");
  const saved = await saveBase64(base64, ".png", "imgedit");
  return { base64, localUrl: saved.url, size: saved.size };
}

/* ------------------------------ Video service ------------------------------ */

export interface VideoGenInput {
  prompt?: string;
  image_url?: string | string[];
  quality?: "speed" | "quality";
  with_audio?: boolean;
  watermark_enabled?: boolean;
  size?: string;
  fps?: number;
  duration?: number;
  model?: string;
  request_id?: string;
  user_id?: string;
}

/** Submit a video generation task to Z.ai. Returns the provider task id.
 *  Retries once on 429 (rate limit) with backoff. Throws a tagged error
 *  on rate-limit/invalid-request so the route can map it to a clean HTTP response.
 *
 *  IMPORTANT: Z.ai's servers fetch image_url themselves, so localhost URLs are
 *  unreachable. We convert any local /api/media/... URL to a base64 data URI
 *  before sending. Images are resized to max 1024px and re-encoded as JPEG to
 *  keep the base64 payload small (large payloads cause Z.ai error 1214).
 */
export async function zaiSubmitVideo(input: VideoGenInput): Promise<string> {
  const zai = await getZAI();

  // Normalize image_url: convert local URLs to resized base64 data URIs.
  let imageUrl = input.image_url;
  if (imageUrl) {
    const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
    const converted: string[] = [];
    for (const u of urls) {
      if (u.startsWith("/api/media/") || u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1")) {
        try {
          const fullUrl = u.startsWith("http") ? u : `http://localhost:3000${u}`;
          const res = await fetch(fullUrl);
          if (res.ok) {
            const raw = Buffer.from(await res.arrayBuffer());
            // Resize to max 1024px and convert to JPEG to minimize payload size.
            // Large base64 payloads (>500KB) cause Z.ai error 1214.
            const sharp = (await import("sharp")).default;
            const resized = await sharp(raw)
              .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();
            const b64 = resized.toString("base64");
            converted.push(`data:image/jpeg;base64,${b64}`);
          } else {
            converted.push(u);
          }
        } catch {
          converted.push(u);
        }
      } else {
        converted.push(u);
      }
    }
    imageUrl = Array.isArray(imageUrl) ? converted : converted[0];
  }

  const body: any = {
    model: input.model || ZAI_DEFAULTS.videoModel,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(typeof input.with_audio === "boolean" && input.with_audio ? { with_audio: true } : {}),
    ...(typeof input.watermark_enabled === "boolean" && input.watermark_enabled ? { watermark_enabled: true } : {}),
    ...(input.request_id ? { request_id: input.request_id } : {}),
    ...(input.user_id ? { user_id: input.user_id } : {}),
  };
  // Advanced params (size/duration/fps/quality) only when explicitly requested
  // — some models reject them with code 1214.
  if (input.quality) body.quality = input.quality;
  if (input.size) body.size = input.size;
  if (input.fps) body.fps = input.fps;
  if (input.duration) body.duration = input.duration;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await zai.video.generations.create(body);
      if (!res?.id) throw new Error("Video API did not return a task id");
      return res.id as string;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || "");
      if (msg.includes("429") && attempt === 0) {
        // Quick retry — the background loop in the route handles long waits
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      if (msg.includes("429")) {
        throw new Error("RATE_LIMIT:Z.ai video rate limit. The background submission will retry automatically.");
      }
      if (msg.includes("status 400")) {
        const codeMatch = msg.match(/code["']?\s*:\s*["']?(\d+)/);
        const code = codeMatch ? codeMatch[1] : "unknown";
        throw new Error(`Z.ai rejected the video request (code ${code}). The system will automatically retry with simpler parameters. If it still fails, try a shorter prompt or disable style/realism options.`);
      }
      throw err;
    }
  }
  throw lastErr;
}

export interface VideoPollResult {
  status: "processing" | "completed" | "failed" | "expired";
  videoUrl?: string;
  raw?: any;
  error?: string;
}

/** Poll a Z.ai video task. Downloads the result locally when complete. */
export async function zaiPollVideo(taskId: string): Promise<VideoPollResult> {
  const zai = await getZAI();
  const res = await zai.async.result.query(taskId);
  const status = (res?.task_status || "PROCESSING").toUpperCase();
  if (status === "SUCCESS") {
    let url: string | undefined =
      res?.video_result?.[0]?.url || res?.video_url || res?.url || res?.video;
    if (!url) return { status: "failed", error: "No video URL in result" };
    // Download to local storage for reliable playback & download
    try {
      const saved = await downloadToStorage(url, ".mp4", "video");
      return { status: "completed", videoUrl: saved.url, raw: res };
    } catch {
      // Fall back to the remote URL if download fails
      return { status: "completed", videoUrl: url, raw: res };
    }
  }
  if (status === "FAIL") return { status: "failed", error: "Generation failed", raw: res };
  return { status: "processing", raw: res };
}

/* ------------------------------ Audio service ------------------------------ */

export const TTS_VOICES = [
  { id: "tongtong", label: "Tongtong — Warm & friendly" },
  { id: "chuichui", label: "Chuichui — Lively & cute" },
  { id: "xiaochen", label: "Xiaochen — Steady & professional" },
  { id: "jam", label: "Jam — British gentleman" },
  { id: "kazi", label: "Kazi — Clear & standard" },
  { id: "douji", label: "Douji — Natural & fluent" },
  { id: "luodo", label: "Luodo — Expressive" },
];

export async function zaiTTS(
  text: string,
  opts: { voice?: string; speed?: number; format?: string } = {}
): Promise<{ localUrl: string; size: number }> {
  const zai = await getZAI();
  // Z.ai TTS supports "wav" and "pcm" but NOT "mp3" (error 1214).
  // Default to wav for broad browser compatibility.
  const format = opts.format === "pcm" ? "pcm" : "wav";
  const response = await zai.audio.tts.create({
    input: text,
    voice: opts.voice || "tongtong",
    speed: opts.speed ?? 1.0,
    response_format: format,
    stream: false,
  } as any);
  const arrayBuffer = await (response as any).arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  const { saveBuffer } = await import("@/lib/storage");
  const ext = format === "pcm" ? ".pcm" : ".wav";
  const saved = await saveBuffer(buffer, ext, "tts");
  return { localUrl: saved.url, size: saved.size };
}

export async function zaiASR(fileBase64: string, model?: string): Promise<string> {
  const zai = await getZAI();
  const res = await zai.audio.asr.create({
    file_base64: fileBase64,
    model,
  } as any);
  // The ASR response shape varies; try common fields.
  if (typeof res === "string") return res;
  return res?.text || res?.transcript || JSON.stringify(res);
}

/* ------------------------------- Usage logging ----------------------------- */

export async function logUsage(
  userId: string,
  type: string,
  status: "success" | "failed",
  meta: { model?: string; durationMs?: number; [k: string]: any } = {}
) {
  try {
    await db.usageLog.create({
      data: {
        userId,
        type,
        status,
        model: meta.model || null,
        duration: meta.durationMs || 0,
        meta: JSON.stringify(meta),
      },
    });
  } catch (e) {
    // never throw on logging
  }
}

export async function logActivity(userId: string, action: string, meta: any = {}) {
  try {
    await db.activityLog.create({
      data: { userId, action, meta: JSON.stringify(meta) },
    });
  } catch {}
}
