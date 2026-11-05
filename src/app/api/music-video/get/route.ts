import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/music-video/get?id=... — get a single MusicVideoProject with scenes + lyric lines. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("Project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { index: "asc" } },
        lyricLines: { orderBy: { index: "asc" } },
      },
    });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);
    return ok({ mvProject: mv });
  } catch (err) {
    return handleError(err);
  }
}
