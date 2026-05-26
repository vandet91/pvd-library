import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/** GET /api/admin/notifications?limit=50&type=OVERDUE&status=FAILED */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const type   = searchParams.get("type")   || undefined;
  const status = searchParams.get("status") || undefined;

  const notifications = await prisma.notification.findMany({
    where: {
      ...(type   && { type:   type   as "DUE_SOON" | "OVERDUE" | "RESERVATION_READY" | "TEST" }),
      ...(status && { status: status as "PENDING" | "SENT" | "FAILED" | "SKIPPED" }),
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
  });

  // Summary counts in the same response so the UI doesn't need a second roundtrip
  const [totalSent, totalFailed, last24h] = await Promise.all([
    prisma.notification.count({ where: { status: "SENT" } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
  ]);

  return NextResponse.json({
    notifications,
    summary: { totalSent, totalFailed, last24h },
  });
}
