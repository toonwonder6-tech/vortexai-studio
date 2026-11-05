import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { zaiASR, logUsage } from "@/lib/ai-services";
import { checkDailyLimit, checkMaintenance } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    if (await checkMaintenance()) return fail("Platform is in maintenance mode.", 503);

    const body = await req.json();
    const { fileBase64, model } = body;
    if (!fileBase64) return fail("Audio file (base64) is required.", 400);

    const limit = await checkDailyLimit(user.id, "audio");
    if (!limit.ok) return fail(limit.reason!, 429);

    const started = Date.now();
    const transcript = await zaiASR(fileBase64, model);
    const durationMs = Date.now() - started;
    await logUsage(user.id, "audio", "success", { durationMs, type: "asr" });
    return ok({ transcript, durationMs });
  } catch (err) {
    return handleError(err);
  }
}
