/**
 * db-export.ts
 * Run: npm run db:export
 *
 * Exports all key tables to both CSV and Excel (.xlsx).
 * Output: /exports/<timestamp>/
 *   - books.csv / books.xlsx
 *   - members.csv
 *   - loans.csv
 *   - fines.csv
 *   - reservations.csv
 *   - all-tables.xlsx  (one sheet per table)
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

function toCSV(rows: unknown[]): string {
  return Papa.unparse(rows as object[]);
}

function fmt(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
  });
}

async function main() {
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);

  const exportDir = join(process.cwd(), "exports", timestamp);
  mkdirSync(exportDir, { recursive: true });

  console.log("\n📊  PVD Library — Data Export");
  console.log(`📁  Destination: ${exportDir}\n`);

  // ── Books ─────────────────────────────────────────────────────────────────
  const rawBooks = await prisma.book.findMany({
    include: { author: true, category: true, publisher: true },
    orderBy: { title: "asc" },
  });
  const books = rawBooks.map((b) => ({
    Title:            b.title,
    "Title (Khmer)":  b.titleKm ?? "",
    Author:           b.author?.name ?? "",
    Category:         b.category?.name ?? "",
    Publisher:        b.publisher?.name ?? "",
    ISBN:             b.isbn ?? "",
    Barcode:          b.barcode ?? "",
    MaterialType:     b.materialType,
    Language:         b.language ?? "",
    PublishYear:      b.publishYear ?? "",
    Pages:            b.pages ?? "",
    TotalCopies:      b.totalCopies,
    AvailableCopies:  b.availableCopies,
    Condition:        b.condition,
    Location:         b.location ?? "",
    AddedDate:        fmt(b.createdAt),
  }));
  writeFileSync(join(exportDir, "books.csv"), toCSV(books), "utf-8");
  console.log(`  📚  books           ${books.length} rows → books.csv`);

  // ── Book Copies (per-copy ledger) ────────────────────────────────────────
  const rawCopies = await prisma.bookCopy.findMany({
    include: { book: { select: { title: true, isbn: true } } },
    orderBy: [{ bookId: "asc" }, { copyNumber: "asc" }],
  });
  const copies = rawCopies.map((c) => ({
    BookTitle:   c.book.title,
    BookISBN:    c.book.isbn ?? "",
    CopyNumber:  c.copyNumber,
    Barcode:     c.barcode ?? "",
    RFID:        c.rfid ?? "",
    Condition:   c.condition,
    Status:      c.status,
    Price:       c.price ?? "",
    AcquiredAt:  fmt(c.acquiredAt),
    Notes:       c.notes ?? "",
  }));
  writeFileSync(join(exportDir, "book-copies.csv"), toCSV(copies), "utf-8");
  console.log(`  📦  bookCopies      ${copies.length} rows → book-copies.csv`);

  // ── Locations (shelf taxonomy) ───────────────────────────────────────────
  const rawLocations = await prisma.location.findMany({
    include: { _count: { select: { books: true } } },
    orderBy: { name: "asc" },
  });
  const locations = rawLocations.map((l) => ({
    Name:        l.name,
    Description: l.description ?? "",
    BookCount:   l._count.books,
    CreatedAt:   fmt(l.createdAt),
  }));
  writeFileSync(join(exportDir, "locations.csv"), toCSV(locations), "utf-8");
  console.log(`  📍  locations       ${locations.length} rows → locations.csv`);

  // ── Members ───────────────────────────────────────────────────────────────
  const rawMembers = await prisma.member.findMany({ orderBy: { name: "asc" } });
  const members = rawMembers.map((m) => ({
    MemberID:    m.memberId,
    Name:        m.name,
    Email:       m.email ?? "",
    Phone:       m.phone ?? "",
    MemberType:  m.memberType,
    JoinDate:    fmt(m.joinDate),
    ExpireDate:  fmt(m.expireDate),
    IsActive:    m.isActive ? "Yes" : "No",
    Address:     m.address ?? "",
  }));
  writeFileSync(join(exportDir, "members.csv"), toCSV(members), "utf-8");
  console.log(`  👥  members         ${members.length} rows → members.csv`);

  // ── Loans ─────────────────────────────────────────────────────────────────
  const rawLoans = await prisma.loan.findMany({
    include: {
      member: { select: { name: true, memberId: true } },
      book:   { select: { title: true, isbn: true   } },
      fines:  { select: { amount: true, status: true }, take: 1 },
    },
    orderBy: { borrowDate: "desc" },
  });
  const loans = rawLoans.map((l) => ({
    Member:       l.member.name,
    MemberID:     l.member.memberId,
    BookTitle:    l.book.title,
    ISBN:         l.book.isbn ?? "",
    BorrowDate:   fmt(l.borrowDate),
    DueDate:      fmt(l.dueDate),
    ReturnDate:   fmt(l.returnDate),
    Status:       l.status,
    RenewalCount: l.renewalCount,
    FineAmount:   l.fines[0] ? `$${l.fines[0].amount.toFixed(2)}` : "",
    FineStatus:   l.fines[0]?.status ?? "",
  }));
  writeFileSync(join(exportDir, "loans.csv"), toCSV(loans), "utf-8");
  console.log(`  📖  loans           ${loans.length} rows → loans.csv`);

  // ── Fines ─────────────────────────────────────────────────────────────────
  const rawFines = await prisma.fine.findMany({
    include: {
      member: { select: { name: true, memberId: true } },
      loan:   { select: { dueDate: true, returnDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const fines = rawFines.map((f) => ({
    Member:     f.member.name,
    MemberID:   f.member.memberId,
    Amount:     `$${f.amount.toFixed(2)}`,
    DaysLate:   f.daysLate,
    Status:     f.status,
    PaidAt:     fmt(f.paidAt),
    DueDate:    fmt(f.loan.dueDate),
    ReturnDate: fmt(f.loan.returnDate),
    CreatedAt:  fmt(f.createdAt),
  }));
  writeFileSync(join(exportDir, "fines.csv"), toCSV(fines), "utf-8");
  console.log(`  💰  fines           ${fines.length} rows → fines.csv`);

  // ── Reservations ──────────────────────────────────────────────────────────
  const rawReservations = await prisma.reservation.findMany({
    include: {
      member: { select: { name: true, memberId: true } },
      book:   { select: { title: true               } },
    },
    orderBy: { createdAt: "desc" },
  });
  const reservations = rawReservations.map((r) => ({
    Member:    r.member.name,
    MemberID:  r.member.memberId,
    Book:      r.book.title,
    Status:    r.status,
    HoldShelf: r.holdShelf ?? "",
    ExpiresAt: fmt(r.expiresAt),
    CreatedAt: fmt(r.createdAt),
  }));
  writeFileSync(join(exportDir, "reservations.csv"), toCSV(reservations), "utf-8");
  console.log(`  📋  reservations    ${reservations.length} rows → reservations.csv`);

  // ── Ebooks ────────────────────────────────────────────────────────────────
  const rawEbooks = await prisma.ebook.findMany({
    include: { author: true, category: true },
    orderBy: { title: "asc" },
  });
  const ebooks = rawEbooks.map((e) => ({
    Title:       e.title,
    "Title (Khmer)": e.titleKm ?? "",
    Author:      e.author?.name ?? "",
    Category:    e.category?.name ?? "",
    Type:        e.ebookType,
    Language:    e.language ?? "",
    PublishYear: e.publishYear ?? "",
    Views:       e.views,
    IsPublic:    e.isPublic ? "Yes" : "No",
    FileURL:     e.fileUrl,
    AddedDate:   fmt(e.createdAt),
  }));
  writeFileSync(join(exportDir, "ebooks.csv"), toCSV(ebooks), "utf-8");
  console.log(`  📱  ebooks          ${ebooks.length} rows → ebooks.csv`);

  // ── All-in-one Excel workbook ─────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  const sheets: [string, unknown[]][] = [
    ["Books",        books],
    ["BookCopies",   copies],
    ["Locations",    locations],
    ["Members",      members],
    ["Loans",        loans],
    ["Fines",        fines],
    ["Reservations", reservations],
    ["Ebooks",       ebooks],
  ];
  for (const [name, data] of sheets) {
    const ws = XLSX.utils.json_to_sheet(data as object[]);
    // Auto column widths
    const colWidths = Object.keys(data[0] ?? {}).map((key) => ({
      wch: Math.max(key.length, 12),
    }));
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, join(exportDir, "all-tables.xlsx"));
  console.log("\n  📊  all-tables.xlsx — all sheets combined");

  const total = books.length + copies.length + locations.length + members.length + loans.length +
                fines.length + reservations.length + ebooks.length;

  console.log(`\n✅  Export complete! ${total} total rows`);
  console.log(`📁  ${exportDir}\n`);
}

main()
  .catch((e) => { console.error("❌  Export error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
