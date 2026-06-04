import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  memberType: z.enum(["STUDENT", "TEACHER", "STAFF", "PUBLIC"]).optional(),
  gender: z.enum(["MALE", "FEMALE", "UNSPECIFIED"]).optional(),
  expireDate: z.string().optional(),
  isActive: z.boolean().optional(),
  studentId: z.string().optional(),
  school: z.string().optional(),
  className: z.string().optional(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      loans: { include: { book: true, fines: true }, orderBy: { createdAt: "desc" } },
      fines: { include: { loan: { include: { book: true } } }, orderBy: { createdAt: "desc" } },
      reservations: {
        where: { status: { in: ["PENDING", "APPROVED", "READY"] } },
        select: { id: true, status: true },
      },
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(member);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { expireDate, email, ...rest } = parsed.data;

  // Capture before state for diff
  const before = await prisma.member.findUnique({ where: { id } });

  const member = await prisma.member.update({
    where: { id },
    data: {
      ...rest,
      email:      email || undefined,
      expireDate: expireDate ? new Date(expireDate) : undefined,
      // Activating a member automatically clears any pending-approval flag
      ...(rest.isActive === true ? { pendingApproval: false } : {}),
    },
  });

  // Pick the most descriptive action label
  const action =
    rest.isActive === true  && before?.isActive === false ? Actions.MEMBER_APPROVED   :
    rest.isActive === false && before?.isActive === true  ? Actions.MEMBER_DEACTIVATED :
    Actions.MEMBER_UPDATED;

  await logActivity(actorFromSession(session), action, {
    entityType: "Member",
    entityId:   member.id,
    entityName: member.name,
    detail: {
      before: before
        ? { isActive: before.isActive, memberType: before.memberType, email: before.email }
        : undefined,
      after: { isActive: member.isActive, memberType: member.memberType, email: member.email },
    },
  });

  return NextResponse.json(member);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findUnique({ where: { id } });
  await prisma.member.delete({ where: { id } });
  await logActivity(actorFromSession(session), Actions.MEMBER_DELETED, {
    entityType: "Member",
    entityId:   id,
    entityName: member?.name,
    detail:     { memberId: member?.memberId },
  });
  return NextResponse.json({ success: true });
}
