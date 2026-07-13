import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { z } from "zod";

const portalSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/**
 * POST /api/members/[id]/portal
 * Creates or updates the portal (User) account linked to a member.
 * - If the member already has a linked User, updates the password.
 * - If not, creates a new User with role MEMBER and links it.
 * Requires LIBRARIAN or higher.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await request.json();
  const parsed = portalSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const member = await prisma.member.findUnique({
    where:   { id },
    include: { user: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const hashed = await bcrypt.hash(parsed.data.password, 12);

  if (member.user) {
    // Update existing linked user's password
    await prisma.user.update({
      where: { id: member.user.id },
      data:  { password: hashed },
    });
    return NextResponse.json({ action: "updated", userId: member.user.id });
  }

  // Create new User account; use member email if available, otherwise generate a placeholder
  const email =
    member.email ??
    `member-${member.memberId.toLowerCase().replace(/[^a-z0-9]/g, "")}@pvd-library.internal`;

  // Check for email conflict
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Link existing user instead
    await prisma.member.update({
      where: { id },
      data:  { userId: existing.id },
    });
    await prisma.user.update({
      where: { id: existing.id },
      data:  { password: hashed, role: "MEMBER" },
    });
    return NextResponse.json({ action: "linked", userId: existing.id });
  }

  const user = await prisma.user.create({
    data: {
      name:     member.name,
      email,
      password: hashed,
      role:     "MEMBER",
    },
  });

  await prisma.member.update({
    where: { id },
    data:  { userId: user.id },
  });

  return NextResponse.json({ action: "created", userId: user.id }, { status: 201 });
}
