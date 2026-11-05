import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/jobs/cleanup
 * Removes failed/expired jobs from the user's view (marks them as "expired"
 * and clears sensitive fields). Does NOT delete completed jobs or their media.
 *
 * Body: { type?: "video"|"image"|"audio"|"text" }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json().catch(() => ({}));
    const type = body.type;

    // Delete failed/expired jobs (and stuck "processing" jobs older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const deleted = await db.generationJob.deleteMany({
      where: {
        userId: user.id,
        ...(type ? { type } : {}),
        OR: [
          { status: "failed" },
          { status: "expired" },
          // Clean up stuck processing jobs
          { status: { in: ["processing", "submitted", "waiting"] }, updatedAt: { lt: oneHourAgo } },
        ],
      },
    });

    return ok({ removed: deleted.count });
  } catch (err) {
    return handleError(err);
  }
}
