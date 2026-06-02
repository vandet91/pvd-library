import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { generateMemberId } from "@/lib/utils";

/** System ID format: MEM-YYYY-XXXX */
const SYSTEM_ID_RE = /^MEM-\d{4}-\d{4}$/;

function isSystemId(id: string): boolean {
  return SYSTEM_ID_RE.test(id);
}

/** GET — return all members whose ID is not in system format */
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = await prisma.member.findMany({
    select: { id: true, memberId: true, name: true, memberType: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const nonSystem = all.filter((m) => !isSystemId(m.memberId));

  return NextResponse.json({
    count:   nonSystem.length,
    total:   all.length,
    members: nonSystem,
  });
}

/** POST — regenerate memberIds for all non-system-format members */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { dryRun = false } = (await req.json().catch(() => ({}))) as { dryRun?: boolean };

  const all = await prisma.member.findMany({
    select: { id: true, memberId: true, name: true },
  });

  const targets  = all.filter((m) => !isSystemId(m.memberId));
  const existing = new Set(all.map((m) => m.memberId));

  if (targets.length === 0)
    return NextResponse.json({ updated: 0, skipped: 0, dryRun, changes: [] });

  const changes: { id: string; oldId: string; newId: string; name: string }[] = [];
  let updated = 0;
  let skipped = 0;

  for (const m of targets) {
    let newId    = generateMemberId();
    let attempts = 0;
    while (existing.has(newId) && attempts < 20) {
      newId = generateMemberId();
      attempts++;
    }

    if (existing.has(newId)) { skipped++; continue; }

    changes.push({ id: m.id, oldId: m.memberId, newId, name: m.name });
    existing.add(newId);
    existing.delete(m.memberId);

    if (!dryRun) {
      await prisma.member.update({ where: { id: m.id }, data: { memberId: newId } });
      updated++;
    }
  }

  return NextResponse.json({
    updated:  dryRun ? 0 : updated,
    skipped,
    dryRun,
    changes,
  });
}
