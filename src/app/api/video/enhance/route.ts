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
export const maxDuration = 300;

/**
 * POST /api/video/enhance
 * Applies post-processing enhancements to a generated video to close the quality
 * gap with Google Flow. Uses FFmpeg filters for:
 *
 * 1. Motion blur — adds natural blur to moving elements (fixes the "AI frame" look)
 * 2. Frame interpolation — smooths motion between AI-generated frames (minterpolate)
 * 3. Color grading — applies cinematic LUT-style grading for harmonized palette
 * 4. Stabilization — reduces frame-to-frame jitter (deshake)
 * 5. Sharpening — enhances detail without over-sharpening
 * 6. Audio normalization — evens out audio levels
 *
 * Body: {
 *   videoUrl: string,          // source video URL
 *   motionBlur?: boolean,      // default true
 *   interpolate?: boolean,     // default true (smooths motion)
 *   colorGrade?: string,       // "none" | "cinematic" | "warm" | "cool" | "vibrant" | "vintage"
 *   stabilize?: boolean,       // default false (can crop edges)
 *   sharpen?: boolean,         // default true
 *   audioNormalize?: boolean,  // default true
 * }
 * Returns: { asset } — the enhanced video as a new asset
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body = await req.json();
    const {
      videoUrl,
      motionBlur = true,
      interpolate = true,
      colorGrade = "none",
      stabilize = false,
      sharpen = true,
      audioNormalize = true,
    } = body;

    if (!videoUrl) return fail("Video URL is required.", 400);

    // Verify ownership
    const videoAsset = await db.asset.findFirst({
      where: { userId: user.id, url: videoUrl, type: "video" },
    });
    if (!videoAsset) return fail("Video not found in your library.", 404);

    // Download the source video
    const workDir = path.join(process.cwd(), "storage", `enhance_${randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });
    const inputPath = path.join(workDir, "input.mp4");
    const outputPath = path.join(workDir, "output.mp4");

    const fetchUrl = videoUrl.startsWith("http") ? videoUrl : `http://localhost:3000${videoUrl}`;
    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
    await fs.writeFile(inputPath, Buffer.from(new Uint8Array(await resp.arrayBuffer())));

    // Build the FFmpeg filter chain
    const filters: string[] = [];

    // 1. Frame interpolation — smooths motion between AI-generated frames
    //    minterpolate adds intermediate frames for smoother motion
    if (interpolate) {
      filters.push("minterpolate=mi_mode=mixed:mc_mode=aobmc:me_mode=bidir:fps=30");
    }

    // 2. Motion blur — adds natural blur to moving elements
    //    Uses tmix (temporal mix) to blend frames, simulating motion blur
    if (motionBlur) {
      filters.push("tmix=frames=3:weights=1 2 1");
    }

    // 3. Stabilization — reduces frame-to-frame jitter
    if (stabilize) {
      filters.push("deshake");
    }

    // 4. Color grading — applies cinematic looks
    if (colorGrade === "cinematic") {
      // Teal-orange cinematic look
      filters.push("curves=preset=increase_contrast");
      filters.push("eq=contrast=1.1:brightness=0.02:saturation=1.15:gamma=0.95");
      filters.push("colorbalance=rs=0.05:gs=-0.02:bs=0.08:rm=-0.03:bm=0.05");
    } else if (colorGrade === "warm") {
      // Warm, golden-hour feel
      filters.push("eq=contrast=1.05:brightness=0.03:saturation=1.2:gamma=1.02");
      filters.push("colorbalance=rs=0.1:gs=0.02:bs=-0.08:rm=0.05:gm=-0.02:bm=-0.05");
    } else if (colorGrade === "cool") {
      // Cool, blue-tinted
      filters.push("eq=contrast=1.05:brightness=0.01:saturation=1.1:gamma=0.98");
      filters.push("colorbalance=rs=-0.05:gs=0.02:bs=0.1:rm=-0.03:gm=0.02:bm=0.08");
    } else if (colorGrade === "vibrant") {
      // Vibrant, punchy colors (kid-friendly)
      filters.push("eq=contrast=1.15:saturation=1.4:gamma=1.0");
      filters.push("curves=preset=vibrance");
    } else if (colorGrade === "vintage") {
      // Vintage film look
      filters.push("eq=contrast=1.1:brightness=-0.02:saturation=0.85:gamma=1.05");
      filters.push("colorbalance=rs=0.08:gs=0.03:bs=-0.05");
      filters.push("noise=alls=8:allf=t");
    }

    // 5. Sharpening — enhances detail (applied last in the chain)
    if (sharpen) {
      // Unsharp mask with moderate settings
      filters.push("unsharp=5:5:0.8:3:3:0.4");
    }

    // Build audio filter chain
    const audioFilters: string[] = [];
    if (audioNormalize) {
      // Loudnorm for broadcast-quality audio levels
      audioFilters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
    }

    // Build FFmpeg args
    const args: string[] = ["-y", "-i", inputPath];

    if (filters.length > 0) {
      args.push("-vf", filters.join(","));
    }
    if (audioFilters.length > 0) {
      args.push("-af", audioFilters.join(","));
    }

    // Always re-encode to apply filters
    args.push(
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outputPath,
    );

    await runFfmpeg(args);

    // Read and save the enhanced video
    const enhancedBuf = await fs.readFile(outputPath);
    const saved = await saveBuffer(enhancedBuf, ".mp4", "enhanced");

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        type: "video",
        name: `Enhanced — ${videoAsset.name.slice(0, 40)}`,
        filename: saved.filename,
        mimeType: "video/mp4",
        size: saved.size,
        url: saved.url,
        source: "generated",
        meta: JSON.stringify({
          enhancedFrom: videoAsset.id,
          enhancements: { motionBlur, interpolate, colorGrade, stabilize, sharpen, audioNormalize },
        }),
      },
    });

    // Cleanup
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
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
