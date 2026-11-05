import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { db } from "@/lib/db";
import { getLimits } from "@/lib/limits";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();

    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalProjects, totalJobs, totalAssets, activeUsers7d] = await Promise.all([
      db.user.count(),
      db.project.count({ where: { status: { not: "deleted" } } }),
      db.generationJob.count(),
      db.asset.count(),
      db.user.count({ where: { createdAt: { gte: since7d } } }),
    ]);

    const usageByType = await db.usageLog.groupBy({ by: ["type"], _count: true });
    const usageByStatus = await db.usageLog.groupBy({ by: ["status"], _count: true });
    const usageByModel = await db.usageLog.groupBy({
      by: ["model"],
      where: { model: { not: null } },
      _count: true,
      orderBy: { _count: { model: "desc" } },
      take: 10,
    });

    const jobsByStatus = await db.generationJob.groupBy({ by: ["status"], _count: true });
    const jobsByType = await db.generationJob.groupBy({ by: ["type"], _count: true });

    // Daily request counts for the last 14 days
    const dailyRowsRaw = await db.$queryRaw<{ day: string; total: bigint; success: bigint; failed: bigint }[]>`
      SELECT date(createdAt) as day,
             COUNT(*) as total,
             SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
      FROM UsageLog
      WHERE createdAt >= ${since30d}
      GROUP BY date(createdAt)
      ORDER BY day DESC
      LIMIT 14
    `;
    const dailyRows = dailyRowsRaw.map((d) => ({
      day: d.day,
      total: Number(d.total),
      success: Number(d.success),
      failed: Number(d.failed),
    }));

    const storageAgg = await db.asset.aggregate({ _sum: { size: true } });

    const recentJobs = await db.generationJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true, name: true } } },
    });

    return ok({
      totals: {
        totalUsers,
        totalProjects,
        totalJobs,
        totalAssets,
        activeUsers7d,
        storageBytes: Number(storageAgg._sum.size || 0),
      },
      usageByType: usageByType.map((u) => ({ type: u.type, _count: Number(u._count) })),
      usageByStatus: usageByStatus.map((u) => ({ status: u.status, _count: Number(u._count) })),
      usageByModel: usageByModel.map((u) => ({ model: u.model, _count: Number(u._count) })),
      jobsByStatus: jobsByStatus.map((j) => ({ status: j.status, _count: Number(j._count) })),
      jobsByType: jobsByType.map((j) => ({ type: j.type, _count: Number(j._count) })),
      daily: dailyRows,
      recentJobs,
      limits: await getLimits(),
    });
  } catch (err) {
    return handleError(err);
  }
}
