import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { zaiTTS, TTS_VOICES, logUsage } from "@/lib/ai-services";
import { checkDailyLimit, checkMaintenance } from "@/lib/limits";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    if (await checkMaintenance()) return fail("Platform is in maintenance mode.", 503);

    const body = await req.json();
    const { text, voice, speed, format, projectId, name } = body;
    if (!text || !text.trim()) return fail("Text is required.", 400);
    if (text.length > 1024) return fail("Text exceeds the 1024-character limit. Please shorten it.", 400);

    const limit = await checkDailyLimit(user.id, "audio");
    if (!limit.ok) return fail(limit.reason!, 429);

    const started = Date.now();
    const result = await zaiTTS(text, { voice, speed, format });
    const durationMs = Date.now() - started;

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        projectId: projectId || null,
        type: "audio",
        name: name || text.slice(0, 50),
        filename: result.localUrl.split("/").pop()!,
        mimeType: "audio/wav",
        size: result.size,
        url: result.localUrl,
        source: "generated",
        meta: JSON.stringify({ text, voice: voice || "tongtong", speed: speed ?? 1 }),
      },
    });

    await logUsage(user.id, "audio", "success", { durationMs, assetId: asset.id, voice });
    return ok({ asset, durationMs });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET() {
  return ok({ voices: TTS_VOICES });
}
