import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";
import { spawn } from "child_process";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/video/extend
 * Extracts the last frame from an existing video using FFmpeg, saves it as an
 * image asset, and returns it. The frontend then uses this image as the first
 * frame for a new image-to-video generation — creating a seamless continuation.
 *
 * Body: { videoUrl: string }  (e.g. "/api/media/video_xxx.mp4")
 * Returns: { asset: { url, id, ... } }  (the last-frame image)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const { videoUrl } = await req.json();
    if (!videoUrl) return fail("Video URL is required.", 400);

    // Verify the user owns this video asset
    const filename = videoUrl.split("/").pop();
    const videoAsset = await db.asset.findFirst({
      where: { userId: user.id, url: videoUrl, type: "video" },
    });
    if (!videoAsset) return fail("Video not found in your library.", 404);

    // Download the video to a temp file
    const workDir = path.join(process.cwd(), "storage", `extend_${randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });
    const videoPath = path.join(workDir, "input.mp4");
    const framePath = path.join(workDir, "lastframe.png");

    const fetchUrl = videoUrl.startsWith("http")
      ? videoUrl
      : `http://localhost:3000${videoUrl}`;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
    const buf = Buffer.from(new Uint8Array(await resp.arrayBuffer()));
    await fs.writeFile(videoPath, buf);

    // Use FFmpeg to extract the last frame:
    // - Select the very last frame with -sseof -0.1 (seek 0.1s before end)
    // - Output a single PNG
    await runFfmpeg([
      "-y",
      "-sseof", "-0.1",        // seek to 0.1s before the end
      "-i", videoPath,
      "-frames:v", "1",         // grab exactly 1 frame
      "-q:v", "2",
      framePath,
    ]);

    // Read the extracted frame
    const frameBuf = await fs.readFile(framePath);
    // Save it as a proper asset
    const saved = await saveBuffer(frameBuf, ".png", "lastframe");

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        type: "image",
        name: `Last frame — ${videoAsset.name.slice(0, 40)}`,
        filename: saved.filename,
        mimeType: "image/png",
        size: saved.size,
        url: saved.url,
        source: "generated",
        meta: JSON.stringify({ extendedFrom: videoAsset.id, extendFrame: true }),
      },
    });

    // Cleanup temp dir
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

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
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}
