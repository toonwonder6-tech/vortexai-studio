import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/ai-services";

export const runtime = "nodejs";

/** GET /api/music-video/list — list the current user's music-video projects. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const projects = await db.musicVideoProject.findMany({
      where: { userId: user.id, status: { not: "deleted" } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { scenes: true, lyricLines: true } } },
    });
    return ok({ projects });
  } catch (err) {
    return handleError(err);
  }
}
