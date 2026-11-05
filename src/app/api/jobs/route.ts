import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/jobs?status=...&type=... — list current user's jobs. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const limit = Math.min(100, Number(searchParams.get("limit") || 50));
    const jobs = await db.generationJob.findMany({
      where: {
        userId: user.id,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { project: true },
    });
    return ok({ jobs });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/jobs — update status (e.g. retry / cancel). */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { id, status } = await req.json();
    if (!id) return fail("Job id required.", 400);
    const job = await db.generationJob.findUnique({ where: { id } });
    if (!job || job.userId !== user.id) return fail("Job not found.", 404);
    const updated = await db.generationJob.update({
      where: { id },
      data: { status: status || job.status, progress: status === "completed" ? 100 : job.progress },
    });
    return ok({ job: updated });
  } catch (err) {
    return handleError(err);
  }
}
