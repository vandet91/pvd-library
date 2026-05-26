import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateMemberId } from "@/lib/utils";
import { z } from "zod";
import { can } from "@/lib/rbac";

const memberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  memberType: z.enum(["STUDENT", "TEACHER", "STAFF", "PUBLIC"]).default("STUDENT"),
  expireDate: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  const members = await prisma.member.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { memberId: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {},
    include: {
      _count: {
        select: {
          // Count only currently active/overdue loans (not full history)
          loans: { where: { status: { in: ["ACTIVE", "OVERDUE"] } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach hasOverdue flag for the circulation page
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

  return NextResponse.json(withOverdue);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = memberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { expireDate, email, ...rest } = parsed.data;
  const member = await prisma.member.create({
    data: {
      ...rest,
      email: email || undefined,
      memberId: generateMemberId(),
      expireDate: expireDate ? new Date(expireDate) : undefined,
    },
  });

  return NextResponse.json(member, { status: 201 });
}
