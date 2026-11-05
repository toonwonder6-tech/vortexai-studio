import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/ai-services";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const projects = await db.project.findMany({
      where: { userId: user.id, ...(type ? { type } : {}), status: { not: "deleted" } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { _count: { select: { jobs: true, assets: true } } },
    });
    return ok({ projects });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json();
    const { name, type, description, config } = body;
    if (!name || !type) return fail("Name and type are required.", 400);
    const project = await db.project.create({
      data: {
        userId: user.id,
        name,
        type,
        description: description || null,
        config: config ? JSON.stringify(config) : null,
      },
    });
    await logActivity(user.id, "project.create", { projectId: project.id, type });
    return ok({ project });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const body = await req.json();
    const { id, name, description, status, config, coverUrl } = body;
    if (!id) return fail("Project id required.", 400);
    const project = await db.project.findUnique({ where: { id } });
    if (!project || project.userId !== user.id) return fail("Project not found.", 404);
    const updated = await db.project.update({
      where: { id },
      data: {
        ...(typeof name === "string" ? { name } : {}),
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof status === "string" ? { status } : {}),
        ...(typeof coverUrl === "string" ? { coverUrl } : {}),
        ...(config ? { config: JSON.stringify(config) } : {}),
      },
    });
    return ok({ project: updated });
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
    if (!id) return fail("Project id required.", 400);
    const project = await db.project.findUnique({ where: { id } });
    if (!project || project.userId !== user.id) return fail("Project not found.", 404);
    await db.project.update({ where: { id }, data: { status: "deleted" } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
