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

    // Apply text overlays if any (re-encode with drawtext)
    let finalPath = outMp4;
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
        meta: JSON.stringify({ editor: true, clips: project.clips.length }),
      },
    });
    return ok({ asset });
  } catch (err) {
    return handleError(err);
  }
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
