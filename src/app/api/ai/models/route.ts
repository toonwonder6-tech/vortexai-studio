import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { ZAI_DEFAULTS } from "@/lib/zai";

export const runtime = "nodejs";

/**
 * Returns the centrally-configured default models and the static capability
 * matrix we advertise to the UI. We do NOT expose the API key.
 */
const MODEL_CATALOG = [
  {
    id: "glm-4.6",
    family: "text",
    label: "GLM-4.6 (text)",
    capabilities: ["text", "vision", "json"],
    description: "General-purpose text & reasoning model.",
  },
  {
    id: "image-flash",
    family: "image",
    label: "Image Flash",
    capabilities: ["text-to-image", "image-edit"],
    description: "Fast high-quality image generation.",
  },
  {
    id: "cogvideox-2",
    family: "video",
    label: "CogVideoX-2",
    capabilities: ["text-to-video", "image-to-video", "multi-reference", "with-audio"],
    description: "High-quality video generation with audio support.",
  },
  {
    id: "cogtts",
    family: "audio",
    label: "CogTTS",
    capabilities: ["text-to-speech"],
    description: "Natural multilingual text-to-speech.",
  },
];

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    return ok({
      defaults: ZAI_DEFAULTS,
      models: MODEL_CATALOG,
    });
  } catch (err) {
    return handleError(err);
  }
}
