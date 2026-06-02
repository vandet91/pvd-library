import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { z } from "zod";

const applySchema = z.object({
  action:           z.enum(["apply", "lift"]),
  restrictionStatus: z.enum(["NONE", "IN_LIBRARY_ONLY", "SUSPENDED", "BLOCKED", "BLACKLISTED"]).optional(),
  reason:           z.string().min(1).max(1000).optional(),
  expiryDate:       z.string().optional(), // ISO date string, null = permanent
});

/** GET — return current restriction info for this member */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const member = await prisma.member.findUnique({
    where:  { id },
    select: {
      id: true, name: true, memberId: true,
      restrictionStatus: true, restrictionReason: true,
      restrictedAt: true, restrictedBy: true, restrictionExpiry: true,
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(member);
}

/** POST — apply or lift a restriction */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors.map((e) => e.message).join(", ") }, { status: 400 });

  const { action, restrictionStatus, reason, expiryDate } = parsed.data;

  const before = await prisma.member.findUnique({
    where:  { id },
    select: { name: true, memberId: true, restrictionStatus: true },
  });
  if (!before) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  let updateData: Record<string, unknown>;

  if (action === "lift") {
    updateData = {
      restrictionStatus: "NONE",
      restrictionReason: null,
      restrictedAt:      null,
      restrictedBy:      null,
      restrictionExpiry: null,
    };
  } else {
    if (!restrictionStatus || restrictionStatus === "NONE")
      return NextResponse.json({ error: "restrictionStatus required for apply action" }, { status: 400 });
    if (!reason)
      return NextResponse.json({ error: "reason required" }, { status: 400 });

    updateData = {
      restrictionStatus,
      restrictionReason: reason,
      restrictedAt:      new Date(),
      restrictedBy:      session.user?.name ?? session.user?.email ?? "Staff",
      restrictionExpiry: expiryDate ? new Date(expiryDate) : null,
    };
  }

  const updated = await prisma.member.update({ where: { id }, data: updateData });

  await logActivity(actorFromSession(session),
    action === "lift" ? Actions.MEMBER_RESTRICTION_LIFTED : Actions.MEMBER_RESTRICTED,
    {
      entityType: "Member",
      entityId:   id,
      entityName: before.name,
      detail: {
        before: { status: before.restrictionStatus },
        after:  { status: updated.restrictionStatus },
        reason: reason ?? null,
        expiry: expiryDate ?? null,
      },
    }
  );

  return NextResponse.json(updated);
}
