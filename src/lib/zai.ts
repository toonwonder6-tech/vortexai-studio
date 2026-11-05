/**
 * Z.ai configuration and central AI service layer.
 * All AI requests go through the backend using the owner's centrally configured credentials.
 * The frontend never sees the API key.
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { randomBytes } from "crypto";

export const ZAI_DEFAULTS = {
  textModel: process.env.ZAI_DEFAULT_TEXT_MODEL || "glm-4.6",
  imageModel: process.env.ZAI_DEFAULT_IMAGE_MODEL || "image-flash",
  videoModel: process.env.ZAI_DEFAULT_VIDEO_MODEL || "cogvideox-2",
  audioModel: process.env.ZAI_DEFAULT_AUDIO_MODEL || "cogtts",
};

/**
 * A cached, lazily-created ZAI SDK instance. The SDK reads its credentials from
 * the environment (ZAI_API_KEY / ZAI_BASE_URL) via ZAI.create().
 */
let zaiPromise: Promise<ZAI> | null = null;
export async function getZAI(): Promise<ZAI> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create().catch((err) => {
      zaiPromise = null;
      throw err;
    });
  }
  return zaiPromise;
}

/** Generate a unique idempotency-friendly request id for video tasks. */
export function makeRequestId(prefix = "vid"): string {
  return `${prefix}_${randomBytes(8).toString("hex")}_${Date.now()}`;
}

/* ----------------------------- Platform settings ---------------------------- */

const SETTING_CACHE = new Map<string, { value: any; ts: number }>();
const SETTING_TTL = 5_000; // 5s in-memory cache

export async function getSetting<T = any>(key: string, fallback: T): Promise<T> {
  const cached = SETTING_CACHE.get(key);
  if (cached && Date.now() - cached.ts < SETTING_TTL) return cached.value as T;
  try {
    const row = await db.platformSetting.findUnique({ where: { key } });
    const value = row ? (JSON.parse(row.value) as T) : fallback;
    SETTING_CACHE.set(key, { value, ts: Date.now() });
    return value;
  } catch {
    return fallback;
  }
}

export async function setSetting<T = any>(key: string, value: T): Promise<void> {
  const json = JSON.stringify(value);
  await db.platformSetting.upsert({
    where: { key },
    update: { value: json },
    create: { key, value: json },
  });
  SETTING_CACHE.set(key, { value, ts: Date.now() });
}

export async function getAllSettings(): Promise<Record<string, any>> {
  const rows = await db.platformSetting.findMany();
  const obj: Record<string, any> = {};
  for (const r of rows) {
    try {
      obj[r.key] = JSON.parse(r.value);
    } catch {
      obj[r.key] = r.value;
    }
  }
  return obj;
}

/** Default fair-use configuration. Admins can override via the admin panel. */
export const DEFAULT_SETTINGS = {
  maintenanceMode: false,
  allowRegistration: true,
  maxUploadMb: 50,
  storageLimitMb: 1024, // per user
  maxConcurrentJobs: 2,
  dailyVideoLimit: 20,
  dailyImageLimit: 60,
  dailyTextLimit: 200,
  defaultVideoModel: ZAI_DEFAULTS.videoModel,
  defaultImageModel: ZAI_DEFAULTS.imageModel,
  defaultTextModel: ZAI_DEFAULTS.textModel,
  defaultAudioModel: ZAI_DEFAULTS.audioModel,
  announcement: "",
} as const;
