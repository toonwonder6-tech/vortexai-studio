import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { linesToSrt, parseSrt } from "@/lib/ffmpeg";

export const runtime = "nodejs";

/**
 * POST /api/music-video/lyrics
 * Body: { mvProjectId, action, ... }
 *
 * Actions:
 * - "update-lines": { lines: [{ id?, index, text, startTime?, endTime? }] }
 *     Replaces all lyric lines for this project.
 * - "import-srt": { srt: string }
 *     Parses SRT content and replaces lyric lines.
 * - "export-srt": Returns the SRT content for the project's lyric lines.
 * - "set-timing": { lineId, startTime, endTime }
 *     Updates a single line's timing.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body = await req.json();
    const { mvProjectId, action } = body;
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({ where: { id: mvProjectId } });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);

    if (action === "update-lines") {
      const { lines } = body;
      if (!Array.isArray(lines)) return fail("Lines array is required.", 400);

      await db.lyricLine.deleteMany({ where: { mvProjectId } });
      const created = await Promise.all(
        lines.map((l: any, i: number) =>
          db.lyricLine.create({
            data: {
              mvProjectId,
              index: i,
              text: l.text || "",
              startTime: l.startTime ?? null,
              endTime: l.endTime ?? null,
              source: l.source || "manual",
            },
          }),
        ),
      );
      return ok({ lyricLines: created });
    }

    if (action === "import-srt") {
      const { srt } = body;
      if (!srt) return fail("SRT content is required.", 400);

      const parsed = parseSrt(srt);
      await db.lyricLine.deleteMany({ where: { mvProjectId } });
      const created = await Promise.all(
        parsed.map((l, i) =>
          db.lyricLine.create({
            data: {
              mvProjectId,
              index: i,
              text: l.text,
              startTime: l.startTime,
              endTime: l.endTime,
              source: "imported-srt",
            },
          }),
        ),
      );
      await db.musicVideoProject.update({ where: { id: mvProjectId }, data: { srtContent: srt } });
      return ok({ lyricLines: created });
    }

    if (action === "set-timing") {
      const { lineId, startTime, endTime } = body;
      if (!lineId) return fail("Line ID is required.", 400);
      const updated = await db.lyricLine.update({
        where: { id: lineId },
        data: { startTime, endTime },
      });
      return ok({ lyricLine: updated });
    }

    return fail("Unknown action.", 400);
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/music-video/lyrics?mvProjectId=...&format=srt — export lyrics as SRT */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const mvProjectId = searchParams.get("mvProjectId");
    const format = searchParams.get("format") || "json";
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({
      where: { id: mvProjectId },
      include: { lyricLines: { orderBy: { index: "asc" } } },
    });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);

    if (format === "srt") {
      const srt = linesToSrt(mv.lyricLines);
      return ok({ srt });
    }
    return ok({ lyricLines: mv.lyricLines });
  } catch (err) {
    return handleError(err);
  }
}
