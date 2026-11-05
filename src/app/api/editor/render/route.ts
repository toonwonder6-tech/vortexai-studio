import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { saveBuffer } from "@/lib/storage";
import { db } from "@/lib/db";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Clip {
  url: string; // local /api/media/... or remote
  type: "video" | "image";
  start?: number; // trim start (s)
  end?: number; // trim end (s)
  duration?: number; // for images
  filter?: string; // optional ffmpeg filter
}

interface EditorProject {
  clips: Clip[];
  resolution?: { w: number; h: number };
  fps?: number;
  textOverlay?: { text: string; x: number; y: number; size: number; color: string }[];
  /** Optional background music track URL (e.g. "/api/media/music/upbeat-corporate.mp3"). */
  musicUrl?: string;
  /** Background music volume, 0–100 (default 50). */
  musicVolume?: number;
  /** Transition between clips: "none" | "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "circlecrop" | "radial" | "dissolve" */
  transition?: string;
  /** Transition duration in seconds (default 0.5) */
  transitionDuration?: number;
}

/**
 * POST /api/editor/render
 * Body: { project: EditorProject, name?: string }
 * Renders a timeline (concat of trimmed clips + optional text overlays) with ffmpeg.
 * Returns a downloadable mp4 saved to local storage.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body = await req.json();
    const project: EditorProject = body.project;
    const name: string = body.name || "Edited video";
    if (!project?.clips?.length) return fail("No clips provided.", 400);

    const workDir = path.join(process.cwd(), "storage", `edit_${randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });

    const fps = project.fps || 30;
    const res = project.resolution || { w: 1280, h: 720 };

    // Download each clip locally and normalize to mp4 segments
    const segments: string[] = [];
    for (let i = 0; i < project.clips.length; i++) {
      const clip = project.clips[i];
      const localPath = path.join(workDir, `clip_${i}.mp4`);
      const url = clip.url.startsWith("http")
        ? clip.url
        : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}${clip.url}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch clip ${i}: ${resp.status}`);
      const buf = Buffer.from(new Uint8Array(await resp.arrayBuffer()));
      await fs.writeFile(localPath, buf);

      const outPath = path.join(workDir, `seg_${i}.mp4`);
      const args: string[] = ["-y", "-i", localPath];
      if (clip.type === "image") {
        args.push("-t", String(clip.duration || 3));
      } else {
        if (clip.start != null) args.push("-ss", String(clip.start));
        if (clip.end != null && clip.start != null) {
          args.push("-t", String(Math.max(0.1, clip.end - clip.start)));
        } else if (clip.end != null) {
          args.push("-t", String(clip.end));
        }
      }
      args.push(
        "-vf", `scale=${res.w}:${res.h}:force_original_aspect_ratio=decrease,pad=${res.w}:${res.h}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps}`,
        "-r", String(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-ar", "44100",
        "-ac", "2",
        "-shortest",
        outPath
      );
      await runFfmpeg(args);
      segments.push(outPath);
    }

    // Concatenate segments
    const concatList = path.join(workDir, "concat.txt");
    await fs.writeFile(concatList, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
    const outMp4 = path.join(workDir, "output.mp4");
    await runFfmpeg([
      "-y", "-f", "concat", "-safe", "0", "-i", concatList,
      "-c", "copy", outMp4,
    ]);

    // Apply transitions between clips using xfade (if requested and >1 clip)
    let transitionPath = outMp4;
    if (project.transition && project.transition !== "none" && segments.length > 1) {
      transitionPath = path.join(workDir, "transition.mp4");
      const td = project.transitionDuration || 0.5;
      const xfadeType = project.transition;
      // Build xfade chain: each pair of clips gets an xfade with offset
      // We need to probe each segment's duration for the offset calculation
      const durations: number[] = [];
      for (const seg of segments) {
        try {
          const dur = await probeDuration(seg);
          durations.push(dur);
        } catch {
          durations.push(5); // fallback
        }
      }
      // Build filter_complex for xfade chain
      const inputs: string[] = [];
      segments.forEach((_, i) => inputs.push("-i", segments[i]));
      const filterParts: string[] = [];
      let prevLabel = "0:v";
      let offset = 0;
      for (let i = 1; i < segments.length; i++) {
        offset += durations[i - 1] - td;
        const outLabel = `v${i}`;
        filterParts.push(
          `[${prevLabel}][${i}:v]xfade=transition=${xfadeType}:duration=${td}:offset=${offset}[${outLabel}]`
        );
        prevLabel = outLabel;
      }
      // Also concat audio from all segments
      const audioConcatParts: string[] = [];
      segments.forEach((_, i) => audioConcatParts.push(`[${i}:a]`));
      const audioFilter = `${audioConcatParts.join("")}concat=n=${segments.length}:v=0:a=1[aout]`;
      filterParts.push(audioFilter);
      await runFfmpeg([
        "-y", ...inputs,
        "-filter_complex", filterParts.join(";"),
        "-map", `[${prevLabel}]`,
        "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        transitionPath,
      ]);
    }

    // Apply text overlays if any (re-encode with drawtext)
    let finalPath = transitionPath;
    if (project.textOverlay && project.textOverlay.length > 0) {
      const overlayPath = path.join(workDir, "overlay.mp4");
      const filterParts = project.textOverlay.map((t) => {
        const safeText = t.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
        return `drawtext=text='${safeText}':x=${t.x}:y=${t.y}:fontsize=${t.size || 24}:fontcolor=${t.color || "white"}`;
      });
      await runFfmpeg([
        "-y", "-i", outMp4,
        "-vf", filterParts.join(","),
        "-c:a", "copy",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        overlayPath,
      ]);
      finalPath = overlayPath;
    }

    // Mix in background music if requested.
    if (project.musicUrl) {
      const musicPath = path.join(workDir, "with_music.mp4");
      await mixMusicIntoVideo(
        finalPath,
        project.musicUrl,
        project.musicVolume,
        musicPath,
        workDir,
      );
      finalPath = musicPath;
    }

    const finalBuf = await fs.readFile(finalPath);
    const saved = await saveBuffer(finalBuf, ".mp4", "edit");
    // cleanup
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        type: "video",
        name,
        filename: saved.filename,
        mimeType: "video/mp4",
        size: saved.size,
        url: saved.url,
        source: "generated",
        meta: JSON.stringify({
          editor: true,
          clips: project.clips.length,
          ...(project.musicUrl ? { music: true } : {}),
        }),
      },
    });
    return ok({ asset });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Mix a background music track into the rendered video.
 * - The music is downloaded to `workDir/music.<ext>`.
 * - It is looped infinitely (`-stream_loop -1` + `aloop`) so a video longer
 *   than the music still gets a continuous soundtrack.
 * - The audio is bounded to the video duration via `atrim` + `-t` so ffmpeg
 *   always terminates cleanly (relying on `-shortest` alone can hang when the
 *   only finite stream is the video and the music is looped infinitely).
 * - If the video already has an audio stream, the music is mixed in with
 *   `amix` at the requested volume.
 * - If the video has no audio (e.g. an image-only timeline), the music
 *   becomes the sole audio track.
 */
async function mixMusicIntoVideo(
  videoPath: string,
  musicUrl: string,
  musicVolume: number | undefined,
  outputPath: string,
  workDir: string,
): Promise<void> {
  // Download the music file locally.
  const fullUrl = musicUrl.startsWith("http")
    ? musicUrl
    : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}${musicUrl}`;
  const resp = await fetch(fullUrl);
  if (!resp.ok) throw new Error(`Failed to fetch music: ${resp.status}`);
  const musicBuf = Buffer.from(new Uint8Array(await resp.arrayBuffer()));
  // Pick a sensible extension from the URL so ffmpeg can demux correctly.
  const urlPath = new URL(fullUrl, "http://localhost").pathname;
  const ext = (urlPath.match(/\.(\w+)$/) || [, "mp3"])[1] || "mp3";
  const musicPath = path.join(workDir, `music.${ext}`);
  await fs.writeFile(musicPath, musicBuf);

  // Probe the video so we can bound the audio to its exact duration.
  const hasAudio = await probeHasAudioStream(videoPath);
  const duration = await probeDuration(videoPath);
  if (!duration || duration <= 0) {
    throw new Error("Could not determine video duration for music mix.");
  }

  // volume filter expects 0..1 (1.0 = original). Clamp to safe bounds.
  const vol = Math.max(0, Math.min(1, (musicVolume ?? 50) / 100));

  const args: string[] = [
    "-y",
    "-i", videoPath,
    "-stream_loop", "-1",   // loop the music input infinitely (demuxer level)
    "-i", musicPath,
  ];

  // aloop loops within the filter graph; atrim bounds it to the video
  // duration so the audio output stream is finite.
  let filter: string;
  if (hasAudio) {
    // Mix the existing audio with the (volume-adjusted, looped, trimmed) music.
    filter =
      `[1:a]volume=${vol},aloop=loop=-1:size=2000000000,atrim=duration=${duration}[m];` +
      `[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`;
  } else {
    // No original audio — music becomes the sole audio track.
    filter =
      `[1:a]volume=${vol},aloop=loop=-1:size=2000000000,atrim=duration=${duration}[a]`;
  }
  args.push("-filter_complex", filter);
  args.push("-map", "0:v", "-map", "[a]");
  args.push(
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
    "-t", String(duration),
    outputPath,
  );
  await runFfmpeg(args);
}

/** Returns true if the file at `filePath` has at least one audio stream. */
function probeHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_type",
        "-of", "csv=p=0",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(false));
    proc.on("close", () => resolve(out.trim() === "audio"));
  });
}

/** Returns the container duration (seconds) of the file at `filePath`. */
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
