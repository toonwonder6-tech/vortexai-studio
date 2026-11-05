import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { saveBuffer, extFromMime } from "@/lib/storage";
import { getSetting } from "@/lib/zai";
import { DEFAULT_SETTINGS } from "@/lib/zai";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET /api/assets?type=image&projectId=... */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const projectId = searchParams.get("projectId") || undefined;
    const limit = Math.min(100, Number(searchParams.get("limit") || 50));
    const assets = await db.asset.findMany({
      where: {
        userId: user.id,
        ...(type ? { type } : {}),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({ assets });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/assets — multipart upload of a reference image / audio / file. */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectId = (formData.get("projectId") as string) || null;
    const name = (formData.get("name") as string) || file?.name || "Upload";
    if (!file) return fail("No file provided.", 400);

    const maxMb = await getSetting("maxUploadMb", DEFAULT_SETTINGS.maxUploadMb);
    if (file.size > maxMb * 1024 * 1024) return fail(`File exceeds ${maxMb}MB upload limit.`, 413);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    const ext = extFromMime(file.type) || ".bin";
    const saved = await saveBuffer(buffer, ext, "upload");

    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
      ? "audio"
      : "file";

    const asset = await db.asset.create({
      data: {
        userId: user.id,
        projectId,
        type,
        name,
        filename: saved.filename,
        mimeType: file.type,
        size: saved.size,
        url: saved.url,
        source: "upload",
      },
    });
    return ok({ asset });
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/assets — rename an asset. Body: { id, name } */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);
    const { id, name } = await req.json();
    if (!id || !name) return fail("Asset id and new name are required.", 400);
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset || asset.userId !== user.id) return fail("Asset not found.", 404);
    const updated = await db.asset.update({
      where: { id },
      data: { name: String(name).slice(0, 200) },
    });
    return ok({ asset: updated });
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
    if (!id) return fail("Asset id required.", 400);
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset || asset.userId !== user.id) return fail("Asset not found.", 404);
    await db.asset.delete({ where: { id } });
    const { deleteMedia } = await import("@/lib/storage");
    await deleteMedia(asset.filename);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
