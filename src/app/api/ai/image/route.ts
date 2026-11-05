import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { zaiGenerateImage, zaiEditImage, IMAGE_SIZES, ImageSize, logUsage } from "@/lib/ai-services";
import { checkDailyLimit, checkMaintenance } from "@/lib/limits";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Image generation is ASYNCHRONOUS to avoid gateway timeouts.
 * POST creates a job and returns immediately; the generation runs in a
 * background promise. GET polls the job status.
 *
 * Body: { prompt, size, mode, imageBase64, projectId, name, model }
 * Returns: { job } immediately (status: "processing")
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    if (await checkMaintenance()) return fail("Platform is in maintenance mode.", 503);

    const body = await req.json();
    const { prompt, size, mode, imageBase64, projectId, name, model } = body;
    if (!prompt) return fail("Prompt is required.", 400);
    const sz = (IMAGE_SIZES as readonly string[]).includes(size) ? (size as ImageSize) : "1024x1024";

    const limit = await checkDailyLimit(user.id, "image");
    if (!limit.ok) return fail(limit.reason!, 429);

    // Create a generation job immediately and return it. The actual Z.ai call
    // runs in the background; the frontend polls GET /api/ai/image?id=JOB_ID.
    const job = await db.generationJob.create({
      data: {
        userId: user.id,
        projectId: projectId || null,
        type: "image",
        status: "processing",
        prompt,
        model: model || "image-flash",
        config: JSON.stringify({ size: sz, mode: mode || "generate", hasEditImage: !!imageBase64, name: name || prompt.slice(0, 60) }),
        progress: 5,
      },
    });

    // Fire-and-forget background generation (does not block the response).
    (async () => {
      const started = Date.now();
      try {
        let result;
        if (mode === "edit" && imageBase64) {
          result = await zaiEditImage(prompt, imageBase64, sz, model);
        } else {
          result = await zaiGenerateImage(prompt, sz, model);
        }
        const durationMs = Date.now() - started;

        const cfg = JSON.parse(job.config || "{}");
        const asset = await db.asset.create({
          data: {
            userId: user.id,
            projectId: job.projectId,
            type: "image",
            name: cfg.name || prompt.slice(0, 60),
            filename: result.localUrl.split("/").pop()!,
            mimeType: "image/png",
            size: result.size,
            url: result.localUrl,
            source: "generated",
            meta: JSON.stringify({ prompt, size: sz, model: job.model, jobId: job.id }),
          },
        });

        await db.generationJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            resultUrl: result.localUrl,
            resultMeta: JSON.stringify({ assetId: asset.id, durationMs }),
            progress: 100,
          },
        });
        await logUsage(user.id, "image", "success", { model: job.model, durationMs, size: sz, assetId: asset.id });
      } catch (err: any) {
        await db.generationJob.update({
          where: { id: job.id },
          data: { status: "failed", error: err?.message || "Image generation failed" },
        }).catch(() => {});
        await logUsage(user.id, "image", "failed", { error: String(err) }).catch(() => {});
      }
    })();

    return ok({ job });
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/ai/image?id=JOB_ID — poll an image generation job. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");
    if (!jobId) return fail("Job id is required.", 400);
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== user.id) return fail("Job not found.", 404);
    return ok({ job });
  } catch (err) {
    return handleError(err);
  }
}
