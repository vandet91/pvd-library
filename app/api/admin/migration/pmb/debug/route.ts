import { NextRequest, NextResponse } from "next/server";
import { parsePmbDump } from "@/lib/pmb-parser";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sql } = await req.json() as { sql: string };
  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  // ── Raw table counts before any filtering ────────────────────────────────
  // Re-parse pret_archive raw to see ALL rows regardless of location_origine
  const pretArchiveAll  = dump.pret; // after our fix, this is already activeFromArchive
  // Count how many pret_archive rows exist with location_origine values
  // We need to inspect the raw parsed data

  const activeLoans = dump.pret;

  // Sample first 5 rows
  const pretSample = dump.pret.slice(0, 5).map((p) => ({
    pret_id:          p.pret_id,
    expl_id:          p.expl_id,
    notice_id:        p.notice_id,
    empr_id:          p.empr_id,
    pret_date:        p.pret_date,
    pret_retour:      p.pret_retour,
    location_origine: p.location_origine,
  }));

  // ── DB checks ─────────────────────────────────────────────────────────────
  const booksWithPmbId = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM "Book" WHERE "pmbNoticeId" IS NOT NULL`
  );
  const booksTotal = await prisma.book.count();

  const membersWithStudentId = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM "Member" WHERE "studentId" IS NOT NULL AND "studentId" != ''`
  );
  const membersTotal = await prisma.member.count();

  // ── Sample first active loan — trace full match path ─────────────────────
  let loanSample = null;
  if (activeLoans.length > 0) {
    const p = activeLoans[0];

    // notice_id: use direct field, or resolve via exemplaires
    const noticeId = p.notice_id > 0
      ? p.notice_id
      : dump.exemplaires.find((e) => e.exemplaire_id === p.expl_id)?.notice_id ?? -1;

    const book = noticeId > 0
      ? await prisma.$queryRawUnsafe<{ id: string; title: string; pmbNoticeId: number | null }[]>(
          `SELECT id, title, "pmbNoticeId" FROM "Book" WHERE "pmbNoticeId" = $1 LIMIT 1`, noticeId,
        )
      : [];

    const empr  = dump.empr.find((e) => e.empr_id === p.empr_id);
    const cb    = empr?.empr_cb?.trim() || null;
    const member = await prisma.$queryRawUnsafe<{ id: string; name: string; studentId: string | null; memberId: string }[]>(
      `SELECT id, name, "studentId", "memberId" FROM "Member"
       WHERE "studentId" = $1 OR "memberId" = $1 OR "memberId" = $2 LIMIT 1`,
      cb ?? "", `PMB-${p.empr_id}`,
    );

    loanSample = {
      pret_id:       p.pret_id,
      expl_id:       p.expl_id,
      empr_id:       p.empr_id,
      notice_id:     noticeId,
      location_origine: p.location_origine,
      emprCb:        cb,
      bookFound:     book[0] ?? null,
      memberFound:   member[0] ?? null,
    };
  }

  // ── Diagnosis ─────────────────────────────────────────────────────────────
  const nPmbBooks   = parseInt(booksWithPmbId[0]?.count ?? "0", 10);
  const nPmbMembers = parseInt(membersWithStudentId[0]?.count ?? "0", 10);

  const diagnosis: string[] = [
    dump.pret.length === 0
      ? "❌ No active loans parsed — pret_archive may be empty or arc_expl_location_origine is not '0'"
      : `✅ ${dump.pret.length} active loans found in pret_archive (location_origine='0')`,

    nPmbBooks === 0
      ? `❌ 0 of ${booksTotal} books have pmbNoticeId — run Backfill Notice IDs first`
      : `✅ ${nPmbBooks} of ${booksTotal} books have pmbNoticeId`,

    nPmbMembers === 0
      ? `❌ 0 of ${membersTotal} members have studentId — member matching will fail`
      : `✅ ${nPmbMembers} of ${membersTotal} members have studentId`,

    loanSample?.bookFound
      ? `✅ First loan book matched: "${loanSample.bookFound.title}"`
      : `❌ First loan book NOT found (noticeId=${loanSample?.notice_id}) — run Backfill Notice IDs`,

    loanSample?.memberFound
      ? `✅ First loan member matched: "${loanSample.memberFound.name}" (studentId=${loanSample.memberFound.studentId})`
      : `❌ First loan member NOT found (empr_cb=${loanSample?.emprCb}, empr_id=${loanSample?.empr_id})`,
  ];

  return NextResponse.json({
    parsed: {
      totalPretArchive: dump.pret.length,
      totalExemplaires: dump.exemplaires.length,
      totalNotices:     dump.notices.length,
      totalEmpr:        dump.empr.length,
      pretSample,
    },
    database: {
      booksTotal,
      booksWithPmbNoticeId: nPmbBooks,
      membersTotal,
      membersWithStudentId: nPmbMembers,
    },
    loanSample,
    diagnosis,
  });
}
