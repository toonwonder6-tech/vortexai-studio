import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { zaiText, extractJson, zaiGenerateImage, logUsage } from "@/lib/ai-services";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/music-video/scenes
 * Body: { mvProjectId, action, ... }
 *
 * Actions:
 * - "plan": { mode } — Auto-generate scenes from the lyrics + song duration.
 *     Uses Z.ai LLM to create visual prompts for each 8-second segment.
 * - "list": Returns all scenes for the project.
 * - "update": { sceneId, ...fields } — Update a single scene.
 * - "delete": { sceneId } — Delete a scene.
 * - "reorder": { sceneIds: string[] } — Reorder scenes by ID list.
 * - "generate-image": { sceneId } — Generate a storyboard image for a scene.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const body = await req.json();
    const { mvProjectId, action } = body;
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({
      where: { id: mvProjectId },
      include: { lyricLines: { orderBy: { index: "asc" } } },
    });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);

    // ── PLAN: Auto-generate scenes from lyrics + song duration ──────────────
    if (action === "plan") {
      if (!mv.songDuration) return fail("Song duration unknown. Analyze the song first.", 400);

      const duration = mv.songDuration;
      const sceneLength = 8; // default 8-second scenes
      const sceneCount = Math.ceil(duration / sceneLength);
      const lyrics = mv.lyricLines.map((l) => l.text).join("\n");

      // Use Z.ai LLM to generate visual prompts for each scene
      const sysPrompt = `You are a music video director. Create a scene-by-scene visual plan for a music video.
The song is ${duration.toFixed(1)} seconds long, divided into ${sceneCount} scenes of ~${sceneLength}s each.
${lyrics ? `Lyrics:\n${lyrics}` : "No lyrics available — create instrumental visuals."}
Mode: ${mv.mode === "singing" ? "Singing characters" : "Music montage"}

Respond with JSON: { "scenes": [{ "index": number, "startTime": number, "endTime": number, "lyricText": string|null, "visualPrompt": string, "cameraDirection": string }] }
- Each scene is ${sceneLength}s (the last scene may be shorter to fit the song duration)
- visualPrompt: a vivid, self-contained prompt for AI video/image generation describing the visual
- cameraDirection: camera movement (e.g., "slow push-in", "tracking shot", "static wide")
- lyricText: the lyrics that fall within this scene's time range (from the provided lyrics), or null for instrumental sections
- For ${mv.mode === "singing" ? "singing" : "montage"} mode, make visuals match the song's mood`;

      const planRes = await zaiText(`Plan ${sceneCount} scenes for this music video.`, {
        system: sysPrompt,
        json: true,
      });
      const plan = extractJson(planRes);

      if (!plan?.scenes || !Array.isArray(plan.scenes)) {
        return fail("Could not generate scene plan. Try again.", 500);
      }

      // Delete existing scenes
      await db.scene.deleteMany({ where: { mvProjectId } });

      // Create scenes
      const scenes = await Promise.all(
        plan.scenes.map((s: any) =>
          db.scene.create({
            data: {
              mvProjectId,
              index: s.index,
              startTime: s.startTime,
              endTime: Math.min(s.endTime, duration), // clamp last scene
              lyricText: s.lyricText || null,
              visualPrompt: s.visualPrompt,
              cameraDirection: s.cameraDirection || null,
              lipSyncStatus: mv.lipSyncSupported ? "n/a" : "not-supported",
            },
          }),
        ),
      );

      await logUsage(user.id, "text", "success", { type: "mv-scene-plan", mvProjectId });
      return ok({ scenes });
    }

    // ── UPDATE: Update a single scene ───────────────────────────────────────
    if (action === "update") {
      const { sceneId, ...fields } = body;
      if (!sceneId) return fail("Scene ID is required.", 400);
      const scene = await db.scene.findUnique({ where: { id: sceneId } });
      if (!scene) return fail("Scene not found.", 404);

      const updated = await db.scene.update({
        where: { id: sceneId },
        data: {
          ...(fields.startTime != null ? { startTime: fields.startTime } : {}),
          ...(fields.endTime != null ? { endTime: fields.endTime } : {}),
          ...(fields.lyricText != null ? { lyricText: fields.lyricText } : {}),
          ...(fields.visualPrompt != null ? { visualPrompt: fields.visualPrompt } : {}),
          ...(fields.cameraDirection != null ? { cameraDirection: fields.cameraDirection } : {}),
          ...(fields.characterId != null ? { characterId: fields.characterId } : {}),
          ...(fields.characterName != null ? { characterName: fields.characterName } : {}),
          ...(fields.videoUrl != null ? { videoUrl: fields.videoUrl, videoStatus: "ready" } : {}),
        },
      });
      return ok({ scene: updated });
    }

    // ── DELETE: Delete a scene ──────────────────────────────────────────────
    if (action === "delete") {
      const { sceneId } = body;
      if (!sceneId) return fail("Scene ID is required.", 400);
      await db.scene.delete({ where: { id: sceneId } });
      return ok({ deleted: true });
    }

    // ── GENERATE-IMAGE: Generate a storyboard frame for a scene ─────────────
    if (action === "generate-image") {
      const { sceneId } = body;
      if (!sceneId) return fail("Scene ID is required.", 400);
      const scene = await db.scene.findUnique({ where: { id: sceneId } });
      if (!scene) return fail("Scene not found.", 404);
      if (!scene.visualPrompt) return fail("Scene has no visual prompt.", 400);

      const result = await zaiGenerateImage(scene.visualPrompt, "1344x768");
      const updated = await db.scene.update({
        where: { id: sceneId },
        data: { imageUrl: result.localUrl },
      });
      await logUsage(user.id, "image", "success", { type: "mv-storyboard", sceneId });
      return ok({ scene: updated });
    }

    return fail("Unknown action.", 400);
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/music-video/scenes?mvProjectId=... — list scenes for a project */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const mvProjectId = searchParams.get("mvProjectId");
    if (!mvProjectId) return fail("Music video project ID is required.", 400);

    const mv = await db.musicVideoProject.findUnique({
      where: { id: mvProjectId },
      include: { scenes: { orderBy: { index: "asc" } } },
    });
    if (!mv || mv.userId !== user.id) return fail("Music video project not found.", 404);
    return ok({ scenes: mv.scenes, mvProject: mv });
  } catch (err) {
    return handleError(err);
  }
}
