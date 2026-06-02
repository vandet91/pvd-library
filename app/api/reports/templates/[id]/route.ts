import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/** PATCH /api/reports/templates/[id] — update name, description, or sql */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { name, description, sql } = body;

  const existing = await prisma.queryTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.queryTemplate.update({
    where: { id },
    data: {
      ...(name        !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(sql         !== undefined && { sql: sql.trim() }),
    },
  });

  return NextResponse.json(updated);
}

/** DELETE /api/reports/templates/[id] */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  await prisma.queryTemplate.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
