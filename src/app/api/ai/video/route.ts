import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { zaiSubmitVideo, zaiPollVideo, logUsage, logActivity } from "@/lib/ai-services";
import { checkDailyLimit, checkConcurrency, checkMaintenance } from "@/lib/limits";
import { db } from "@/lib/db";
import { makeRequestId, getSetting, ZAI_DEFAULTS } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/ai/video — submit a new video generation task.
 *  ASYNC: Creates a job immediately and returns it. The Z.ai submission runs
 *  in a background promise (with 429 retry/backoff) so the HTTP response is
 *  instant — no gateway timeouts.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    if (await checkMaintenance()) return fail("Platform is in maintenance mode.", 503);

    const body = await req.json();
    const {
      prompt,
      negativePrompt,
      imageUrls,
      quality,
      withAudio,
      watermark,
      size,
      fps,
      duration,
      model,
      projectId,
      name,
      advanced,
    } = body;

    const hasPrompt = prompt && prompt.trim().length > 0;
    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
    if (!hasPrompt && !hasImages) return fail("A prompt or at least one reference image is required.", 400);

    const daily = await checkDailyLimit(user.id, "video");
    if (!daily.ok) return fail(daily.reason!, 429);
    const conc = await checkConcurrency(user.id);
    if (!conc.ok) return fail(conc.reason!, 429);

    const videoModel = model || (await getSetting("defaultVideoModel", ZAI_DEFAULTS.videoModel));
    const requestId = makeRequestId("vid");

    // Build the Z.ai request body — MINIMAL by default.
    // Only {model, prompt} or {model, prompt, image_url} is confirmed working
    // on cogvideox. Extra params (request_id, user_id, with_audio) cause 1214.
    const videoInput: any = {
      model: videoModel,
    };
    // Truncate prompt to 500 chars to avoid Z.ai rejection (1214)
    if (hasPrompt) videoInput.prompt = prompt.slice(0, 500);
    if (hasImages) videoInput.image_url = imageUrls;
    // with_audio only if explicitly enabled (some model variants reject it)
    if (withAudio) videoInput.with_audio = true;
    if (watermark) videoInput.watermark_enabled = true;
    if (advanced) {
      if (quality) videoInput.quality = quality;
      if (size) videoInput.size = size;
      if (duration) videoInput.duration = duration;
      if (fps) videoInput.fps = fps;
    }

    // Create a project wrapper if not provided
    let project = projectId ? await db.project.findUnique({ where: { id: projectId } }) : null;
    if (!project) {
      project = await db.project.create({
        data: {
          userId: user.id,
          name: name || (hasPrompt ? prompt.slice(0, 40) : "Image to Video"),
          type: "video",
          status: "active",
          config: JSON.stringify({}),
        },
      });
    }

    // Create the job immediately in "submitting" state and return it.
    // The actual Z.ai call runs in the background.
    const job = await db.generationJob.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: "video",
        status: "waiting",
        prompt: prompt || null,
        negativePrompt: negativePrompt || null,
        model: videoModel,
        config: JSON.stringify({
          imageUrls: imageUrls || [],
          quality, withAudio, watermark, size, fps, duration, requestId,
          videoInput, // store for background submission
        }),
        progress: 0,
      },
    });

    await logActivity(user.id, "video.submit", { jobId: job.id });

    // Background: submit to Z.ai with patient retry on 429 + fallback on 1214.
    // This runs AFTER the HTTP response is sent — no gateway timeout.
    (async () => {
      const started = Date.now();
      try {
        // Build fallback bodies — progressively strip params if Z.ai rejects them.
        // Full body → without with_audio → minimal {model, prompt/image_url} only
        const fallbackBodies: any[] = [videoInput];
        const stripped: any = { model: videoInput.model };
        if (videoInput.prompt) stripped.prompt = videoInput.prompt;
        if (videoInput.image_url) stripped.image_url = videoInput.image_url;
        fallbackBodies.push(stripped);

        let taskId: string | null = null;
        let lastError: any = null;
        let bodyIdx = 0;

        for (let attempt = 0; attempt < 6; attempt++) {
          const currentBody = fallbackBodies[Math.min(bodyIdx, fallbackBodies.length - 1)];
          try {
            taskId = await zaiSubmitVideo(currentBody);
            break;
          } catch (err: any) {
            lastError = err;
            const msg = String(err?.message || "");
            if (msg.includes("RATE_LIMIT") || msg.includes("429")) {
              // Rate limited — wait 60s and retry same body
              await new Promise((r) => setTimeout(r, 60000));
              continue;
            }
            if (msg.includes("1214") || msg.includes("status 400")) {
              // Parameter rejected — try the next fallback body (stripped)
              bodyIdx++;
              if (bodyIdx < fallbackBodies.length) {
                await new Promise((r) => setTimeout(r, 3000));
                continue;
              }
            }
            throw err; // unknown error, stop
          }
        }

        if (!taskId) {
          throw new Error(lastError?.message || "Could not submit to Z.ai after multiple attempts. Please try again in a few minutes.");
        }

        // Update job with the provider task ID
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "submitted", providerTaskId: taskId, progress: 5 },
        });
        await logUsage(user.id, "video", "success", { model: videoModel, durationMs: Date.now() - started, jobId: job.id });
      } catch (err: any) {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: err?.message || "Video submission failed" },
        }).catch(() => {});
        await logUsage(user.id, "video", "failed", { error: String(err) }).catch(() => {});
      }
    })();

    return ok({ job, project });
  } catch (err) {
    try {
      const user = await getCurrentUser();
      if (user) await logUsage(user.id, "video", "failed", { error: String(err) });
    } catch {}
    return handleError(err);
  }
}

/** GET /api/ai/video?id=... — poll a job's status and fetch the result when ready. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");
    if (!jobId) return fail("Job id is required.", 400);

    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== user.id) return fail("Job not found.", 404);
    if (job.role === "admin" && user.role !== "admin") return fail("Job not found.", 404);

    // Terminal states — return immediately.
    if (job.status === "completed" || job.status === "failed" || job.status === "expired") {
      return ok({ job });
    }

    if (!job.providerTaskId) return fail("Job has no provider task id.", 400);

    // Poll defensively: a transient 429 from Z.ai should NOT fail the job —
    // just return the current DB state so the UI keeps polling.
    let poll;
    try {
      poll = await zaiPollVideo(job.providerTaskId);
    } catch (pollErr: any) {
      const msg = String(pollErr?.message || "");
      if (msg.includes("429")) {
        return ok({ job, rateLimited: true });
      }
      throw pollErr;
    }
    let updated = job;

    if (poll.status === "completed") {
      updated = await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          resultUrl: poll.videoUrl,
          resultMeta: poll.raw ? JSON.stringify(poll.raw) : job.resultMeta,
          progress: 100,
        },
      });
      // Persist the result as a video asset (record actual file size)
      const videoFilename = poll.videoUrl!.split("/").pop()!;
      let videoSize = 0;
      try {
        const { stat } = await import("fs/promises");
        const path = await import("path");
        videoSize = (await stat(path.join(process.cwd(), "storage", videoFilename))).size;
      } catch {}
      await db.asset.create({
        data: {
          userId: user.id,
          projectId: job.projectId,
          type: "video",
          name: job.prompt?.slice(0, 60) || "Generated video",
          filename: videoFilename,
          mimeType: "video/mp4",
          size: videoSize,
          url: poll.videoUrl!,
          source: "generated",
          meta: JSON.stringify({ jobId: job.id, model: job.model }),
        },
      });
      if (job.projectId) {
        await db.project.update({
          where: { id: job.projectId },
          data: { coverUrl: poll.videoUrl, updatedAt: new Date() },
        });
      }
    } else if (poll.status === "failed") {
      updated = await db.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", error: poll.error || "Generation failed" },
      });
    } else {
      // still processing — bump progress heuristically
      const next = Math.min(95, (job.progress || 5) + 5);
      updated = await db.generationJob.update({
        where: { id: job.id },
        data: { status: "processing", progress: next },
      });
    }

    return ok({ job: updated });
  } catch (err) {
    return handleError(err);
  }
}
