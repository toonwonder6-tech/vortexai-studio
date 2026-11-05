import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { zaiPollVideo } from "@/lib/ai-services";

export const runtime = "nodejs";

/** GET /api/admin/jobs?status=...&type=... — monitor all jobs across users. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const limit = Math.min(200, Number(searchParams.get("limit") || 100));
    const jobs = await db.generationJob.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { email: true, name: true } } },
    });
    return ok({ jobs });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/admin/jobs — retry a failed job (re-poll), or cancel. */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const { id, action } = await req.json();
    if (!id) return fail("Job id required.", 400);
    const job = await db.generationJob.findUnique({ where: { id } });
    if (!job) return fail("Job not found.", 404);

    if (action === "cancel") {
      const updated = await db.generationJob.update({
        where: { id },
        data: { status: "failed", error: "Cancelled by admin" },
      });
      return ok({ job: updated });
    }
    if (action === "retry") {
      if (!job.providerTaskId) return fail("No provider task id to retry.", 400);
      const poll = await zaiPollVideo(job.providerTaskId);
      let data: any = {};
      if (poll.status === "completed") {
        data = { status: "completed", resultUrl: poll.videoUrl, resultMeta: poll.raw ? JSON.stringify(poll.raw) : job.resultMeta, progress: 100, error: null };
      } else if (poll.status === "failed") {
        data = { status: "failed", error: poll.error || "Generation failed" };
      } else {
        data = { status: "processing", progress: 10 };
      }
      const updated = await db.generationJob.update({ where: { id }, data });
      return ok({ job: updated });
    }
    return fail("Unknown action.", 400);
  } catch (err) {
    return handleError(err);
  }
}
