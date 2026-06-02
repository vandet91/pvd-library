import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateMemberId } from "@/lib/utils";
import { z } from "zod";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const memberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  memberType: z.enum(["STUDENT", "TEACHER", "STAFF", "PUBLIC"]).default("STUDENT"),
  gender: z.enum(["MALE", "FEMALE", "UNSPECIFIED"]).default("UNSPECIFIED"),
  expireDate: z.string().optional(),
  studentId: z.string().optional(),
  school: z.string().optional(),
  className: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query  = searchParams.get("q") || "";
  const status = searchParams.get("status"); // "active" | "pending" | null = all

  // ?counts=true → return stat-card numbers
  if (searchParams.get("counts") === "true") {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const [total, active, newThisMonth] = await Promise.all([
      prisma.member.count(),
      prisma.member.count({ where: { isActive: true } }),
      prisma.member.count({ where: { createdAt: { gte: firstOfMonth } } }),
    ]);
    // Isolated so a stale Prisma client (pendingApproval not yet generated)
    // doesn't bring down the other three counts.
    const pending = await prisma.member.count({ where: { pendingApproval: true } })
      .catch(() => prisma.member.count({ where: { isActive: false, userId: { not: null } } }));
    return NextResponse.json({ total, active, pending, newThisMonth });
  }

  // Pagination
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10")));
  const skip  = (page - 1) * limit;

  const statusFilter =
    status === "active"  ? { isActive: true }       :
    status === "pending" ? { pendingApproval: true } :
    {};

  const where = query
    ? {
        ...statusFilter,
        OR: [
          { name:     { contains: query, mode: "insensitive" as const } },
          { memberId: { contains: query, mode: "insensitive" as const } },
          { email:    { contains: query, mode: "insensitive" as const } },
        ],
      }
    : statusFilter;

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: {
        _count: {
          select: {
            loans: { where: { status: { in: ["ACTIVE", "OVERDUE"] } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);

  // Attach hasOverdue flag
  const overdueIds = members.length
    ? await prisma.loan.findMany({
        where: {
          memberId: { in: members.map((m) => m.id) },
          status: "OVERDUE",
        },
        select: { memberId: true },
      }).then((rows) => new Set(rows.map((r) => r.memberId)))
    : new Set<string>();

  const withOverdue = members.map((m) => ({
    ...m,
    hasOverdue: overdueIds.has(m.id),
  }));

  return NextResponse.json({ members: withOverdue, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { expireDate, email, ...rest } = parsed.data;
  const member = await prisma.member.create({
    data: {
      ...rest,
      email: email || undefined,
      memberId: generateMemberId(),
      expireDate: expireDate ? new Date(expireDate) : undefined,
    },
  });

  await logActivity(actorFromSession(session), Actions.MEMBER_CREATED, {
    entityType: "Member",
    entityId:   member.id,
    entityName: member.name,
    detail:     { memberId: member.memberId, memberType: member.memberType },
  });

  return NextResponse.json(member, { status: 201 });
}
