import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name:     z.string().min(1),
  nameKm:   z.string().optional().nullable(),
  address:  z.string().optional().nullable(),
  phone:    z.string().optional().nullable(),
  email:    z.string().email().optional().nullable().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { books: true, copies: true, loans: true } },
    },
  });
  return NextResponse.json(branches);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  try {
    const branch = await prisma.branch.create({
      data: { ...parsed.data, email: parsed.data.email || null },
    });
    return NextResponse.json(branch, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("Unique")
      ? "A branch with this name already exists"
      : "Create failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
