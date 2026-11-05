import { NextResponse } from "next/server";

export function ok(data: any, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, extra: any = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Translate thrown errors from auth helpers / AI services into HTTP responses. */
export function handleError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "UNAUTHORIZED") return fail("You must be signed in.", 401);
  if (msg === "FORBIDDEN") return fail("Administrator access required.", 403);
  if (msg.startsWith("LIMIT:")) return fail(msg.slice(6), 429);
  if (msg.startsWith("RATE_LIMIT:")) return fail(msg.slice("RATE_LIMIT:".length), 429);
  console.error("[api error]", err);
  return fail(msg || "Internal server error", 500);
}
