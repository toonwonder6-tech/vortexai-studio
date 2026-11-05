import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getZAI } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    await requireAdmin();
    const zai = await getZAI();
    const started = Date.now();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "Reply with exactly: ok" },
        { role: "user", content: "ping" },
      ],
      thinking: { type: "disabled" },
    } as any);
    const text = completion?.choices?.[0]?.message?.content ?? "";
    return ok({ ok: true, reply: text, latencyMs: Date.now() - started });
  } catch (err) {
    return handleError(err);
  }
}
