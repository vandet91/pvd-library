import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  parsePmbDump, mapMaterialType, mapLanguage, mapMemberType,
  type PmbDump,
} from "@/lib/pmb-parser";
import { stripIsbn } from "@/lib/isbn-format";
import { getBarcodeSettings } from "@/lib/barcode";

// ── POST: preview OR full migration ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { sql: string; options?: MigrateOptions };
  const { sql, options = {} } = body;

  if (!sql || sql.length < 100)
    return NextResponse.json({ error: "Invalid SQL dump" }, { status: 400 });

  const dump = parsePmbDump(sql);

  if (req.nextUrl.searchParams.get("preview")) {
    return NextResponse.json(summarise(dump));
  }

  const result = await migrate(dump, options);
  return NextResponse.json(result);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface MigrateOptions {
  importBooks?:    boolean;
  importCopies?:   boolean;
  importMembers?:  boolean;
  skipDuplicates?: boolean;
  dryRun?:         boolean;
  /** pmbLenderId → pvdBranchId (or null = no branch) */
  branchMap?:      Record<string, string | null>;
  /** pmbLocationId → pvdBranchId — takes priority over branchMap */
  locationMap?:    Record<string, string | null>;
}

interface MigrateResult {
  authors:    { created: number; skipped: number };
  publishers: { created: number; skipped: number };
  categories: { created: number; skipped: number };
  books:      { created: number; skipped: number; errors: number };
  copies:     { created: number };
  members:    { created: number; skipped: number; errors: number };
  dryRun:     boolean;
}

function mapAudienceLevel(s: string): "ADULTS" | "YOUTH" | "CHILDREN" | "UNSPECIFIED" {
  const v = s.trim().toLowerCase();
  if (v === "1" || v === "adulte" || v === "adult" || v === "adults") return "ADULTS";
  if (v === "2" || v === "jeune" || v === "jeunesse" || v === "youth" || v === "young") return "YOUTH";
  if (v === "3" || v === "enfant" || v === "children" || v === "child") return "CHILDREN";
  return "UNSPECIFIED";
}

function summarise(dump: PmbDump) {
  // Count copies per lender, with sub-breakdown by location and section
  const lenderCopies  = new Map<string, number>();
  const locationCopies = new Map<string, number>();
  const sectionCopies  = new Map<string, number>();
  const lenderLocations = new Map<string, Set<string>>(); // lenderId → Set<locationId>

  for (const e of dump.exemplaires) {
    if (e.expl_owner) {
      lenderCopies.set(e.expl_owner, (lenderCopies.get(e.expl_owner) ?? 0) + 1);
      if (e.expl_location) {
        const set = lenderLocations.get(e.expl_owner) ?? new Set();
        set.add(e.expl_location);
        lenderLocations.set(e.expl_owner, set);
      }
    }
    if (e.expl_location) locationCopies.set(e.expl_location, (locationCopies.get(e.expl_location) ?? 0) + 1);
    if (e.expl_section)  sectionCopies.set(e.expl_section,  (sectionCopies.get(e.expl_section)  ?? 0) + 1);
  }

  const lenderSummary = dump.lenders.map((l) => ({
    id:         l.id,
    name:       l.name,
    copies:     lenderCopies.get(l.id) ?? 0,
    locations:  [...(lenderLocations.get(l.id) ?? [])].map((lid) => ({
      id:     lid,
      name:   dump.locations.find((x) => x.id === lid)?.name ?? lid,
      copies: locationCopies.get(lid) ?? 0,
    })).sort((a, b) => b.copies - a.copies),
  })).sort((a, b) => b.copies - a.copies);

  return {
    notices:         dump.notices.length,
    authors:         dump.authors.length,
    authors_notices: dump.authors_notices.length,
    publishers:      dump.publishers.length,
    categories:      dump.categories.length,
    exemplaires:     dump.exemplaires.length,
    empr:            dump.empr.length,
    lenders:         dump.lenders,
    locations:       dump.locations,
    sections:        dump.sections,
    lenderSummary,
    sample: dump.notices.slice(0, 5).map((n) => ({ id: n.notice_id, titre: n.titre, isbn: n.isbn, publisher: n.ed_editeur })),
  };
}

// ── Core migration logic ───────────────────────────────────────────────────

async function migrate(dump: PmbDump, opts: MigrateOptions): Promise<MigrateResult> {
  const {
    importBooks    = true,
    importCopies   = true,
    importMembers  = true,
    skipDuplicates = true,
    dryRun         = false,
    branchMap      = {},
    locationMap    = {},
  } = opts;

  const result: MigrateResult = {
    authors:    { created: 0, skipped: 0 },
    publishers: { created: 0, skipped: 0 },
    categories: { created: 0, skipped: 0 },
    books:      { created: 0, skipped: 0, errors: 0 },
    copies:     { created: 0 },
    members:    { created: 0, skipped: 0, errors: 0 },
    dryRun,
  };

  if (dryRun) return result;

  // ── 1. Authors ───────────────────────────────────────────────────────────
  const authorIdMap = new Map<number, string>();

  for (const a of dump.authors) {
    const fullName = [a.author_firstname, a.author_name].filter(Boolean).join(" ").trim() || "Unknown";
    try {
      const existing = await prisma.author.findFirst({ where: { name: fullName } });
      if (existing) {
        authorIdMap.set(a.author_id, existing.id);
        result.authors.skipped++;
      } else {
        const created = await prisma.author.create({ data: { name: fullName } });
        authorIdMap.set(a.author_id, created.id);
        result.authors.created++;
      }
    } catch { result.authors.skipped++; }
  }

  // ── 2. Publishers ────────────────────────────────────────────────────────
  const publisherIdMap = new Map<number, string>();

  for (const p of dump.publishers) {
    if (!p.publisher_name) continue;
    try {
      const existing = await prisma.publisher.findFirst({ where: { name: p.publisher_name } });
      if (existing) {
        publisherIdMap.set(p.publisher_id, existing.id);
        result.publishers.skipped++;
      } else {
        const created = await prisma.publisher.create({ data: { name: p.publisher_name } });
        publisherIdMap.set(p.publisher_id, created.id);
        result.publishers.created++;
      }
    } catch { result.publishers.skipped++; }
  }

  // ── 3. Categories ────────────────────────────────────────────────────────
  const categoryCodeMap = new Map<string, string>(); // num_noeud → pvdId

  for (const c of dump.categories) {
    const code = String(c.num_noeud);
    const name = c.libelle_categorie;
    if (!name) continue;
    try {
      const existing = await prisma.category.findFirst({ where: { name } });
      if (existing) {
        categoryCodeMap.set(code, existing.id);
        result.categories.skipped++;
      } else {
        const created = await prisma.category.create({ data: { name } });
        categoryCodeMap.set(code, created.id);
        result.categories.created++;
      }
    } catch { result.categories.skipped++; }
  }

  // Build publisher lookup map:
  //   Primary  → notices.ed_editeur (direct FK, present in most PMB versions)
  //   Fallback → publishers_notices link table (older PMB versions)
  const noticePubMap = new Map<number, number>();
  for (const pn of dump.publishers_notices) noticePubMap.set(pn.notice_id, pn.publisher_id);
  // ed_editeur on notices overrides the link table if both exist
  for (const n of dump.notices) {
    if (n.ed_editeur > 0) noticePubMap.set(n.notice_id, n.ed_editeur);
  }

  const noticeCatMap = new Map<number, string>();
  for (const nc of dump.notices_categories) {
    if (!noticeCatMap.has(nc.notice_id)) {
      const pvdId = categoryCodeMap.get(String(nc.num_noeud));
      if (pvdId) noticeCatMap.set(nc.notice_id, pvdId);
    }
  }

  const noticeAuthorsMap = new Map<number, { authorId: number; ordre: number; fonction: string }[]>();
  for (const an of dump.authors_notices) {
    const list = noticeAuthorsMap.get(an.notice_id) ?? [];
    list.push({ authorId: an.author_id, ordre: an.author_display_order, fonction: an.fonction });
    noticeAuthorsMap.set(an.notice_id, list);
  }

  // ── 4. Books (notices) ──────────────────────────────────────────────────
  const noticeBookMap = new Map<number, string>();

  if (importBooks) for (const n of dump.notices) {
    try {
      // Only treat notices.code as a real ISBN if it is 10 or 13 digits after stripping.
      // Store the value EXACTLY as PMB has it (keep original dashes/format).
      // Do NOT reformat — our formatter can't handle every regional ISBN group perfectly.
      const stripped = stripIsbn(n.isbn ?? "");
      const isValidLen = stripped.length === 10 || stripped.length === 13;
      const isbn = isValidLen ? (n.isbn?.trim() || null) : null;

      // Always check pmbNoticeId — prevents re-import duplicates regardless of skipDuplicates
      const byNoticeId = await prisma.book.findFirst({
        where: { pmbNoticeId: n.notice_id },
        select: { id: true, audienceLevel: true },
      });
      if (byNoticeId) {
        noticeBookMap.set(n.notice_id, byNoticeId.id);

        // Update audienceLevel whenever PMB has a real value (not just when UNSPECIFIED)
        const newAudience = mapAudienceLevel(n.public_cible ?? "");
        if (newAudience !== "UNSPECIFIED") {
          await prisma.book.update({ where: { id: byNoticeId.id }, data: { audienceLevel: newAudience as never } });
        }

        // Update copies' branchId — pmbId may be NULL on copies from early imports,
        // so derive the branch from the notice's exemplaires instead.
        if (importCopies) {
          // Get all exemplaires for this notice from the dump
          const noticeExpls = dump.exemplaires.filter((e) => e.notice_id === n.notice_id);

          // Resolve a branchId for each exemplaire, pick the most common one
          const branchVotes = new Map<string, number>();
          for (const expl of noticeExpls) {
            const bid =
              (expl.expl_location && locationMap[expl.expl_location] !== undefined ? locationMap[expl.expl_location] : undefined) ??
              (expl.expl_owner    && branchMap[expl.expl_owner]    !== undefined ? branchMap[expl.expl_owner]    : null);
            if (bid) branchVotes.set(bid, (branchVotes.get(bid) ?? 0) + 1);
          }

          if (branchVotes.size > 0) {
            // Pick the branch with the most copies in this notice
            const dominantBranch = [...branchVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
            await prisma.$executeRawUnsafe(
              `UPDATE "BookCopy" SET "branchId" = $1 WHERE "bookId" = $2 AND "branchId" IS NULL`,
              dominantBranch, byNoticeId.id,
            );
          }
        }

        result.books.skipped++;
        continue;
      }

      // Fallbacks — only when skipDuplicates is on
      // Handles books whose pmbNoticeId was absorbed by a merge
      if (skipDuplicates) {
        let found: { id: string; audienceLevel: string } | null = null;

        // 2. ISBN match
        if (!found && isbn) {
          found = await prisma.book.findFirst({ where: { isbn }, select: { id: true, audienceLevel: true } }) ?? null;
        }

        // 3. Exact title match (catches merged duplicates with no ISBN)
        if (!found && n.titre?.trim()) {
          found = await prisma.book.findFirst({
            where: { title: { equals: n.titre.trim(), mode: "insensitive" } },
            select: { id: true, audienceLevel: true },
          }) ?? null;
        }

        if (found) {
          noticeBookMap.set(n.notice_id, found.id);
          // Stamp the pmbNoticeId so future re-imports find it instantly
          await prisma.$executeRawUnsafe(
            `UPDATE "Book" SET "pmbNoticeId" = $1 WHERE id = $2 AND "pmbNoticeId" IS NULL`,
            n.notice_id, found.id,
          );
          const newAudience = mapAudienceLevel(n.public_cible ?? "");
          if (newAudience !== "UNSPECIFIED") {
            await prisma.book.update({ where: { id: found.id }, data: { audienceLevel: newAudience as never } });
          }
          result.books.skipped++;
          continue;
        }
      }

      const authList          = (noticeAuthorsMap.get(n.notice_id) ?? []).sort((a, b) => a.ordre - b.ordre);
      const primaryAuthorPmbId = authList.find((a) =>
        a.fonction === "AUT" || a.fonction === "0" || a.ordre === 0
      )?.authorId ?? authList[0]?.authorId;
      const coAuthorPmbIds    = authList.filter((a) => a.authorId !== primaryAuthorPmbId).map((a) => a.authorId);
      const authorId          = primaryAuthorPmbId ? (authorIdMap.get(primaryAuthorPmbId) ?? null) : null;
      const coAuthorIds       = coAuthorPmbIds.map((id) => authorIdMap.get(id)).filter((id): id is string => !!id);
      const publisherId       = noticePubMap.has(n.notice_id) ? (publisherIdMap.get(noticePubMap.get(n.notice_id)!) ?? null) : null;
      const categoryId        = noticeCatMap.get(n.notice_id) ?? null;
      const matType           = mapMaterialType(n.notice_type) as Parameters<typeof prisma.book.create>[0]["data"]["materialType"];

      // Generate next available PVD barcode for the book
      const { prefix, padding } = await getBarcodeSettings();
      const pfx = `${prefix}-`;
      const lastBarcode = await prisma.$queryRawUnsafe<{ barcode: string }[]>(
        `SELECT barcode FROM "Book" WHERE barcode LIKE $1
         UNION SELECT barcode FROM "BookCopy" WHERE barcode LIKE $1
         ORDER BY barcode DESC LIMIT 1`,
        `${pfx}%`,
      );
      const lastNum = lastBarcode[0]?.barcode
        ? (parseInt(lastBarcode[0].barcode.replace(pfx, "").split("-")[0], 10) || 0)
        : 0;
      const bookBarcode = `${pfx}${String(lastNum + 1).padStart(padding, "0")}`;

      // Try with ISBN first; if duplicate ISBN exists, retry without it
      let book;
      for (const isbnAttempt of [isbn, null]) {
        try {
          book = await prisma.book.create({
            data: {
              title:          n.titre,
              subtitle:       n.soustitre  || null,
              edition:        n.ed_note    || null,
              isbn:           isbnAttempt,
              barcode:        bookBarcode,
              description:    n.n_contenu  || null,
              coverImage:     n.thumbnail_url || null,
              publishYear:    parseInt(n.annee, 10)  || null,
              pages:          parseInt(n.npages, 10) || null,
              language:       mapLanguage(n.langue),
              materialType:   matType,
              audienceLevel:  mapAudienceLevel(n.public_cible ?? ""),
              totalCopies:    0,
              availableCopies: 0,
              authorId,
              publisherId,
              categoryId,
              ...(coAuthorIds.length > 0 ? { coAuthors: { connect: coAuthorIds.map((id) => ({ id })) } } : {}),
            },
          });
          break; // success — exit retry loop
        } catch (err: unknown) {
          const isIsbnConflict = err instanceof Error && err.message.includes("isbn");
          if (isbnAttempt === null || !isIsbnConflict) throw err; // non-ISBN error or already retried
          // ISBN conflict — loop again with isbnAttempt = null
        }
      }

      // Store callNumber + pmbNoticeId via raw SQL (stale client)
      await prisma.$executeRawUnsafe(
        `UPDATE "Book" SET "callNumber" = $1, "pmbNoticeId" = $2 WHERE id = $3`,
        n.index_l || null, n.notice_id, book!.id,
      );

      noticeBookMap.set(n.notice_id, book!.id);
      result.books.created++;
    } catch (e) {
      console.error(`[PMB] notice ${n.notice_id}:`, e);
      result.books.errors++;
    }
  }

  // ── 5. Copies (exemplaires — all copies including borrowed) ─────────────────
  if (importCopies) {
    const activeLoanExplIds = new Set(dump.pret.map((p) => p.expl_id));

    const byNotice = new Map<number, typeof dump.exemplaires>();
    for (const e of dump.exemplaires) {
      const list = byNotice.get(e.notice_id) ?? [];
      list.push(e);
      byNotice.set(e.notice_id, list);
    }

    const { prefix: pfxCopy, padding: padCopy } = await getBarcodeSettings();
    const pfxDash = `${pfxCopy}-`;

    for (const [noticeId, exmpls] of byNotice.entries()) {
      const bookId = noticeBookMap.get(noticeId);
      if (!bookId) continue;

      // Skip if book already has copies (re-import guard)
      const existingCopyCount = await prisma.bookCopy.count({ where: { bookId } });
      if (existingCopyCount > 0) continue;

      // Get book barcode for deriving copy barcodes
      const bookRow = await prisma.$queryRawUnsafe<{ barcode: string | null }[]>(
        `SELECT barcode FROM "Book" WHERE id = $1`, bookId,
      );
      const bookBarcode = bookRow[0]?.barcode ?? null;

      let copyNum      = 1;
      let createdCount = 0;

      for (const e of exmpls) {
        const isOnLoan = activeLoanExplIds.has(e.exemplaire_id);
        // Derive PVD copy barcode from book barcode
        const pad3 = String(copyNum).padStart(3, "0");
        const copyBarcode = bookBarcode
          ? (copyNum === 1 ? bookBarcode : `${bookBarcode}-C${pad3}`)
          : null;

        // Location mapping takes priority over lender mapping
        const branchId =
          (e.expl_location && locationMap[e.expl_location] !== undefined ? locationMap[e.expl_location] : undefined) ??
          (e.expl_owner    && branchMap[e.expl_owner]    !== undefined ? branchMap[e.expl_owner]    : null);

        try {
          const copy = await prisma.bookCopy.create({
            data: {
              bookId,
              copyNumber:   copyNum++,
              barcode:      copyBarcode,
              price:        e.expl_prix || null,
              condition:    mapCondition(e.expl_condition) as Parameters<typeof prisma.bookCopy.create>[0]["data"]["condition"],
              status:       isOnLoan ? "BORROWED" : "AVAILABLE",
              labelPrinted: true,
              ...(branchId ? { branchId } : {}),
            },
          });
          // Store pmbId + pmbOriginalBarcode via raw SQL
          await prisma.$executeRawUnsafe(
            `UPDATE "BookCopy" SET "pmbId" = $1, "pmbOriginalBarcode" = $2 WHERE id = $3`,
            e.exemplaire_id, e.cb?.trim() || null, copy.id,
          );
          createdCount++;
          result.copies.created++;
        } catch (err) {
          console.error(`[PMB] copy exemplaire ${e.exemplaire_id}:`, err);
        }
      }

      if (createdCount > 0) {
        // Recount from actual BookCopy rows so totalCopies and availableCopies are always accurate
        await prisma.$executeRawUnsafe(`
          UPDATE "Book"
          SET "totalCopies"     = (SELECT COUNT(*)                                      FROM "BookCopy" WHERE "bookId" = $1),
              "availableCopies" = (SELECT COUNT(*) FILTER (WHERE status = 'AVAILABLE') FROM "BookCopy" WHERE "bookId" = $1)
          WHERE id = $1`, bookId,
        );
      }
    }
  }

  // ── 6. Members (empr) ────────────────────────────────────────────────────
  if (importMembers) {
    // Build lookup sets from existing members for fast dedup checks
    const existingByMemberId = new Map<string, string>(); // memberId → id
    const existingByName     = new Map<string, string>(); // normalised name → id
    const existingEmails     = new Set<string>();

    const allMembers = await prisma.member.findMany({
      select: { id: true, memberId: true, name: true, email: true },
    });
    for (const m of allMembers) {
      existingByMemberId.set(m.memberId, m.id);
      existingByName.set(m.name.toLowerCase().trim(), m.id);
      if (m.email) existingEmails.add(m.email.toLowerCase());
    }

    for (const e of dump.empr) {
      try {
        const fullName = [e.empr_prenom, e.empr_nom].filter(Boolean).join(" ").trim();
        if (!fullName) { result.members.skipped++; continue; }

        const normName   = fullName.toLowerCase().trim();
        const cardBarcode = e.empr_cb?.trim() || null;
        const pmbId      = `PMB-${e.empr_id}`;
        const memberId   = cardBarcode ?? pmbId;

        const rawEmail = e.empr_mail?.trim().toLowerCase() || null;
        const addrParts = [e.empr_adr1, e.empr_adr2, e.empr_cp, e.empr_ville].filter(Boolean);
        const address   = addrParts.join(", ") || null;
        const joinDate  = parseDate(e.empr_date_adhesion) ?? new Date();
        const expireDate = parseDate(e.date_expiration_abonnement) ?? null;

        const sharedData = {
          name:       fullName,
          phone:      e.empr_tel || null,
          address,
          memberType: mapMemberType(e.empr_categ) as Parameters<typeof prisma.member.create>[0]["data"]["memberType"],
          gender:     mapGender(e.empr_sexe) as Parameters<typeof prisma.member.create>[0]["data"]["gender"],
          studentId:  e.empr_cb?.trim() || null,
          school:     e.school    || null,
          className:  e.className || null,
          joinDate,
          expireDate,
          isActive:   expireDate ? expireDate > new Date() : true,
        };

        // ── Check if this member already exists by barcode, PMB-id, or name ──
        // Also do a DB fallback for pmbId to catch members created outside this session
        const existingId =
          (cardBarcode && existingByMemberId.get(cardBarcode)) ||
          existingByMemberId.get(pmbId) ||
          existingByName.get(normName) ||
          (await prisma.member.findFirst({ where: { memberId: pmbId }, select: { id: true } }))?.id ||
          (cardBarcode ? (await prisma.member.findFirst({ where: { memberId: cardBarcode }, select: { id: true } }))?.id : undefined);

        if (existingId) {
          // Update school / class / gender on existing record (non-destructive)
          await prisma.member.update({
            where: { id: existingId },
            data: {
              memberType: sharedData.memberType,
              gender:     sharedData.gender,
              studentId:  sharedData.studentId,
              school:     sharedData.school,
              className:  sharedData.className,
            },
          });
          result.members.skipped++;   // counts as "skipped" (not newly created)
          continue;
        }

        // ── New member — create ──
        const email = (rawEmail && !existingEmails.has(rawEmail)) ? e.empr_mail!.trim() : null;

        const created = await prisma.member.create({
          data: { memberId, email, ...sharedData },
        });

        existingByMemberId.set(memberId, created.id);
        existingByName.set(normName, created.id);
        if (email) existingEmails.add(email.toLowerCase());

        result.members.created++;
      } catch (err) {
        console.error(`[PMB] empr ${e.empr_id}:`, err);
        result.members.errors++;
      }
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapCondition(pmb: string): string {
  const s = (pmb ?? "").toUpperCase();
  if (s === "1" || s.includes("BON") || s.includes("GOOD") || s.includes("EXCELLENT")) return "GOOD";
  if (s === "2" || s.includes("CORRECT") || s.includes("FAIR") || s.includes("MOYEN"))  return "FAIR";
  if (s === "3" || s.includes("MAUV") || s.includes("POOR") || s.includes("BAD"))       return "POOR";
  if (s.includes("DAMAGED") || s.includes("ABIME"))                                      return "DAMAGED";
  return "GOOD";
}

function mapGender(sexe: number): string {
  if (sexe === 1) return "MALE";
  if (sexe === 2) return "FEMALE";
  return "UNSPECIFIED";
}

/** Parse a YYYY-MM-DD (or YYYY-MM-DD HH:MM:SS) date string safely. */
function parseDate(s: string): Date | null {
  if (!s || s === "0000-00-00" || s.startsWith("0000")) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
