import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priority:    z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status:      z.enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  category:    z.string().max(50).optional().nullable(),
  dueDate:     z.string().datetime().optional().nullable(),
  assignedToId:z.string().optional().nullable(),
});

/** PATCH /api/staff-tasks/[id] — update fields or mark done/in-progress/cancelled */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body   = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const { dueDate, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  if (dueDate !== undefined) {
    data.dueDate = dueDate ? new Date(dueDate) : null;
  }
  // Set completedAt when marking DONE
  if (parsed.data.status === "DONE")       data.completedAt = new Date();
  if (parsed.data.status === "IN_PROGRESS") data.completedAt = null;
  if (parsed.data.status === "PENDING")     data.completedAt = null;

  const task = await prisma.staffTask.update({
    where: { id },
    data:  data as never,
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  }).catch(() => null);

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(task);
}

/** DELETE /api/staff-tasks/[id] */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.staffTask.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
