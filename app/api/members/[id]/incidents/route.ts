import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { logActivity, actorFromSession, Actions } from "@/lib/activity-log";
import { z } from "zod";

const createSchema = z.object({
  type:        z.enum(["BOOK_DAMAGE", "BOOK_LOST", "REPEATED_LATE", "BEHAVIORAL", "POLICY_VIOLATION", "OTHER"]),
  description: z.string().min(1).max(2000),
  severity:    z.number().int().min(1).max(3).default(1),
});

const resolveSchema = z.object({
  resolution: z.string().min(1).max(2000),
});

/** GET — list all incidents for this member */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const incidents = await prisma.memberIncident.findMany({
    where:   { memberId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(incidents);
}

/** POST — log a new incident */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { id }, select: { name: true } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const incident = await prisma.memberIncident.create({
    data: {
      memberId:    id,
      type:        parsed.data.type,
      description: parsed.data.description,
      severity:    parsed.data.severity,
      actorName:   session.user?.name ?? session.user?.email ?? "Staff",
    },
  });

  await logActivity(actorFromSession(session), Actions.MEMBER_INCIDENT_LOGGED, {
    entityType: "Member",
    entityId:   id,
    entityName: member.name,
    detail:     { incidentId: incident.id, type: incident.type, severity: incident.severity },
  });

  return NextResponse.json(incident, { status: 201 });
}

/** PATCH — resolve an incident (body: { incidentId, resolution }) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { incidentId, resolution } = await request.json();
  if (!incidentId) return NextResponse.json({ error: "incidentId required" }, { status: 400 });

  const parsed = resolveSchema.safeParse({ resolution });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const incident = await prisma.memberIncident.update({
    where: { id: incidentId, memberId: id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: session.user?.name ?? "Staff",
      resolution: parsed.data.resolution,
    },
  });

  await logActivity(actorFromSession(session), Actions.MEMBER_INCIDENT_RESOLVED, {
    entityType: "Member",
    entityId:   id,
    entityName: undefined,
    detail:     { incidentId, resolution: parsed.data.resolution },
  });

  return NextResponse.json(incident);
}
