/**
 * Fair-use limits & helpers. Free platform — but the admin can cap daily
 * generations, concurrency and storage to protect the owner's API balance.
 */
import { db } from "@/lib/db";
import { getSetting } from "@/lib/zai";
import { DEFAULT_SETTINGS } from "@/lib/zai";

export interface Limits {
  maxConcurrentJobs: number;
  dailyVideoLimit: number;
  dailyImageLimit: number;
  dailyTextLimit: number;
  storageLimitMb: number;
}

export async function getLimits(): Promise<Limits> {
  return {
    maxConcurrentJobs: await getSetting("maxConcurrentJobs", DEFAULT_SETTINGS.maxConcurrentJobs),
    dailyVideoLimit: await getSetting("dailyVideoLimit", DEFAULT_SETTINGS.dailyVideoLimit),
    dailyImageLimit: await getSetting("dailyImageLimit", DEFAULT_SETTINGS.dailyImageLimit),
    dailyTextLimit: await getSetting("dailyTextLimit", DEFAULT_SETTINGS.dailyTextLimit),
    storageLimitMb: await getSetting("storageLimitMb", DEFAULT_SETTINGS.storageLimitMb),
  };
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getDailyCounts(userId: string) {
  const since = startOfDay();
  const [video, image, text, audio] = await Promise.all([
    db.usageLog.count({ where: { userId, type: "video", createdAt: { gte: since } } }),
    db.usageLog.count({ where: { userId, type: "image", createdAt: { gte: since } } }),
    db.usageLog.count({ where: { userId, type: "text", createdAt: { gte: since } } }),
    db.usageLog.count({ where: { userId, type: "audio", createdAt: { gte: since } } }),
  ]);
  return { video, image, text, audio };
}

export async function getActiveJobCount(userId: string): Promise<number> {
  return db.generationJob.count({
    where: {
      userId,
      status: { in: ["waiting", "submitted", "processing"] },
    },
  });
}

export interface CheckResult {
  ok: boolean;
  reason?: string;
  remaining?: number;
  limit?: number;
}

export async function checkDailyLimit(
  userId: string,
  type: "video" | "image" | "text" | "audio"
): Promise<CheckResult> {
  const limits = await getLimits();
  const counts = await getDailyCounts(userId);
  const limitMap = {
    video: limits.dailyVideoLimit,
    image: limits.dailyImageLimit,
    text: limits.dailyTextLimit,
    audio: limits.dailyImageLimit, // audio shares image-style quota
  } as const;
  const limit = limitMap[type];
  const used = counts[type];
  if (used >= limit) {
    return { ok: false, reason: `Daily ${type} generation limit reached (${limit}).`, remaining: 0, limit };
  }
  return { ok: true, remaining: limit - used, limit };
}

export async function checkConcurrency(userId: string): Promise<CheckResult> {
  const limits = await getLimits();
  const active = await getActiveJobCount(userId);
  if (active >= limits.maxConcurrentJobs) {
    return { ok: false, reason: `Concurrent job limit reached (${limits.maxConcurrentJobs}).`, limit: limits.maxConcurrentJobs };
  }
  return { ok: true, remaining: limits.maxConcurrentJobs - active, limit: limits.maxConcurrentJobs };
}

export async function checkMaintenance(): Promise<boolean> {
  return getSetting("maintenanceMode", DEFAULT_SETTINGS.maintenanceMode);
}
