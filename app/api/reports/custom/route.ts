import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { format, addDays, subMonths } from "date-fns";
import * as XLSX from "xlsx";

type Row = Record<string, string | number | null>;
type Col = { key: string; label: string };

function fmtDate(d: Date | null | undefined) {
  return d ? format(d, "yyyy-MM-dd") : "";
}

async function buildReport(
  type: string,
  now: Date,
  from?: Date,
  to?: Date,
  branchId?: string,
): Promise<{ columns: Col[]; rows: Row[]; count: number }> {
  switch (type) {

    // ── Overdue Loans ───────────────────────────────────────────────
    case "overdue": {
      const loans = await prisma.loan.findMany({
        where: { status: "OVERDUE", ...(branchId && { branchId }) },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true, isbn: true } },
          fine:   { select: { amount: true, status: true } },
        },
        orderBy: { dueDate: "asc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName:  l.member.name,
        MemberID:    l.member.memberId,
        BookTitle:   l.book.title,
        ISBN:        l.book.isbn ?? "",
        LoanType:    l.loanType,
        BorrowDate:  fmtDate(l.borrowDate),
        DueDate:     fmtDate(l.dueDate),
        DaysOverdue: Math.floor((now.getTime() - l.dueDate.getTime()) / 86_400_000),
        FineAmount:  l.fine ? l.fine.amount : null,
        FineStatus:  l.fine?.status ?? "",
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName",  label: "Member" },
          { key: "MemberID",    label: "Member ID" },
          { key: "BookTitle",   label: "Book" },
          { key: "LoanType",    label: "Loan Type" },
          { key: "DueDate",     label: "Due Date" },
          { key: "DaysOverdue", label: "Days Overdue" },
          { key: "FineAmount",  label: "Fine ($)" },
          { key: "FineStatus",  label: "Fine Status" },
        ],
        rows,
      };
    }

    // ── Unpaid Fines ────────────────────────────────────────────────
    case "unpaid-fines": {
      const fines = await prisma.fine.findMany({
        where: { status: "UNPAID" },
        include: {
          member: { select: { name: true, memberId: true } },
          loan:   { select: { dueDate: true, returnDate: true, book: { select: { title: true } } } },
        },
        orderBy: { amount: "desc" },
      });
      const rows: Row[] = fines.map((f) => ({
        MemberName: f.member.name,
        MemberID:   f.member.memberId,
        BookTitle:  f.loan.book.title,
        Amount:     f.amount,
        DaysLate:   f.daysLate,
        DueDate:    fmtDate(f.loan.dueDate),
        ReturnDate: fmtDate(f.loan.returnDate),
        CreatedAt:  fmtDate(f.createdAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "Amount",     label: "Amount ($)" },
          { key: "DaysLate",   label: "Days Late" },
          { key: "DueDate",    label: "Due Date" },
          { key: "ReturnDate", label: "Returned" },
        ],
        rows,
      };
    }

    // ── Active Loans (not expired) ──────────────────────────────────
    case "active-loans": {
      const loans = await prisma.loan.findMany({
        where: { status: "ACTIVE", ...(branchId && { branchId }) },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true, isbn: true } },
        },
        orderBy: { dueDate: "asc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName: l.member.name,
        MemberID:   l.member.memberId,
        BookTitle:  l.book.title,
        ISBN:       l.book.isbn ?? "",
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:    fmtDate(l.dueDate),
        DaysLeft:   Math.max(0, Math.floor((l.dueDate.getTime() - now.getTime()) / 86_400_000)),
        LoanType:   l.loanType,
        Renewals:   l.renewalCount,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "DaysLeft",   label: "Days Left" },
          { key: "LoanType",   label: "Loan Type" },
          { key: "Renewals",   label: "Renewals" },
        ],
        rows,
      };
    }

    // ── All Unreturned (ACTIVE + OVERDUE) ───────────────────────────
    case "all-unreturned": {
      const loans = await prisma.loan.findMany({
        where: { status: { in: ["ACTIVE", "OVERDUE"] }, ...(branchId && { branchId }) },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true } },
          fine:   { select: { amount: true, status: true } },
        },
        orderBy: { dueDate: "asc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName:  l.member.name,
        MemberID:    l.member.memberId,
        BookTitle:   l.book.title,
        BorrowDate:  fmtDate(l.borrowDate),
        DueDate:     fmtDate(l.dueDate),
        Status:      l.status,
        LoanType:    l.loanType,
        DaysOverdue: l.status === "OVERDUE"
          ? Math.floor((now.getTime() - l.dueDate.getTime()) / 86_400_000)
          : null,
        FineAmount:  l.fine ? l.fine.amount : null,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName",  label: "Member" },
          { key: "MemberID",    label: "Member ID" },
          { key: "BookTitle",   label: "Book" },
          { key: "BorrowDate",  label: "Borrow Date" },
          { key: "DueDate",     label: "Due Date" },
          { key: "Status",      label: "Status" },
          { key: "LoanType",    label: "Loan Type" },
          { key: "DaysOverdue", label: "Days Overdue" },
          { key: "FineAmount",  label: "Fine ($)" },
        ],
        rows,
      };
    }

    // ── Loans by Date Range ─────────────────────────────────────────
    case "loans-by-date": {
      const dateFilter = from && to
        ? { gte: from, lte: addDays(to, 1) }
        : { gte: subMonths(now, 1) };
      const loans = await prisma.loan.findMany({
        where:   { borrowDate: dateFilter, ...(branchId && { branchId }) },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true } },
        },
        orderBy: { borrowDate: "desc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName: l.member.name,
        MemberID:   l.member.memberId,
        BookTitle:  l.book.title,
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:    fmtDate(l.dueDate),
        Status:     l.status,
        LoanType:   l.loanType,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "Status",     label: "Status" },
          { key: "LoanType",   label: "Loan Type" },
        ],
        rows,
      };
    }

    // ── Returns by Date Range ───────────────────────────────────────
    case "returns-by-date": {
      const dateFilter = from && to
        ? { gte: from, lte: addDays(to, 1) }
        : { gte: subMonths(now, 1) };
      const loans = await prisma.loan.findMany({
        where:   { status: "RETURNED", returnDate: dateFilter, ...(branchId && { branchId }) },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true } },
        },
        orderBy: { returnDate: "desc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName: l.member.name,
        MemberID:   l.member.memberId,
        BookTitle:  l.book.title,
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:    fmtDate(l.dueDate),
        ReturnDate: fmtDate(l.returnDate),
        DaysLate:   l.returnDate && l.returnDate > l.dueDate
          ? Math.floor((l.returnDate.getTime() - l.dueDate.getTime()) / 86_400_000)
          : 0,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "ReturnDate", label: "Return Date" },
          { key: "DaysLate",   label: "Days Late" },
        ],
        rows,
      };
    }

    // ── Expiring Today ──────────────────────────────────────────────
    case "expiring-today": {
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999);
      const loans = await prisma.loan.findMany({
        where: { status: "ACTIVE", dueDate: { gte: startOfDay, lte: endOfDay } },
        include: {
          member: { select: { name: true, memberId: true, email: true, phone: true } },
          book:   { select: { title: true } },
        },
        orderBy: { member: { name: "asc" } },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName: l.member.name,
        MemberID:   l.member.memberId,
        Email:      l.member.email ?? "",
        Phone:      l.member.phone ?? "",
        BookTitle:  l.book.title,
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:    fmtDate(l.dueDate),
        LoanType:   l.loanType,
        Renewals:   l.renewalCount,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "Email",      label: "Email" },
          { key: "Phone",      label: "Phone" },
          { key: "BookTitle",  label: "Book" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "LoanType",   label: "Loan Type" },
          { key: "Renewals",   label: "Renewals" },
        ],
        rows,
      };
    }

    // ── Returned Loans in Period ────────────────────────────────────
    case "returned-loans": {
      const dateFilter = from && to
        ? { gte: from, lte: addDays(to, 1) }
        : { gte: subMonths(now, 1) };
      const loans = await prisma.loan.findMany({
        where:   { status: "RETURNED", returnDate: dateFilter },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true } },
          fine:   { select: { amount: true, status: true } },
        },
        orderBy: { returnDate: "desc" },
      });
      const rows: Row[] = loans.map((l) => ({
        MemberName: l.member.name,
        MemberID:   l.member.memberId,
        BookTitle:  l.book.title,
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:    fmtDate(l.dueDate),
        ReturnDate: fmtDate(l.returnDate),
        LoanType:   l.loanType,
        FineAmount: l.fine ? l.fine.amount : null,
        FineStatus: l.fine?.status ?? "",
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "ReturnDate", label: "Return Date" },
          { key: "LoanType",   label: "Loan Type" },
          { key: "FineAmount", label: "Fine ($)" },
          { key: "FineStatus", label: "Fine Status" },
        ],
        rows,
      };
    }

    // ── Active Loans by Location ────────────────────────────────────
    case "loans-by-location": {
      const loans = await prisma.loan.findMany({
        where: { status: { in: ["ACTIVE", "OVERDUE"] } },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { include: { shelfLocation: true } },
        },
        orderBy: [{ book: { shelfLocation: { name: "asc" } } }, { dueDate: "asc" }],
      });
      const rows: Row[] = loans.map((l) => ({
        Location:  l.book.shelfLocation?.name ?? l.book.location ?? "—",
        BookTitle: l.book.title,
        MemberName: l.member.name,
        MemberID:  l.member.memberId,
        BorrowDate: fmtDate(l.borrowDate),
        DueDate:   fmtDate(l.dueDate),
        Status:    l.status,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Location",   label: "Location" },
          { key: "BookTitle",  label: "Book" },
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BorrowDate", label: "Borrow Date" },
          { key: "DueDate",    label: "Due Date" },
          { key: "Status",     label: "Status" },
        ],
        rows,
      };
    }

    // ── Reservations ────────────────────────────────────────────────
    case "reservations": {
      const reservations = await prisma.reservation.findMany({
        where:   { status: { in: ["PENDING", "APPROVED", "READY"] } },
        include: {
          member: { select: { name: true, memberId: true } },
          book:   { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      const rows: Row[] = reservations.map((r) => ({
        MemberName: r.member.name,
        MemberID:   r.member.memberId,
        BookTitle:  r.book.title,
        Status:     r.status,
        HoldShelf:  r.holdShelf ?? "",
        ExpiresAt:  fmtDate(r.expiresAt),
        CreatedAt:  fmtDate(r.createdAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "BookTitle",  label: "Book" },
          { key: "Status",     label: "Status" },
          { key: "HoldShelf",  label: "Hold Shelf" },
          { key: "ExpiresAt",  label: "Expires" },
          { key: "CreatedAt",  label: "Created" },
        ],
        rows,
      };
    }

    // ── List All Books ──────────────────────────────────────────────
    case "all-books": {
      const books = await prisma.book.findMany({
        where:   { ...(branchId && { branchId }) },
        include: { author: true, category: true, shelfLocation: true },
        orderBy: { title: "asc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:           b.title,
        Author:          b.author?.name ?? "",
        Category:        b.category?.name ?? "",
        Language:        b.language ?? "",
        MaterialType:    b.materialType,
        ISBN:            b.isbn ?? "",
        TotalCopies:     b.totalCopies,
        AvailableCopies: b.availableCopies,
        Location:        b.shelfLocation?.name ?? b.location ?? "",
        AddedDate:       fmtDate(b.createdAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",           label: "Title" },
          { key: "Author",          label: "Author" },
          { key: "Category",        label: "Category" },
          { key: "Language",        label: "Language" },
          { key: "MaterialType",    label: "Type" },
          { key: "ISBN",            label: "ISBN" },
          { key: "TotalCopies",     label: "Total" },
          { key: "AvailableCopies", label: "Available" },
          { key: "Location",        label: "Location" },
          { key: "AddedDate",       label: "Added" },
        ],
        rows,
      };
    }

    // ── Books by Language ───────────────────────────────────────────
    case "books-by-language": {
      const grouped = await prisma.book.groupBy({
        by:      ["language"],
        _count:  { id: true },
        orderBy: { _count: { id: "desc" } },
      });
      const rows: Row[] = grouped.map((g) => ({
        Language: g.language ?? "Unknown",
        Count:    g._count.id,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Language", label: "Language" },
          { key: "Count",    label: "Count" },
        ],
        rows,
      };
    }

    // ── Books by Category/Topic ─────────────────────────────────────
    case "books-by-category": {
      const books = await prisma.book.findMany({
        include: { author: true, category: true },
        orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
      });
      const rows: Row[] = books.map((b) => ({
        Category:        b.category?.name ?? "Uncategorized",
        Title:           b.title,
        Author:          b.author?.name ?? "",
        Language:        b.language ?? "",
        TotalCopies:     b.totalCopies,
        AvailableCopies: b.availableCopies,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Category",        label: "Category" },
          { key: "Title",           label: "Title" },
          { key: "Author",          label: "Author" },
          { key: "Language",        label: "Language" },
          { key: "TotalCopies",     label: "Total" },
          { key: "AvailableCopies", label: "Available" },
        ],
        rows,
      };
    }

    // ── Count Books by Category ─────────────────────────────────────
    case "count-by-category": {
      const grouped = await prisma.book.groupBy({
        by:      ["categoryId"],
        _count:  { id: true },
        _sum:    { totalCopies: true },
        orderBy: { _count: { id: "desc" } },
      });
      const catIds = grouped.map((g) => g.categoryId).filter(Boolean) as string[];
      const cats   = await prisma.category.findMany({ where: { id: { in: catIds } } });
      const catMap = new Map(cats.map((c) => [c.id, c.name]));
      const rows: Row[] = grouped.map((g) => ({
        Category:    g.categoryId ? (catMap.get(g.categoryId) ?? "Unknown") : "Uncategorized",
        TitleCount:  g._count.id,
        TotalCopies: g._sum.totalCopies ?? 0,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Category",    label: "Category" },
          { key: "TitleCount",  label: "Title Count" },
          { key: "TotalCopies", label: "Total" },
        ],
        rows,
      };
    }

    // ── Book Copies by Status ───────────────────────────────────────
    case "copies-by-status": {
      const copies = await prisma.bookCopy.findMany({
        include: { book: { select: { title: true, isbn: true } } },
        orderBy: [{ status: "asc" }, { book: { title: "asc" } }, { copyNumber: "asc" }],
      });
      const rows: Row[] = copies.map((c) => ({
        BookTitle:  c.book.title,
        ISBN:       c.book.isbn ?? "",
        CopyNumber: c.copyNumber,
        Barcode:    c.barcode ?? "",
        Status:     c.status,
        Condition:  c.condition,
        Loanable:   c.loanable ? "Yes" : "No",
        AcquiredAt: fmtDate(c.acquiredAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "BookTitle",  label: "Book Title" },
          { key: "ISBN",       label: "ISBN" },
          { key: "CopyNumber", label: "Copy #" },
          { key: "Barcode",    label: "Barcode" },
          { key: "Status",     label: "Status" },
          { key: "Condition",  label: "Condition" },
          { key: "Loanable",   label: "Loanable" },
          { key: "AcquiredAt", label: "Acquired" },
        ],
        rows,
      };
    }

    // ── Total Copies per Title ──────────────────────────────────────
    case "total-copies": {
      const books = await prisma.book.findMany({
        include: { author: true, category: true },
        orderBy: { totalCopies: "desc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:           b.title,
        Author:          b.author?.name ?? "",
        Category:        b.category?.name ?? "",
        Language:        b.language ?? "",
        TotalCopies:     b.totalCopies,
        AvailableCopies: b.availableCopies,
        MaterialType:    b.materialType,
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",           label: "Title" },
          { key: "Author",          label: "Author" },
          { key: "Category",        label: "Category" },
          { key: "TotalCopies",     label: "Total" },
          { key: "AvailableCopies", label: "Available" },
          { key: "Language",        label: "Language" },
          { key: "MaterialType",    label: "Type" },
        ],
        rows,
      };
    }


    // ── New Acquisitions ────────────────────────────────────────────
    case "new-acquisitions": {
      const dateFilter = from && to
        ? { gte: from, lte: to }
        : { gte: subMonths(now, 1) };
      const books = await prisma.book.findMany({
        where:   { createdAt: dateFilter },
        include: { author: true, category: true, publisher: true },
        orderBy: { createdAt: "desc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:        b.title,
        TitleKm:      b.titleKm ?? "",
        Author:       b.author?.name ?? "",
        Category:     b.category?.name ?? "",
        Publisher:    b.publisher?.name ?? "",
        MaterialType: b.materialType,
        ISBN:         b.isbn ?? "",
        Language:     b.language ?? "",
        TotalCopies:  b.totalCopies,
        AddedDate:    fmtDate(b.createdAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",        label: "Title" },
          { key: "Author",       label: "Author" },
          { key: "Category",     label: "Category" },
          { key: "MaterialType", label: "Type" },
          { key: "ISBN",         label: "ISBN" },
          { key: "TotalCopies",  label: "Copies" },
          { key: "AddedDate",    label: "Added" },
        ],
        rows,
      };
    }

    // ── Copies Added in Period ──────────────────────────────────────
    case "copies-added": {
      const dateFilter = from && to
        ? { gte: from, lte: addDays(to, 1) }
        : { gte: subMonths(now, 1) };
      const copies = await prisma.bookCopy.findMany({
        where:   { acquiredAt: dateFilter },
        include: { book: { include: { author: true, category: true } } },
        orderBy: { acquiredAt: "desc" },
      });
      const rows: Row[] = copies.map((c) => ({
        BookTitle:  c.book.title,
        Author:     c.book.author?.name ?? "",
        Category:   c.book.category?.name ?? "",
        CopyNumber: c.copyNumber,
        Barcode:    c.barcode ?? "",
        Condition:  c.condition,
        Status:     c.status,
        AcquiredAt: fmtDate(c.acquiredAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "BookTitle",  label: "Book Title" },
          { key: "Author",     label: "Author" },
          { key: "Category",   label: "Category" },
          { key: "CopyNumber", label: "Copy #" },
          { key: "Barcode",    label: "Barcode" },
          { key: "Condition",  label: "Condition" },
          { key: "Status",     label: "Status" },
          { key: "AcquiredAt", label: "Acquired" },
        ],
        rows,
      };
    }

    // ── Low Stock ───────────────────────────────────────────────────
    case "low-stock": {
      const books = await prisma.book.findMany({
        where:   { availableCopies: 0, totalCopies: { gt: 0 }, ...(branchId && { branchId }) },
        include: { author: true, category: true },
        orderBy: { title: "asc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:           b.title,
        Author:          b.author?.name ?? "",
        Category:        b.category?.name ?? "",
        TotalCopies:     b.totalCopies,
        AvailableCopies: b.availableCopies,
        Location:        b.location ?? "",
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",           label: "Title" },
          { key: "Author",          label: "Author" },
          { key: "Category",        label: "Category" },
          { key: "TotalCopies",     label: "Total" },
          { key: "AvailableCopies", label: "Available" },
          { key: "Location",        label: "Location" },
        ],
        rows,
      };
    }

    // ── Never Borrowed ──────────────────────────────────────────────
    case "never-borrowed": {
      const books = await prisma.book.findMany({
        where:   { loans: { none: {} } },
        include: { author: true, category: true },
        orderBy: { createdAt: "desc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:       b.title,
        Author:      b.author?.name ?? "",
        Category:    b.category?.name ?? "",
        TotalCopies: b.totalCopies,
        AddedDate:   fmtDate(b.createdAt),
        Location:    b.location ?? "",
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",       label: "Title" },
          { key: "Author",      label: "Author" },
          { key: "Category",    label: "Category" },
          { key: "TotalCopies", label: "Copies" },
          { key: "AddedDate",   label: "Added" },
          { key: "Location",    label: "Location" },
        ],
        rows,
      };
    }

    // ── Books with E-Resources ──────────────────────────────────────
    case "with-ebooks": {
      const books = await prisma.book.findMany({
        where:   { ebooks: { some: {} } },
        include: { author: true, category: true, ebooks: { select: { id: true, ebookType: true } } },
        orderBy: { title: "asc" },
      });
      const rows: Row[] = books.map((b) => ({
        Title:       b.title,
        Author:      b.author?.name ?? "",
        Category:    b.category?.name ?? "",
        EbookCount:  b.ebooks.length,
        EbookTypes:  [...new Set(b.ebooks.map((e) => e.ebookType))].join(", "),
        TotalCopies: b.totalCopies,
        ISBN:        b.isbn ?? "",
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Title",      label: "Title" },
          { key: "Author",     label: "Author" },
          { key: "Category",   label: "Category" },
          { key: "EbookCount", label: "E-Resources" },
          { key: "EbookTypes", label: "Types" },
          { key: "TotalCopies",label: "Copies" },
          { key: "ISBN",       label: "ISBN" },
        ],
        rows,
      };
    }

    // ── Most Borrowed Books in Period ───────────────────────────────
    case "most-borrowed": {
      const dateWhere = from && to
        ? { borrowDate: { gte: from, lte: addDays(to, 1) } }
        : {};
      const loanGroups = await prisma.loan.groupBy({
        by:      ["bookId"],
        _count:  { id: true },
        where:   dateWhere,
        orderBy: { _count: { id: "desc" } },
        take:    50,
      });
      const bookIds = loanGroups.map((l) => l.bookId);
      const books   = await prisma.book.findMany({
        where:   { id: { in: bookIds } },
        include: { author: true, category: true },
      });
      const bookMap = new Map(books.map((b) => [b.id, b]));
      const rows: Row[] = loanGroups.map((l, i) => {
        const b = bookMap.get(l.bookId);
        return {
          Rank:      i + 1,
          Title:     b?.title ?? "",
          Author:    b?.author?.name ?? "",
          Category:  b?.category?.name ?? "",
          LoanCount: l._count.id,
        };
      });
      return {
        count: rows.length,
        columns: [
          { key: "Rank",      label: "Rank" },
          { key: "Title",     label: "Title" },
          { key: "Author",    label: "Author" },
          { key: "Category",  label: "Category" },
          { key: "LoanCount", label: "Loan Count" },
        ],
        rows,
      };
    }

    // ── Top Borrowers in Period ─────────────────────────────────────
    case "top-borrowers": {
      const dateWhere = from && to
        ? { borrowDate: { gte: from, lte: addDays(to, 1) } }
        : {};
      const loanGroups = await prisma.loan.groupBy({
        by:      ["memberId"],
        _count:  { id: true },
        where:   dateWhere,
        orderBy: { _count: { id: "desc" } },
        take:    50,
      });
      const memberIds = loanGroups.map((l) => l.memberId);
      const members   = await prisma.member.findMany({ where: { id: { in: memberIds } } });
      const memMap    = new Map(members.map((m) => [m.id, m]));
      const rows: Row[] = loanGroups.map((l, i) => {
        const m = memMap.get(l.memberId);
        return {
          Rank:       i + 1,
          Name:       m?.name ?? "",
          MemberID:   m?.memberId ?? "",
          MemberType: m?.memberType ?? "",
          LoanCount:  l._count.id,
          Email:      m?.email ?? "",
        };
      });
      return {
        count: rows.length,
        columns: [
          { key: "Rank",       label: "Rank" },
          { key: "Name",       label: "Name" },
          { key: "MemberID",   label: "Member ID" },
          { key: "MemberType", label: "Member Type" },
          { key: "LoanCount",  label: "Loan Count" },
          { key: "Email",      label: "Email" },
        ],
        rows,
      };
    }

    // ── Most Read Category (Section) ────────────────────────────────
    case "most-read-category": {
      const dateWhere = from && to
        ? { borrowDate: { gte: from, lte: addDays(to, 1) } }
        : {};
      // Group loans by book, then aggregate by category client-side
      const loanGroups = await prisma.loan.groupBy({
        by:    ["bookId"],
        _count: { id: true },
        where:  dateWhere,
      });
      const bookIds = loanGroups.map((l) => l.bookId);
      const books   = await prisma.book.findMany({
        where:  { id: { in: bookIds } },
        select: { id: true, category: { select: { name: true } } },
      });
      const bookCatMap = new Map(books.map((b) => [b.id, b.category?.name ?? "Uncategorized"]));
      const catCount: Record<string, number> = {};
      for (const l of loanGroups) {
        const cat = bookCatMap.get(l.bookId) ?? "Uncategorized";
        catCount[cat] = (catCount[cat] ?? 0) + l._count.id;
      }
      const rows: Row[] = Object.entries(catCount)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, cnt], i) => ({ Rank: i + 1, Category: cat, LoanCount: cnt }));
      return {
        count: rows.length,
        columns: [
          { key: "Rank",      label: "Rank" },
          { key: "Category",  label: "Category" },
          { key: "LoanCount", label: "Loan Count" },
        ],
        rows,
      };
    }

    // ── List of Borrowers ───────────────────────────────────────────
    case "borrowers-list": {
      const members = await prisma.member.findMany({
        where:   { loans: { some: {} } },
        include: { _count: { select: { loans: true } } },
        orderBy: { name: "asc" },
      });
      const rows: Row[] = members.map((m) => ({
        Name:       m.name,
        MemberID:   m.memberId,
        MemberType: m.memberType,
        Email:      m.email ?? "",
        Phone:      m.phone ?? "",
        TotalLoans: m._count.loans,
        JoinDate:   fmtDate(m.joinDate),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Name",       label: "Name" },
          { key: "MemberID",   label: "Member ID" },
          { key: "MemberType", label: "Member Type" },
          { key: "TotalLoans", label: "Loan Count" },
          { key: "JoinDate",   label: "Join Date" },
          { key: "Email",      label: "Email" },
          { key: "Phone",      label: "Phone" },
        ],
        rows,
      };
    }

    // ── Book Requests ───────────────────────────────────────────────
    case "book-requests": {
      const requests = await prisma.bookRequest.findMany({
        include: { member: { select: { name: true, memberId: true } } },
        orderBy: { createdAt: "desc" },
      });
      const rows: Row[] = requests.map((r) => ({
        MemberName: r.member?.name ?? "",
        MemberID:   r.member?.memberId ?? "",
        Title:      r.title,
        Author:     r.author ?? "",
        ISBN:       r.isbn ?? "",
        Status:     r.status,
        Notes:      r.notes ?? "",
        AdminNote:  r.adminNote ?? "",
        CreatedAt:  fmtDate(r.createdAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "MemberName", label: "Member" },
          { key: "MemberID",   label: "Member ID" },
          { key: "Title",      label: "Book Title" },
          { key: "Author",     label: "Author" },
          { key: "Status",     label: "Status" },
          { key: "Notes",      label: "Reason" },
          { key: "CreatedAt",  label: "Requested" },
        ],
        rows,
      };
    }

    // ── Expiring Memberships ────────────────────────────────────────
    case "expiring-members": {
      const in30Days = addDays(now, 30);
      const members  = await prisma.member.findMany({
        where:   { isActive: true, expireDate: { gte: now, lte: in30Days } },
        orderBy: { expireDate: "asc" },
      });
      const rows: Row[] = members.map((m) => ({
        Name:       m.name,
        MemberID:   m.memberId,
        Email:      m.email ?? "",
        Phone:      m.phone ?? "",
        MemberType: m.memberType,
        ExpireDate: fmtDate(m.expireDate),
        DaysLeft:   Math.floor((m.expireDate!.getTime() - now.getTime()) / 86_400_000),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Name",       label: "Name" },
          { key: "MemberID",   label: "Member ID" },
          { key: "MemberType", label: "Type" },
          { key: "ExpireDate", label: "Expires" },
          { key: "DaysLeft",   label: "Days Left" },
          { key: "Email",      label: "Email" },
          { key: "Phone",      label: "Phone" },
        ],
        rows,
      };
    }

    // ── Tagged Basket Items ─────────────────────────────────────────
    case "basket-tagged": {
      const items = await prisma.basketItem.findMany({
        where:   { tagged: true },
        include: {
          basket: { select: { name: true } },
          book:   { select: { title: true, isbn: true } },
          copy:   { select: { barcode: true, copyNumber: true, condition: true } },
        },
        orderBy: { addedAt: "desc" },
      });
      const rows: Row[] = items.map((i) => ({
        Basket:     i.basket.name,
        BookTitle:  i.book.title,
        ISBN:       i.book.isbn ?? "",
        CopyNumber: i.copy.copyNumber,
        Barcode:    i.copy.barcode ?? "",
        Condition:  i.copy.condition,
        AddedAt:    fmtDate(i.addedAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Basket",    label: "Basket" },
          { key: "BookTitle", label: "Book Title" },
          { key: "ISBN",      label: "ISBN" },
          { key: "CopyNumber",label: "Copy #" },
          { key: "Barcode",   label: "Barcode" },
          { key: "Condition", label: "Condition" },
          { key: "AddedAt",   label: "Added" },
        ],
        rows,
      };
    }

    // ── Untagged Basket Items ───────────────────────────────────────
    case "basket-untagged": {
      const items = await prisma.basketItem.findMany({
        where:   { tagged: false },
        include: {
          basket: { select: { name: true } },
          book:   { select: { title: true, isbn: true } },
          copy:   { select: { barcode: true, copyNumber: true, condition: true } },
        },
        orderBy: { addedAt: "desc" },
      });
      const rows: Row[] = items.map((i) => ({
        Basket:     i.basket.name,
        BookTitle:  i.book.title,
        ISBN:       i.book.isbn ?? "",
        CopyNumber: i.copy.copyNumber,
        Barcode:    i.copy.barcode ?? "",
        Condition:  i.copy.condition,
        AddedAt:    fmtDate(i.addedAt),
      }));
      return {
        count: rows.length,
        columns: [
          { key: "Basket",    label: "Basket" },
          { key: "BookTitle", label: "Book Title" },
          { key: "ISBN",      label: "ISBN" },
          { key: "CopyNumber",label: "Copy #" },
          { key: "Barcode",   label: "Barcode" },
          { key: "Condition", label: "Condition" },
          { key: "AddedAt",   label: "Added" },
        ],
        rows,
      };
    }

    default:
      return { count: 0, columns: [], rows: [] };
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type     = searchParams.get("type") ?? "overdue";
  const fmt      = searchParams.get("format");
  const from     = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to       = searchParams.get("to")   ? new Date(searchParams.get("to")!)   : undefined;
  const branchId = searchParams.get("branchId") ?? undefined;
  const now      = new Date();

  const { columns, rows, count } = await buildReport(type, now, from, to, branchId);

  // ── JSON response ─────────────────────────────────────────────────
  if (!fmt) {
    return NextResponse.json({ type, count, columns, rows });
  }

  const filename = `pvd-${type}-${format(now, "yyyy-MM-dd")}`;

  // ── CSV export ────────────────────────────────────────────────────
  if (fmt === "csv") {
    const header = columns.map((c) => c.label).join(",");
    const lines  = rows.map((r) =>
      columns.map((c) => {
        const v = String(r[c.key] ?? "");
        return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    );
    const csv = [header, ...lines].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // ── Excel export ──────────────────────────────────────────────────
  const sheetData = rows.map((r) =>
    Object.fromEntries(columns.map((c) => [c.label, r[c.key] ?? ""]))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), type.slice(0, 31));
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
