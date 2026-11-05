import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";
import { runFfmpeg, probeDuration, probeHasAudio } from "@/lib/ffmpeg";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

interface MVScene {
  index: number;
  startTime: number;
  endTime: number;
  videoUrl?: string | null;
  lyricText?: string | null;
}

interface MVRenderRequest {
  mvProjectId: string;
  name?: string;
  resolution?: { w: number; h: number };
  fps?: number;
  transition?: string;
  transitionDuration?: number;
  lyricOverlay?: boolean;
  lyricFontSize?: number;
  lyricColor?: string;
  excerptStart?: number;
  excerptEnd?: number;
}

/**
 * POST /api/music-video/render
 *
 * Renders the final music video by:
 * 1. Validating that scenes cover the song duration (or selected excerpt)
 * 2. Downloading each scene's video clip
 * 3. Normalizing each clip to the target resolution/fps
 * 4. Concatenating clips with optional transitions
 * 5. Mixing the master song as the continuous audio track
 * 6. Optionally burning in lyric overlays timed to each scene
 * 7. Trimming to the song duration (or selected excerpt)
 *
 * PRE-RENDER CHECK:
 * - Warns if video clips don't cover the full song duration
 * - Warns if there are gaps between scenes
 * - Warns if scenes overlap
 * - Returns a "warnings" array even on success so the UI can display them
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body: MVRenderRequest = await req.json();
    const { mvProjectId, name, resolution, fps, transition, transitionDuration, lyricOverlay, lyricFontSize, lyricColor, excerptStart, excerptEnd } = body;
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({
      where: { id: mvProjectId },
      include: { scenes: { orderBy: { index: "asc" } } },
    });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);
    if (!mv.songUrl) return fail("No song attached to this project.", 400);

    // ── PRE-RENDER DURATION MISMATCH CHECK ──────────────────────────────────
    const warnings: string[] = [];
    const songDuration = mv.songDuration || 0;
    const renderStart = excerptStart ?? 0;
    const renderEnd = excerptEnd ?? songDuration;
    const renderDuration = renderEnd - renderStart;

    // Check which scenes have video clips
    const scenesWithVideo = mv.scenes.filter((s) => s.videoUrl);
    const scenesWithoutVideo = mv.scenes.filter((s) => !s.videoUrl);

    if (scenesWithoutVideo.length > 0) {
      warnings.push(`${scenesWithoutVideo.length} scene(s) have no video clip and will show a black placeholder.`);
    }

    // Check total scene coverage vs song duration
    if (scenesWithVideo.length > 0 && songDuration > 0) {
      const sceneCoverage = scenesWithVideo.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      if (sceneCoverage < songDuration * 0.9) {
        warnings.push(`Your scenes cover only ${sceneCoverage.toFixed(1)}s of a ${songDuration.toFixed(1)}s song (${Math.round((sceneCoverage / songDuration) * 100)}% coverage). The final video will have gaps.`);
      }
    }

    // Check for gaps between scenes
    for (let i = 1; i < mv.scenes.length; i++) {
      const gap = mv.scenes[i].startTime - mv.scenes[i - 1].endTime;
      if (gap > 0.5) {
        warnings.push(`Gap of ${gap.toFixed(1)}s between scene ${i} and scene ${i + 1}.`);
      }
      if (gap < -0.1) {
        warnings.push(`Scenes ${i} and ${i + 1} overlap by ${Math.abs(gap).toFixed(1)}s.`);
      }
    }

    // If rendering an excerpt, warn about it
    if (excerptStart != null || excerptEnd != null) {
      warnings.push(`Rendering a ${renderDuration.toFixed(1)}s excerpt (${renderStart.toFixed(1)}s–${renderEnd.toFixed(1)}s) of the ${songDuration.toFixed(1)}s song.`);
    }

    // ── RENDER ──────────────────────────────────────────────────────────────
    const res = resolution || { w: 1280, h: 720 };
    const frameRate = fps || 30;
    const workDir = path.join(process.cwd(), "storage", `mvrender_${randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });

    // Download and normalize each scene's video clip
    const segments: string[] = [];
    for (const scene of mv.scenes) {
      // Skip scenes outside the render range
      if (scene.endTime <= renderStart || scene.startTime >= renderEnd) continue;

      const outPath = path.join(workDir, `seg_${scene.index}.mp4`);
      if (!scene.videoUrl) {
        // Create a black placeholder for scenes without video
        const sceneDur = Math.min(scene.endTime, renderEnd) - Math.max(scene.startTime, renderStart);
        await runFfmpeg([
          "-y", "-f", "lavfi", "-i", `color=c=black:s=${res.w}x${res.h}:r=${frameRate}:d=${sceneDur}`,
          "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
          "-t", String(sceneDur),
          "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k",
          outPath,
        ]);
        segments.push(outPath);
        continue;
      }

      // Download the scene video
      const videoUrl = scene.videoUrl.startsWith("http") ? scene.videoUrl : `http://localhost:3000${scene.videoUrl}`;
      const videoResp = await fetch(videoUrl);
      if (!videoResp.ok) {
        warnings.push(`Failed to download video for scene ${scene.index + 1}. Using black placeholder.`);
        const sceneDur = Math.min(scene.endTime, renderEnd) - Math.max(scene.startTime, renderStart);
        await runFfmpeg([
          "-y", "-f", "lavfi", "-i", `color=c=black:s=${res.w}x${res.h}:r=${frameRate}:d=${sceneDur}`,
          "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
          "-t", String(sceneDur),
          "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k",
          outPath,
        ]);
        segments.push(outPath);
        continue;
      }

      const videoBuf = Buffer.from(new Uint8Array(await videoResp.arrayBuffer()));
      const clipPath = path.join(workDir, `clip_${scene.index}.mp4`);
      await fs.writeFile(clipPath, videoBuf);

      // Normalize: scale + pad to target resolution, re-encode
      await runFfmpeg([
        "-y", "-i", clipPath,
        "-vf", `scale=${res.w}:${res.h}:force_original_aspect_ratio=decrease,pad=${res.w}:${res.h}:(ow-iw)/2:(oh-ih)/2:black,fps=${frameRate}`,
        "-r", String(frameRate),
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-shortest",
        outPath,
      ]);
      segments.push(outPath);
    }

    if (segments.length === 0) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      return fail("No video clips to render. Generate or upload clips for your scenes first.", 400);
    }

    // Concatenate segments
    const concatList = path.join(workDir, "concat.txt");
    await fs.writeFile(concatList, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
    const concatPath = path.join(workDir, "concat.mp4");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", concatPath]);

    // Download the master song
    const songUrl = mv.songUrl.startsWith("http") ? mv.songUrl : `http://localhost:3000${mv.songUrl}`;
    const songResp = await fetch(songUrl);
    if (!songResp.ok) return fail("Failed to download the master song.", 500);
    const songBuf = Buffer.from(new Uint8Array(await songResp.arrayBuffer()));
    const songPath = path.join(workDir, "song");
    const songExt = mv.songUrl.endsWith(".wav") ? ".wav" : mv.songUrl.endsWith(".ogg") ? ".ogg" : ".mp3";
    await fs.writeFile(songPath + songExt, songBuf);
    const songFile = songPath + songExt;

    // Determine the final video duration
    const videoDuration = await probeDuration(concatPath);

    // Mix the master song as the continuous audio track
    // The song plays from start to end (or excerpt), replacing the clips' audio
    const songStart = renderStart;
    const songEnd = renderEnd;
    const mixPath = path.join(workDir, "mix.mp4");

    // If lyric overlays are requested, build the drawtext filter
    let vfFilters: string[] = [];
    if (lyricOverlay && mv.scenes.length > 0) {
      for (const scene of mv.scenes) {
        if (!scene.lyricText) continue;
        const safeText = scene.lyricText.replace(/'/g, "\\'").replace(/:/g, "\\:");
        const startT = Math.max(0, scene.startTime - renderStart);
        const endT = Math.min(videoDuration, scene.endTime - renderStart);
        if (endT <= startT) continue;
        const fontSize = lyricFontSize || 28;
        const color = lyricColor || "white";
        // Bottom-center subtitle with enable=between for timing
        vfFilters.push(
          `drawtext=text='${safeText}':x=(w-text_w)/2:y=h-text_h-40:fontsize=${fontSize}:fontcolor=${color}:bordercolor=black:borderw=2:enable='between(t,${startT.toFixed(2)},${endT.toFixed(2)})'`
        );
      }
    }

    const vfArg = vfFilters.length > 0 ? ["-vf", vfFilters.join(",")] : [];

    // Build FFmpeg args: take the concatenated video, replace audio with the song
    // The song is trimmed to [renderStart, renderEnd] and the video is trimmed to match
    await runFfmpeg([
      "-y",
      "-i", concatPath,                          // input 0: concatenated video
      "-ss", String(songStart), "-t", String(Math.min(videoDuration, renderDuration)), "-i", songFile, // input 1: song (trimmed)
      ...vfArg,                                   // optional lyric overlays
      "-map", "0:v",                              // video from concat
      "-map", "1:a",                              // audio from song (replaces clip audio)
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
      "-t", String(Math.min(videoDuration, renderDuration)),  // final duration
      "-movflags", "+faststart",
      mixPath,
    ]);

    // Save the final video
    const finalBuf = await fs.readFile(mixPath);
    const saved = await saveBuffer(finalBuf, ".mp4", "mvfinal");

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        projectId: mv.projectId,
        type: "video",
        name: name || `Music Video — ${mv.name}`,
        filename: saved.filename,
        mimeType: "video/mp4",
        size: saved.size,
        url: saved.url,
        source: "generated",
        meta: JSON.stringify({
          musicVideo: true,
          mvProjectId: mv.id,
          songName: mv.songName,
          songDuration: mv.songDuration,
          renderDuration: Math.min(videoDuration, renderDuration),
          excerpt: excerptStart != null || excerptEnd != null,
          lyricOverlay: !!lyricOverlay,
        }),
      },
    });

    // Cleanup
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    return ok({ asset, warnings });
  } catch (err) {
    return handleError(err);
  }
}
