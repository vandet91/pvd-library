import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { generateMemberIdFromSettings } from "@/lib/member-id";

/**
 * GET  — returns all members (so staff can see current IDs before regenerating)
 * POST — regenerates IDs for targeted members using the current format from Settings
 *
 * POST body:
 *   dryRun    boolean   — preview only, no DB writes (default true)
 *   scope     "all" | "pattern"  — "all" = every member, "pattern" = only those matching oldPattern
 *   oldPattern string  — regex/prefix to match against current memberId (used when scope="pattern")
 */

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [members, fmtRow] = await Promise.all([
    prisma.member.findMany({
      select: { id: true, memberId: true, name: true, memberType: true, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.settings.findUnique({ where: { key: "MEMBER_ID_FORMAT" } }),
  ]);

  return NextResponse.json({
    total:        members.length,
    members,
    currentFormat: fmtRow?.value ?? "MEM-{YYYY}-{RAND4}",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    dryRun?:    boolean;
    scope?:     "all" | "pattern";
    oldPattern?: string;
  };

  const dryRun     = body.dryRun !== false;   // safe default: true
  const scope      = body.scope ?? "all";
  const oldPattern = body.oldPattern?.trim();

  const all      = await prisma.member.findMany({ select: { id: true, memberId: true, name: true } });
  const existing = new Set(all.map((m) => m.memberId));

  /* ── Determine targets ── */
  let targets = all;
  if (scope === "pattern" && oldPattern) {
    try {
      const re = new RegExp(oldPattern, "i");
      targets = all.filter((m) => re.test(m.memberId));
    } catch {
      return NextResponse.json({ error: "Invalid regex pattern" }, { status: 400 });
    }
  }

  if (targets.length === 0)
    return NextResponse.json({ updated: 0, skipped: 0, dryRun, changes: [] });

  const changes: { id: string; oldId: string; newId: string; name: string }[] = [];
  let updated = 0;
  let skipped = 0;

  for (const m of targets) {
    let newId    = await generateMemberIdFromSettings();
    let attempts = 0;
    /* Retry on collision (remove own ID from set so it doesn't self-collide) */
    const setWithoutSelf = new Set(existing);
    setWithoutSelf.delete(m.memberId);
    while (setWithoutSelf.has(newId) && attempts < 20) {
      newId = await generateMemberIdFromSettings();
      attempts++;
    }
    if (setWithoutSelf.has(newId)) { skipped++; continue; }

    changes.push({ id: m.id, oldId: m.memberId, newId, name: m.name });
    existing.add(newId);
    existing.delete(m.memberId);

    if (!dryRun) {
      await prisma.member.update({ where: { id: m.id }, data: { memberId: newId } });
      updated++;
    }
  }

  return NextResponse.json({ updated: dryRun ? 0 : updated, skipped, dryRun, changes });
}
