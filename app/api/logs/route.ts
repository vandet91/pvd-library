import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q          = searchParams.get("q")          || "";
  const action     = searchParams.get("action")     || "";
  const entityType = searchParams.get("entityType") || "";
  const from       = searchParams.get("from");
  const to         = searchParams.get("to");
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));
  const skip  = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (action)     where.action     = { contains: action,     mode: "insensitive" };
  if (entityType) where.entityType = entityType;

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
    };
  }

  if (q) {
    where.OR = [
      { entityName: { contains: q, mode: "insensitive" } },
      { actorName:  { contains: q, mode: "insensitive" } },
      { action:     { contains: q, mode: "insensitive" } },
    ];
    // Combine with existing filters (AND)
    if (action || entityType || from || to) {
      const { OR, ...rest } = where;
      Object.assign(where, { AND: [rest, { OR }] });
      delete where.OR;
      delete where.action;
      delete where.entityType;
      delete where.createdAt;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const before = searchParams.get("before"); // ISO date — delete all logs before this date

  if (before) {
    const result = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: new Date(before) } },
    });
    return NextResponse.json({ deleted: result.count });
  }

  // Delete all
  const result = await prisma.activityLog.deleteMany({});
  return NextResponse.json({ deleted: result.count });
}
