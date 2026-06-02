import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export interface DupGroup {
  key:     string;          // name used to group
  members: DupMember[];
}

export interface DupMember {
  id:         string;
  memberId:   string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  memberType: string;
  joinDate:   string;
  expireDate: string | null;
  isActive:   boolean;
  loanCount:  number;
  fineCount:  number;
}

// ── GET — find duplicate groups ───────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await prisma.member.findMany({
    select: {
      id: true, memberId: true, name: true,
      email: true, phone: true, memberType: true,
      joinDate: true, expireDate: true, isActive: true,
      _count: { select: { loans: true, fines: true } },
    },
    orderBy: { name: "asc" },
  });

  // Group by normalised name (lowercase, trimmed, collapse spaces)
  const byName = new Map<string, typeof members>();
  for (const m of members) {
    const key = m.name.toLowerCase().trim().replace(/\s+/g, " ");
    const list = byName.get(key) ?? [];
    list.push(m);
    byName.set(key, list);
  }

  const groups: DupGroup[] = [];
  for (const [key, list] of byName.entries()) {
    if (list.length < 2) continue;
    groups.push({
      key,
      members: list.map((m) => ({
        id:         m.id,
        memberId:   m.memberId,
        name:       m.name,
        email:      m.email,
        phone:      m.phone,
        memberType: m.memberType,
        joinDate:   m.joinDate.toISOString(),
        expireDate: m.expireDate?.toISOString() ?? null,
        isActive:   m.isActive,
        loanCount:  m._count.loans,
        fineCount:  m._count.fines,
      })),
    });
  }

  // Sort: most duplicates first
  groups.sort((a, b) => b.members.length - a.members.length);

  const totalDuplicates = groups.reduce((s, g) => s + g.members.length - 1, 0);

  return NextResponse.json({ groups, totalDuplicates, totalGroups: groups.length });
}

// ── POST — merge or delete ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:    "delete" | "delete-all-empty";
    keepId?:   string;   // member to keep (for merge)
    deleteIds?: string[]; // members to delete
  };

  switch (body.action) {

    // Delete specific duplicate members (only if they have no loans/fines)
    case "delete": {
      if (!body.deleteIds?.length)
        return NextResponse.json({ error: "deleteIds required" }, { status: 400 });

      let deleted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const id of body.deleteIds) {
        const m = await prisma.member.findUnique({
          where:  { id },
          select: { id: true, name: true, memberId: true, _count: { select: { loans: true, fines: true } } },
        });
        if (!m) continue;

        if (m._count.loans > 0 || m._count.fines > 0) {
          errors.push(`${m.name} (${m.memberId}) has ${m._count.loans} loan(s) / ${m._count.fines} fine(s) — skipped`);
          skipped++;
          continue;
        }

        // Safe to delete — no linked data
        await prisma.member.delete({ where: { id } });
        deleted++;
      }

      return NextResponse.json({ deleted, skipped, errors });
    }

    // Bulk delete ALL duplicate members that have 0 loans and 0 fines
    case "delete-all-empty": {
      const members = await prisma.member.findMany({
        select: {
          id: true, name: true, memberId: true, joinDate: true,
          _count: { select: { loans: true, fines: true } },
        },
        orderBy: { name: "asc" },
      });

      // Group by normalised name
      const byName = new Map<string, typeof members>();
      for (const m of members) {
        const key = m.name.toLowerCase().trim().replace(/\s+/g, " ");
        const list = byName.get(key) ?? [];
        list.push(m);
        byName.set(key, list);
      }

      let deleted = 0;
      let skipped = 0;

      for (const list of byName.values()) {
        if (list.length < 2) continue;

        // Keep the one with activity (loans/fines), or the earliest joinDate
        const sorted = [...list].sort((a, b) => {
          const aScore = a._count.loans + a._count.fines;
          const bScore = b._count.loans + b._count.fines;
          if (bScore !== aScore) return bScore - aScore; // most active first
          return a.joinDate.getTime() - b.joinDate.getTime(); // oldest first
        });

        const [_keep, ...dupes] = sorted;

        for (const d of dupes) {
          if (d._count.loans > 0 || d._count.fines > 0) {
            skipped++;
            continue;
          }
          try {
            await prisma.member.delete({ where: { id: d.id } });
            deleted++;
          } catch { skipped++; }
        }
      }

      return NextResponse.json({ deleted, skipped });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
