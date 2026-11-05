import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getCurrentUser,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getSetting } from "@/lib/zai";
import { DEFAULT_SETTINGS } from "@/lib/zai";
import { logActivity } from "@/lib/ai-services";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "register") {
      const allowRegistration = await getSetting("allowRegistration", DEFAULT_SETTINGS.allowRegistration);
      if (!allowRegistration) return fail("Registration is currently disabled.", 403);
      const { email, password, name } = body;
      if (!email || !password) return fail("Email and password are required.", 400);
      if (password.length < 6) return fail("Password must be at least 6 characters.", 400);
      const existing = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
      if (existing) return fail("An account with this email already exists.", 409);
      const userCount = await db.user.count();
      const role = userCount === 0 ? "admin" : "user";
      const user = await db.user.create({
        data: {
          email: String(email).toLowerCase(),
          name: name?.trim() || null,
          passwordHash: hashPassword(password),
          role,
        },
      });
      const token = await createSession(user.id);
      await logActivity(user.id, "register", { email: user.email });
      const res = ok({ user: sanitize(user), role });
      res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
      return res;
    }

    if (action === "login") {
      const { email, password } = body;
      if (!email || !password) return fail("Email and password are required.", 400);
      const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return fail("Invalid email or password.", 401);
      }
      if (user.status !== "active") return fail("Your account has been suspended.", 403);
      const token = await createSession(user.id);
      await logActivity(user.id, "login");
      const res = ok({ user: sanitize(user), role: user.role });
      res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
      return res;
    }

    if (action === "logout") {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const token = cookieStore.get(SESSION_COOKIE)?.value;
      if (token) await destroySession(token);
      const res = ok({ loggedOut: true });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }

    if (action === "update-profile") {
      const user = await getCurrentUser();
      if (!user) return fail("You must be signed in.", 401);
      const { name, avatarUrl } = body;
      const updated = await db.user.update({
        where: { id: user.id },
        data: {
          ...(typeof name === "string" ? { name: name.trim() || null } : {}),
          ...(typeof avatarUrl === "string" ? { avatarUrl } : {}),
        },
      });
      return ok({ user: sanitize(updated) });
    }

    if (action === "change-password") {
      const user = await getCurrentUser();
      if (!user) return fail("You must be signed in.", 401);
      const { currentPassword, newPassword } = body;
      if (!verifyPassword(currentPassword, user.passwordHash)) {
        return fail("Current password is incorrect.", 400);
      }
      if (!newPassword || newPassword.length < 6) return fail("New password must be at least 6 characters.", 400);
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
      return ok({ updated: true });
    }

    return fail("Unknown auth action.", 400);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return ok({ user: null });
    return ok({ user: sanitize(user) });
  } catch (err) {
    return handleError(err);
  }
}

function sanitize(u: any) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}
