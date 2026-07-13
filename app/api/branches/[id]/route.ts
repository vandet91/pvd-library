import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const updateSchema = z.object({
  name:     z.string().min(1).optional(),
  nameKm:   z.string().optional().nullable(),
  address:  z.string().optional().nullable(),
  phone:    z.string().optional().nullable(),
  email:    z.string().email().optional().nullable().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: { ...parsed.data, email: parsed.data.email || null },
    });
    return NextResponse.json(branch);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [bookCount, copyCount, loanCount] = await Promise.all([
    prisma.book.count({ where: { branchId: id } }),
    prisma.bookCopy.count({ where: { branchId: id } }),
    prisma.loan.count({ where: { branchId: id } }),
  ]);

  const total = bookCount + copyCount + loanCount;
  if (total > 0) {
    return NextResponse.json({
      error: `Cannot delete — branch has ${bookCount} book(s), ${copyCount} cop(ies), ${loanCount} loan(s). Reassign them first.`,
    }, { status: 409 });
  }

  await prisma.branch.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
