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
    const templates = await db.promptTemplate.findMany({
      where: {
        OR: [{ isPublic: true }, ...(user ? [{ userId: user.id }] : [])],
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return ok({ templates });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json();
    const { title, content, category, isPublic } = body;
    if (!title || !content) return fail("Title and content are required.", 400);
    const template = await db.promptTemplate.create({
      data: {
        userId: user.id,
        title,
        content,
        category: category || "general",
        isPublic: !!isPublic,
      },
    });
    return ok({ template });
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
    if (!id) return fail("Template id required.", 400);
    const t = await db.promptTemplate.findUnique({ where: { id } });
    if (!t || (t.userId && t.userId !== user.id)) return fail("Template not found.", 404);
    await db.promptTemplate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
