import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { STORAGE_DIR } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Catalog metadata for the curated royalty-free music tracks. The audio files
 * themselves are generated procedurally by `scripts/generate-music.ts` and
 * stored under `storage/music/{id}.mp3`. If you add a 7th track to the script,
 * add its metadata entry here too.
 */
const TRACK_CATALOG: Record<
  string,
  { title: string; description: string; mood: string }
> = {
  "upbeat-corporate": {
    title: "Upbeat Corporate",
    description: "Cheerful, bright C major chord progression",
    mood: "Upbeat",
  },
  "cinematic-ambient": {
    title: "Cinematic Ambient",
    description: "Slow, atmospheric minor key pad",
    mood: "Ambient",
  },
  "acoustic-folk": {
    title: "Acoustic Folk",
    description: "Warm, gentle fingerpicking style",
    mood: "Folk",
  },
  "electronic-pulse": {
    title: "Electronic Pulse",
    description: "Energetic, modern synth pulse",
    mood: "Electronic",
  },
  "peaceful-nature": {
    title: "Peaceful Nature",
    description: "Calm, meditative sustained notes",
    mood: "Calm",
  },
  "playful-children": {
    title: "Playful Children",
    description: "Light, bouncy major key staccato",
    mood: "Playful",
  },
};

/**
 * GET /api/music
 * Returns the list of available background music tracks (scanned from
 * `storage/music/`). Each track includes a streaming URL served by the
 * existing `/api/media/[...path]` route.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const musicDir = path.join(STORAGE_DIR, "music");
    let files: string[] = [];
    try {
      files = await fs.readdir(musicDir);
    } catch {
      // Directory doesn't exist yet — return an empty catalog.
      return ok({ tracks: [] });
    }

    const tracks = [];
    for (const file of files.sort()) {
      if (!file.toLowerCase().endsWith(".mp3")) continue;
      const id = file.replace(/\.mp3$/i, "");
      const filePath = path.join(musicDir, file);
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const meta = TRACK_CATALOG[id] || {
        title: id
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        description: "",
        mood: "",
      };
      tracks.push({
        id,
        name: meta.title,
        title: meta.title,
        description: meta.description,
        mood: meta.mood,
        url: `/api/media/music/${file}`,
        filename: file,
        size: stat.size,
        duration: 30,
      });
    }
    return ok({ tracks });
  } catch (err) {
    return handleError(err);
  }
}
