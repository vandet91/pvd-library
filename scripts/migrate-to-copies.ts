/* eslint-disable no-console */
/**
 * One-time migration: turn each Book's `totalCopies` count into individual
 * BookCopy rows. Existing active/overdue/lost loans get linked to a copy.
 *
 *   npm run db:migrate-copies            # apply
 *   npm run db:migrate-copies -- --dry   # preview only
 */
import { prisma } from "@/lib/prisma";

const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

function pad(n: number, w = 3) { return String(n).padStart(w, "0"); }

async function main() {
  console.log(`\n=== Copy migration ${DRY ? "(DRY RUN)" : ""} ===\n`);

  const books = await prisma.book.findMany({
    include: {
      loans: {
        where:   { status: { in: ["ACTIVE", "OVERDUE", "LOST"] } },
        orderBy: { borrowDate: "asc" },
      },
      copies: { select: { id: true } },
    },
  });

  let booksProcessed = 0;
  let copiesCreated  = 0;
  let loansLinked    = 0;
  let skipped        = 0;

  for (const book of books) {
    if (book.copies.length > 0) {
      console.log(`SKIP "${book.title}" — already has ${book.copies.length} copies`);
      skipped++;
      continue;
    }

    const needed = Math.max(book.totalCopies ?? 1, book.loans.length);
    if (needed === 0) { skipped++; continue; }

    console.log(`\n📘 "${book.title}" — creating ${needed} copies (${book.loans.length} active loans)`);
    booksProcessed++;

    for (let i = 1; i <= needed; i++) {
      // First copy keeps the existing book.barcode; the rest get auto-generated
      const barcode = i === 1 && book.barcode
        ? book.barcode
        : `${book.barcode ?? book.id.slice(-8)}-C${pad(i)}`;

      const linkedLoan = book.loans[i - 1]; // loans 1..N go to copies 1..N
      let status: "AVAILABLE" | "BORROWED" | "LOST" = "AVAILABLE";
      if (linkedLoan) {
        status = linkedLoan.status === "LOST" ? "LOST" : "BORROWED";
      }

      if (DRY) {
        console.log(`   would create copy #${i} (barcode=${barcode}, status=${status}${linkedLoan ? `, loan=${linkedLoan.id}` : ""})`);
        copiesCreated++;
        if (linkedLoan) loansLinked++;
        continue;
      }

      // Inherit the title's condition only if it's a "normal" one —
      // never propagate LOST/WITHDRAWN/ARCHIVED to brand-new copies
      const safeConds = ["EXCELLENT", "GOOD", "FAIR", "POOR"] as const;
      const inheritedCondition = (safeConds as readonly string[]).includes(book.condition)
        ? book.condition
        : "GOOD";
      const copy = await prisma.bookCopy.create({
        data: {
          bookId:     book.id,
          copyNumber: i,
          barcode,
          condition:  inheritedCondition,
          status,
          price:      book.price,
        },
      });
      copiesCreated++;

      if (linkedLoan) {
        await prisma.loan.update({
          where: { id: linkedLoan.id },
          data:  { copyId: copy.id },
        });
        loansLinked++;
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Books processed: ${booksProcessed}`);
  console.log(`Copies created : ${copiesCreated}`);
  console.log(`Loans linked   : ${loansLinked}`);
  console.log(`Books skipped  : ${skipped}`);
  console.log(DRY ? "\n(dry run — no changes written)" : "");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
