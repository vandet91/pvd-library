import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

function fmt(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !["ADMIN", "LIBRARIAN"].includes(session.user?.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") ?? "all";

  const wb = XLSX.utils.book_new();

  // ── Books ─────────────────────────────────────────────────────────────────
  if (table === "all" || table === "books") {
    const rows = await prisma.book.findMany({
      include: { author: true, category: true, publisher: true },
      orderBy: { title: "asc" },
    });
    const data = rows.map((b) => ({
      Title:           b.title,
      "Title (Khmer)": b.titleKm ?? "",
      Author:          b.author?.name ?? "",
      Category:        b.category?.name ?? "",
      Publisher:       b.publisher?.name ?? "",
      ISBN:            b.isbn ?? "",
      Barcode:         b.barcode ?? "",
      MaterialType:    b.materialType,
      Language:        b.language ?? "",
      PublishYear:     b.publishYear ?? "",
      TotalCopies:     b.totalCopies,
      AvailableCopies: b.availableCopies,
      Condition:       b.condition,
      Location:        b.location ?? "",
      AddedDate:       fmt(b.createdAt),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Books");
  }

  // ── Members ───────────────────────────────────────────────────────────────
  if (table === "all" || table === "members") {
    const rows = await prisma.member.findMany({ orderBy: { name: "asc" } });
    const data = rows.map((m) => ({
      MemberID:   m.memberId,
      Name:       m.name,
      Email:      m.email ?? "",
      Phone:      m.phone ?? "",
      MemberType: m.memberType,
      JoinDate:   fmt(m.joinDate),
      ExpireDate: fmt(m.expireDate),
      IsActive:   m.isActive ? "Yes" : "No",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Members");
  }

  // ── Loans ─────────────────────────────────────────────────────────────────
  if (table === "all" || table === "loans") {
    const rows = await prisma.loan.findMany({
      include: {
        member: { select: { name: true, memberId: true } },
        book:   { select: { title: true, isbn: true   } },
        fine:   { select: { amount: true, status: true } },
      },
      orderBy: { borrowDate: "desc" },
    });
    const data = rows.map((l) => ({
      Member:       l.member.name,
      MemberID:     l.member.memberId,
      Book:         l.book.title,
      ISBN:         l.book.isbn ?? "",
      BorrowDate:   fmt(l.borrowDate),
      DueDate:      fmt(l.dueDate),
      ReturnDate:   fmt(l.returnDate),
      Status:       l.status,
      LoanType:     l.loanType,
      Renewals:     l.renewalCount,
      FineAmount:   l.fine ? `$${l.fine.amount.toFixed(2)}` : "",
      FineStatus:   l.fine?.status ?? "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Loans");
  }

  // ── Fines ─────────────────────────────────────────────────────────────────
  if (table === "all" || table === "fines") {
    const rows = await prisma.fine.findMany({
      include: {
        member: { select: { name: true, memberId: true } },
        loan:   { select: { dueDate: true, returnDate: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const data = rows.map((f) => ({
      Member:     f.member.name,
      MemberID:   f.member.memberId,
      Amount:     `$${f.amount.toFixed(2)}`,
      DaysLate:   f.daysLate,
      Status:     f.status,
      PaidAt:     fmt(f.paidAt),
      DueDate:    fmt(f.loan.dueDate),
      ReturnDate: fmt(f.loan.returnDate),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Fines");
  }

  // ── Reservations ──────────────────────────────────────────────────────────
  if (table === "all" || table === "reservations") {
    const rows = await prisma.reservation.findMany({
      include: {
        member: { select: { name: true, memberId: true } },
        book:   { select: { title: true               } },
      },
      orderBy: { createdAt: "desc" },
    });
    const data = rows.map((r) => ({
      Member:    r.member.name,
      MemberID:  r.member.memberId,
      Book:      r.book.title,
      Status:    r.status,
      HoldShelf: r.holdShelf ?? "",
      ExpiresAt: fmt(r.expiresAt),
      CreatedAt: fmt(r.createdAt),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Reservations");
  }

  // ── Ebooks ────────────────────────────────────────────────────────────────
  if (table === "all" || table === "ebooks") {
    const rows = await prisma.ebook.findMany({
      include: { author: true, category: true },
      orderBy: { title: "asc" },
    });
    const data = rows.map((e) => ({
      Title:       e.title,
      Author:      e.author?.name ?? "",
      Category:    e.category?.name ?? "",
      Type:        e.ebookType,
      Language:    e.language ?? "",
      PublishYear: e.publishYear ?? "",
      Views:       e.views,
      IsPublic:    e.isPublic ? "Yes" : "No",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Ebooks");
  }

  // ── Book Copies ───────────────────────────────────────────────────────────
  if (table === "all" || table === "copies") {
    const rows = await prisma.bookCopy.findMany({
      include: { book: { select: { title: true, barcode: true } } },
      orderBy: [{ book: { title: "asc" } }, { copyNumber: "asc" }],
    });
    const data = rows.map((c) => ({
      BookTitle:  c.book.title,
      BookBarcode: c.book.barcode ?? "",
      CopyNumber: c.copyNumber,
      Barcode:    c.barcode ?? "",
      RFID:       c.rfid ?? "",
      Condition:  c.condition,
      Status:     c.status,
      Loanable:   c.loanable ? "Yes" : "No",
      Price:      c.price ?? "",
      Notes:      c.notes ?? "",
      AcquiredAt: fmt(c.acquiredAt),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "BookCopies");
  }

  // ── Book Requests ─────────────────────────────────────────────────────────
  if (table === "all" || table === "requests") {
    const rows = await prisma.bookRequest.findMany({
      include: { member: { select: { name: true, memberId: true } } },
      orderBy: { createdAt: "desc" },
    });
    const data = rows.map((r) => ({
      Member:     r.member?.name ?? "",
      MemberID:   r.member?.memberId ?? "",
      Title:      r.title,
      Author:     r.author ?? "",
      ISBN:       r.isbn ?? "",
      Reason:     r.reason ?? "",
      Status:     r.status,
      AdminNote:  r.adminNote ?? "",
      CreatedAt:  fmt(r.createdAt),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "BookRequests");
  }

  // Return as Excel download
  const filename = table === "all"
    ? `pvd-library-export-${new Date().toISOString().slice(0, 10)}.xlsx`
    : `pvd-library-${table}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
