import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

/* GET /api/inventory — list all sessions, newest first */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const inventories = await prisma.inventory.findMany({
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json(inventories);
}

/* POST /api/inventory — create a new session (only one ACTIVE allowed) */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name: string | undefined = body.name;
  const notes: string | null     = body.notes ?? null;

  if (!name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const active = await prisma.inventory.findFirst({ where: { status: "ACTIVE" } });
  if (active)
    return NextResponse.json(
      { error: "An inventory session is already active. Complete or cancel it first." },
      { status: 409 },
    );

  const inv = await prisma.inventory.create({
    data: { name: name.trim(), notes },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json(inv, { status: 201 });
}
