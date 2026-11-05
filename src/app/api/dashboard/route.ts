import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getLimits, getDailyCounts } from "@/lib/limits";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return fail("You must be signed in.", 401);

    const [projects, jobs, assets, recentJobs, recentActivity] = await Promise.all([
      db.project.count({ where: { userId: user.id, status: { not: "deleted" } } }),
      db.generationJob.count({ where: { userId: user.id } }),
      db.asset.count({ where: { userId: user.id } }),
      db.generationJob.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { project: true },
      }),
      db.activityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

    const byType = await db.generationJob.groupBy({
      by: ["type"],
      where: { userId: user.id },
      _count: true,
    });
    const byStatus = await db.generationJob.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: true,
    });

    const videoCount = byType.find((b) => b.type === "video")?._count || 0;
    const imageCount = await db.asset.count({ where: { userId: user.id, type: "image" } });
    const audioCount = await db.asset.count({ where: { userId: user.id, type: "audio" } });
    const completedJobs = byStatus.find((b) => b.status === "completed")?._count || 0;
    const processingJobs = (byStatus.find((b) => b.status === "processing")?._count || 0) +
      (byStatus.find((b) => b.status === "submitted")?._count || 0) +
      (byStatus.find((b) => b.status === "waiting")?._count || 0);

    const limits = await getLimits();
    const daily = await getDailyCounts(user.id);

    // Storage usage (sum of asset sizes)
    const sizeAgg = await db.asset.aggregate({ where: { userId: user.id }, _sum: { size: true } });
    const storageBytes = Number(sizeAgg._sum.size || 0);

    return ok({
      stats: {
        projects,
        jobs,
        assets,
        videoCount,
        imageCount,
        audioCount,
        completedJobs,
        processingJobs,
        storageBytes,
        storageLimitBytes: limits.storageLimitMb * 1024 * 1024,
      },
      limits,
      daily,
      recentJobs,
      recentActivity,
    });
  } catch (err) {
    return handleError(err);
  }
}
