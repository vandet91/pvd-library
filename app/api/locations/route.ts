import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
});

export async function GET() {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { books: true } } },
  });
  return NextResponse.json(locations);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  try {
    const location = await prisma.location.create({ data: parsed.data });
    return NextResponse.json(location, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("Unique") ? "A location with this name already exists" : "Create failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
