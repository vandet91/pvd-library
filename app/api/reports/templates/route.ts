import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/** GET /api/reports/templates — list all saved templates */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const templates = await prisma.queryTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(templates);
}

/** POST /api/reports/templates — create a new template */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { name, description, sql } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!sql?.trim())  return NextResponse.json({ error: "SQL is required" },  { status: 400 });

  const template = await prisma.queryTemplate.create({
    data: {
      name:        name.trim(),
      description: description?.trim() || null,
      sql:         sql.trim(),
      createdById: session.user?.id ?? null,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
