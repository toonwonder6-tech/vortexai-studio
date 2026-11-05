import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { getAllSettings, setSetting } from "@/lib/zai";
import { DEFAULT_SETTINGS } from "@/lib/zai";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const settings = await getAllSettings();
    // Merge with defaults so the admin UI always sees every field
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    return ok({ settings: merged, defaults: DEFAULT_SETTINGS });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const allowed = [
      "maintenanceMode",
      "allowRegistration",
      "maxUploadMb",
      "storageLimitMb",
      "maxConcurrentJobs",
      "dailyVideoLimit",
      "dailyImageLimit",
      "dailyTextLimit",
      "defaultVideoModel",
      "defaultImageModel",
      "defaultTextModel",
      "defaultAudioModel",
      "announcement",
    ];
    for (const key of allowed) {
      if (key in body) await setSetting(key, body[key]);
    }
    const settings = await getAllSettings();
    return ok({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (err) {
    return handleError(err);
  }
}
