import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/ai-services";
import { probeDuration, probeHasAudio } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/music-video/create
 *  Body: { name, songUrl, songName, mode }
 *  Creates a MusicVideoProject + a parent Project record.
 *  Probes the song for duration + audio stream presence.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body = await req.json();
    const { name, songUrl, songName, mode } = body;
    if (!name) return fail("Project name is required.", 400);
    if (!songUrl) return fail("Song URL is required.", 400);

    // Probe the song for duration
    let songDuration: number | null = null;
    let hasAudio = false;
    try {
      const path = await import("path");
      const fs = await import("fs/promises");
      // Handle URLs like /api/media/music/upbeat-corporate.mp3 or /api/media/upload_xxx.mp3
      // Strip /api/media/ prefix and resolve relative to storage/
      const relativePath = songUrl.replace(/^\/api\/media\//, "");
      const filePath = path.join(process.cwd(), "storage", relativePath);
      try {
        await fs.access(filePath);
        songDuration = await probeDuration(filePath);
        hasAudio = await probeHasAudio(filePath);
      } catch {
        // File might be a remote URL or not yet stored
      }
    } catch {}

    // Create the parent Project
    const project = await db.project.create({
      data: {
        userId: user.id,
        name,
        type: "music-video",
        status: "active",
        description: `Music video — ${songName || "untitled song"}`,
        config: JSON.stringify({ mode: mode || "montage", songUrl }),
      },
    });

    // Create the MusicVideoProject
    const mvProject = await db.musicVideoProject.create({
      data: {
        userId: user.id,
        projectId: project.id,
        name,
        mode: mode || "montage",
        songUrl,
        songName: songName || null,
        songDuration: songDuration || null,
        lipSyncSupported: false, // Z.ai cogvideox does NOT support audio-conditioned mouth animation
        config: JSON.stringify({ hasAudio }),
      },
    });

    await logActivity(user.id, "music-video.create", { mvProjectId: mvProject.id });

    return ok({ project, mvProject });
  } catch (err) {
    return handleError(err);
  }
}
