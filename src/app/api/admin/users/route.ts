import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || undefined;
    const users = await db.user.findMany({
      where: q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        createdAt: true,
        _count: { select: { projects: true, jobs: true, assets: true } },
      },
    });
    return ok({ users });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const { id, role, status, name, resetPassword } = await req.json();
    if (!id) return fail("User id required.", 400);
    const data: any = {};
    if (role) data.role = role;
    if (status) data.status = status;
    if (typeof name === "string") data.name = name;
    if (resetPassword) data.passwordHash = hashPassword(resetPassword);
    const user = await db.user.update({ where: { id }, data, select: { id: true, email: true, name: true, role: true, status: true } });
    return ok({ user });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("User id required.", 400);
    if (id === admin.id) return fail("You cannot delete your own account.", 400);
    await db.user.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
