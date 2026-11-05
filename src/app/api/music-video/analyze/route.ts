import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { zaiASR, logUsage } from "@/lib/ai-services";
import { probeDuration, detectSilence } from "@/lib/ffmpeg";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/music-video/analyze
 * Body: { mvProjectId }
 *
 * Analyzes the song attached to a MusicVideoProject:
 * 1. Probes duration (if not already known)
 * 2. Detects silence intervals (for beat/phrase boundary estimation)
 * 3. Runs Z.ai ASR to get a plain-text transcript (NO word-level timestamps)
 * 4. Saves the transcript as lyric lines with EVENLY DISTRIBUTED estimated
 *    timings — clearly labeled as "asr-estimate" so the user knows they're
 *    approximate and can correct them manually.
 *
 * HONESTY NOTE: Z.ai's ASR returns plain text only — no word/segment timestamps.
 * The estimated timings are a linear interpolation across the song duration,
 * NOT verified alignment. The UI must label these as "estimated" and let the
 * user correct them.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const { mvProjectId } = await req.json();
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({ where: { id: mvProjectId } });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);
    if (!mv.songUrl) return fail("No song attached to this project.", 400);

    // Resolve the song file path — handle /api/media/music/xxx.mp3 and /api/media/xxx.mp3
    const relativePath = mv.songUrl.replace(/^\/api\/media\//, "");
    const filePath = path.join(process.cwd(), "storage", relativePath);

    try {
      await fs.access(filePath);
    } catch {
      return fail("Song file not found on disk. Please re-upload.", 404);
    }

    // 1. Probe duration if not already known
    let duration = mv.songDuration;
    if (!duration) {
      duration = await probeDuration(filePath);
      await db.musicVideoProject.update({ where: { id: mvProjectId }, data: { songDuration: duration } });
    }

    // 2. Detect silence intervals for beat/phrase boundary estimation
    const silences = await detectSilence(filePath, -35, 0.3);

    // 3. Run ASR to get plain-text transcript
    let transcript = "";
    try {
      const audioBuffer = await fs.readFile(filePath);
      const base64 = audioBuffer.toString("base64");
      transcript = await zaiASR(base64);
      await logUsage(user.id, "audio", "success", { type: "asr-mv", mvProjectId });
    } catch (err) {
      // ASR might fail on music (it's designed for speech). That's OK — the
      // user can paste lyrics manually.
      transcript = "";
    }

    // 4. Create lyric lines from the transcript with ESTIMATED timings
    let lyricLines: any[] = [];
    if (transcript && transcript.trim()) {
      const lines = transcript.split("\n").map((l) => l.trim()).filter(Boolean);
      const totalLines = lines.length;
      const perLine = duration && totalLines > 0 ? duration / totalLines : 0;

      // Delete existing lyric lines
      await db.lyricLine.deleteMany({ where: { mvProjectId } });

      lyricLines = await Promise.all(
        lines.map((text, i) =>
          db.lyricLine.create({
            data: {
              mvProjectId,
              index: i,
              text,
              startTime: i * perLine,
              endTime: (i + 1) * perLine,
              source: "asr-estimate", // clearly labeled as estimated
            },
          }),
        ),
      );
    }

    // Update the MV project with lyrics text
    await db.musicVideoProject.update({
      where: { id: mvProjectId },
      data: { lyricsText: transcript || null },
    });

    return ok({
      duration,
      hasAudio: true,
      transcript,
      lyricLines,
      silences,
      timingNote: transcript
        ? "Timings are ESTIMATED by even distribution — Z.ai ASR does not provide word-level timestamps. Please review and correct timings manually."
        : "ASR could not transcribe this audio (it's optimized for speech, not music). Please paste lyrics manually.",
    });
  } catch (err) {
    return handleError(err);
  }
}
