import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateMemberId } from "@/lib/utils";

const patchSchema = z.object({
  role:        z.enum(["ADMIN", "LIBRARIAN", "STAFF", "MEMBER"]).optional(),
  password:    z.string().min(8, "Password must be at least 8 characters").optional(),
  name:        z.string().min(1, "Name cannot be empty").optional(),
  email:       z.string().email("Invalid email address").optional(),
  // Per-user preferences (admin-writable)
  theme:       z.enum(["ocean", "midnight", "emerald"]).nullable().optional(),
  authStyle:   z.enum(["split", "glass", "minimal"]).nullable().optional(),
  authMethods: z.string().optional(),   // raw JSON — validated loosely here
}).refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  { message: "Provide at least one field to update" },
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (session.user.id === id && (await request.clone().json()).role !== undefined)
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });

  const body   = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Guard: prevent demoting the last remaining admin
  if (parsed.data.role && parsed.data.role !== "ADMIN") {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1)
        return NextResponse.json(
          { error: "Cannot change the last admin's role. Promote another user to Admin first." },
          { status: 400 },
        );
    }
  }

  const updateData: {
    role?:        "ADMIN" | "LIBRARIAN" | "STAFF" | "MEMBER";
    password?:    string;
    name?:        string;
    email?:       string;
    theme?:       string | null;
    authStyle?:   string | null;
    authMethods?: string;
  } = {};
  if (parsed.data.role                  ) updateData.role        = parsed.data.role;
  if (parsed.data.password              ) updateData.password    = await bcrypt.hash(parsed.data.password, 12);
  if (parsed.data.name  !== undefined   ) updateData.name        = parsed.data.name;
  if (parsed.data.email !== undefined   ) updateData.email       = parsed.data.email;
  if (parsed.data.theme !== undefined   ) updateData.theme       = parsed.data.theme;
  if (parsed.data.authStyle !== undefined) updateData.authStyle  = parsed.data.authStyle;
  if (parsed.data.authMethods !== undefined) updateData.authMethods = parsed.data.authMethods;

  try {
    const user = await prisma.user.update({
      where: { id },
      data:  updateData,
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        member: { select: { memberId: true, memberType: true, isActive: true } },
      },
    });

    // If role was just changed to MEMBER, ensure a Member (library card) record exists
    if (parsed.data.role === "MEMBER" && !user.member) {
      const memberName = user.name || user.email.split("@")[0];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const created = await prisma.member.create({
            data: {
              memberId:   generateMemberId(),
              userId:     id,
              name:       memberName,
              email:      user.email,
              memberType: "STUDENT",
            },
            select: { memberId: true, memberType: true, isActive: true },
          });
          return NextResponse.json({ ...user, member: created });
        } catch (err: unknown) {
          if ((err as { code?: string }).code !== "P2002" || attempt === 1) throw err;
        }
      }
    }

    return NextResponse.json(user);
  } catch (err: unknown) {
    // Unique constraint violation — email already in use
    if ((err as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "Email is already in use by another account" }, { status: 409 });
    throw err;
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (session.user.id === id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
