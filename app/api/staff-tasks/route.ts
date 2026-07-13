import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { z } from "zod";

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority:    z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category:    z.string().max(50).optional(),
  dueDate:     z.string().datetime().optional().nullable(),
  relatedId:   z.string().optional(),
  relatedType: z.string().max(50).optional(),
  createdByAI: z.boolean().default(false),
  aiContext:   z.string().max(1000).optional(),
  assignedToId:z.string().optional(),
});

/**
 * GET /api/staff-tasks
 *   ?status=PENDING|IN_PROGRESS|DONE|CANCELLED|all (default: pending+in_progress)
 *   ?priority=URGENT|HIGH|MEDIUM|LOW
 *   ?aiOnly=true
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") ?? "active";
  const priority    = searchParams.get("priority") ?? undefined;
  const aiOnly      = searchParams.get("aiOnly") === "true";

  const statusFilter =
    statusParam === "all"     ? undefined :
    statusParam === "active"  ? { in: ["PENDING", "IN_PROGRESS"] as ("PENDING" | "IN_PROGRESS")[] } :
    statusParam === "done"    ? { in: ["DONE", "CANCELLED"]      as ("DONE" | "CANCELLED")[] } :
    { equals: statusParam as "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED" };

  const tasks = await prisma.staffTask.findMany({
    where: {
      ...(statusFilter && { status: statusFilter }),
      ...(priority     && { priority: priority as never }),
      ...(aiOnly       && { createdByAI: true }),
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: [
      { priority: "desc" },   // URGENT > HIGH > MEDIUM > LOW
      { createdAt: "desc" },
    ],
  });

  // Also return counts for the badge
  const [pendingCount, inProgressCount, doneCount] = await Promise.all([
    prisma.staffTask.count({ where: { status: "PENDING"     } }),
    prisma.staffTask.count({ where: { status: "IN_PROGRESS" } }),
    prisma.staffTask.count({ where: { status: "DONE"        } }),
  ]);

  return NextResponse.json({
    tasks,
    counts: { pending: pendingCount, inProgress: inProgressCount, done: doneCount },
  });
}

/**
 * POST /api/staff-tasks — create a new task
 * Called by: AI assistant (createdByAI=true) or staff manually (createdByAI=false)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const { dueDate, ...rest } = parsed.data;

  const task = await prisma.staffTask.create({
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(task, { status: 201 });
}
