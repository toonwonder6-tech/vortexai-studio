import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || undefined;
    const chars = await db.character.findMany({
      where: { userId: user.id, ...(category ? { category } : {}) },
      orderBy: { updatedAt: "desc" },
    });
    return ok({ characters: chars });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json();
    const { name, description, category, referenceUrl, meta } = body;
    if (!name) return fail("Name is required.", 400);
    const character = await db.character.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        category: category || "character",
        referenceUrl: referenceUrl || null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
    return ok({ character });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json();
    const { id, name, description, category, referenceUrl, meta } = body;
    if (!id) return fail("Character id required.", 400);
    const existing = await db.character.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) return fail("Character not found.", 404);
    const updated = await db.character.update({
      where: { id },
      data: {
        ...(typeof name === "string" ? { name } : {}),
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof category === "string" ? { category } : {}),
        ...(typeof referenceUrl === "string" ? { referenceUrl } : {}),
        ...(meta ? { meta: JSON.stringify(meta) } : {}),
      },
    });
    return ok({ character: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("Character id required.", 400);
    const existing = await db.character.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) return fail("Character not found.", 404);
    await db.character.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
