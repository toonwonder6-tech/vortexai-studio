import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { zaiText, extractJson, logUsage } from "@/lib/ai-services";
import { checkDailyLimit, checkMaintenance } from "@/lib/limits";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ai/text
 *
 * Two modes:
 * 1. SYNC (default): blocks until the LLM responds. Used for quick calls
 *    (improve-prompt, prompt assistant, short translations) that finish <25s.
 * 2. ASYNC ({ async: true }): returns a job ID immediately and runs the LLM
 *    in the background. Used for long-running structured generation (script,
 *    storyboard, director-plan, script-to-video) that can take 7-15s and would
 *    otherwise cause gateway 502 timeouts. Poll with GET /api/ai/text?id=JOB_ID.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    if (await checkMaintenance()) return fail("Platform is in maintenance mode.", 503);

    const body = await req.json();
    const { prompt, system, model, thinking, json, mode, async: asyncMode } = body;
    if (!prompt && !mode) return fail("Prompt is required.", 400);

    const limit = await checkDailyLimit(user.id, "text");
    if (!limit.ok) return fail(limit.reason!, 429);

    // Build the system + user prompts based on mode
    const built = buildPrompts(mode, prompt, body, system, json);
    const sysPrompt = built.sysPrompt;
    const userPrompt = built.userPrompt;
    const expectJson = built.expectJson;

    // Long-running modes MUST use async to avoid 502 gateway timeouts
    const longRunningModes = ["script", "storyboard", "director-plan", "script-to-video"];
    const useAsync = asyncMode || longRunningModes.includes(mode);

    if (useAsync) {
      // ASYNC: create a job, run LLM in background, return immediately
      const job = await db.generationJob.create({
        data: {
          userId: user.id,
          type: "text",
          status: "processing",
          prompt: prompt || mode,
          model: model || "glm-4.6",
          config: JSON.stringify({ mode, sysPrompt, userPrompt, expectJson, thinking }),
          progress: 5,
        },
      });

      // Background LLM call
      (async () => {
        const started = Date.now();
        try {
          const text = await zaiText(userPrompt, { system: sysPrompt, model, thinking, json: expectJson });
          const parsed = expectJson ? extractJson(text) : null;
          const durationMs = Date.now() - started;

          await db.generationJob.update({
            where: { id: job.id },
            data: {
              status: "completed",
              resultMeta: JSON.stringify({ text, json: parsed, durationMs }),
              progress: 100,
            },
          });
          await logUsage(user.id, "text", "success", { model, durationMs, mode });
        } catch (err: any) {
          await db.generationJob.update({
            where: { id: job.id },
            data: { status: "failed", error: err?.message || "Text generation failed" },
          }).catch(() => {});
          await logUsage(user.id, "text", "failed", { error: String(err) }).catch(() => {});
        }
      })();

      return ok({ job, async: true });
    }

    // SYNC: block and return the result directly (for quick calls)
    const started = Date.now();
    const text = await zaiText(userPrompt, { system: sysPrompt, model, thinking, json: expectJson });
    const durationMs = Date.now() - started;
    const parsed = expectJson ? extractJson(text) : null;
    await logUsage(user.id, "text", "success", { model, durationMs, mode });
    return ok({ text, json: parsed, durationMs });
  } catch (err) {
    return handleError(err);
  }
}

/** GET /api/ai/text?id=JOB_ID — poll an async text generation job. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");
    if (!jobId) return fail("Job id is required.", 400);
    const job = await db.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.userId !== user.id) return fail("Job not found.", 404);
    return ok({ job });
  } catch (err) {
    return handleError(err);
  }
}

/** Build system/user prompts for each assistant mode. */
function buildPrompts(mode: string, prompt: string, body: any, system?: string, json?: boolean) {
  let sysPrompt = system;
  let userPrompt = prompt;
  let expectJson = !!json;

  if (mode === "improve-prompt") {
    sysPrompt = "You are an expert AI video prompt engineer. Rewrite the user's prompt into a vivid, cinematic, highly detailed generation prompt. Include subject, style, lighting, camera movement, mood. Respond with JSON: {\"prompt\": string, \"negativePrompt\": string, \"tags\": string[]}.";
    expectJson = true;
    userPrompt = `Original prompt: ${prompt}`;
  } else if (mode === "script") {
    sysPrompt = "You are a professional video scriptwriter. Write a short engaging script for the given idea. Respond with JSON: {\"title\": string, \"logline\": string, \"scenes\": [{\"index\": number, \"heading\": string, \"narration\": string, \"visualPrompt\": string, \"duration\": number}]}. Keep 3-6 scenes, durations in seconds (4-8 each).";
    expectJson = true;
    userPrompt = `Idea: ${prompt}`;
  } else if (mode === "storyboard") {
    sysPrompt = "You are a storyboard artist. Convert the script into a shot-by-shot storyboard. Respond with JSON: {\"shots\": [{\"index\": number, \"scene\": number, \"shotType\": string, \"visualPrompt\": string, \"cameraMovement\": string, \"duration\": number}]}.";
    expectJson = true;
    userPrompt = `Script: ${prompt}`;
  } else if (mode === "director-plan") {
    sysPrompt = "You are an AI Video Director. Given a concept, plan the full production. Respond with JSON: {\"title\": string, \"logline\": string, \"style\": string, \"totalDuration\": number, \"scenes\": [{\"index\": number, \"heading\": string, \"narration\": string, \"imagePrompt\": string, \"videoPrompt\": string, \"duration\": number, \"voiceover\": string}]}. 3-5 scenes, durations 4-8s. imagePrompt and videoPrompt must be vivid and self-contained.";
    expectJson = true;
    userPrompt = `Concept: ${prompt}`;
  } else if (mode === "script-to-video") {
    sysPrompt = "You are an expert AI video director and script analyst. First, carefully READ and UNDERSTAND the user's script — identify the characters, setting, mood, key actions, and emotional beats. Then produce a single optimized video generation prompt that captures the essence of the script in a way an AI video model can render. Respond with JSON: {\"title\": string, \"summary\": string, \"characters\": string[], \"setting\": string, \"mood\": string, \"keyActions\": string[], \"videoPrompt\": string}. The videoPrompt must be a single vivid, detailed, self-contained generation prompt (max 300 words) that describes the visual scene, camera work, lighting, and action — ready to send to a video generation model. If the script implies realism, include photorealistic, natural lighting, lifelike details. If it implies animation, include the appropriate style. Make the videoPrompt capture the MOST important single moment or continuous action from the script.";
    expectJson = true;
    userPrompt = `Script to analyze and visualize:\n\n${prompt}`;
  } else if (mode === "translate") {
    sysPrompt = "You are a professional translator. Translate the user's text. Respond with JSON: {\"translated\": string}.";
    expectJson = true;
    userPrompt = `Translate to ${body.targetLang || "English"}: ${prompt}`;
  } else if (mode === "marketing") {
    sysPrompt = "You are a marketing copywriter. Generate catchy marketing copy. Respond with JSON: {\"headline\": string, \"tagline\": string, \"description\": string, \"cta\": string}.";
    expectJson = true;
    userPrompt = `Product/Topic: ${prompt}`;
  }

  return { sysPrompt, userPrompt, expectJson };
}
