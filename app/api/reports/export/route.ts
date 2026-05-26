import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { exportToExcel, exportToCSV } from "@/lib/excel";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fmt = new URL(request.url).searchParams.get("format") ?? "xlsx";

  const loans = await prisma.loan.findMany({
    include: {
      member: { select: { name: true, memberId: true } },
      book:   { select: { title: true, isbn: true } },
      fine:   { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = loans.map((l) => ({
    MemberID:    l.member.memberId,
    MemberName:  l.member.name,
    BookTitle:   l.book.title,
    ISBN:        l.book.isbn ?? "",
    LoanType:    l.loanType,
    BorrowDate:  format(l.borrowDate, "yyyy-MM-dd"),
    DueDate:     format(l.dueDate, "yyyy-MM-dd"),
    ReturnDate:  l.returnDate ? format(l.returnDate, "yyyy-MM-dd") : "",
    Status:      l.status,
    FineAmount:  l.fine?.amount ?? 0,
    FineStatus:  l.fine?.status ?? "",
  }));

  if (fmt === "csv") {
    const csv = exportToCSV(rows as Record<string, unknown>[]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="loans-report-${Date.now()}.csv"`,
      },
    });
  }

  const buf = exportToExcel(rows as Record<string, unknown>[], "Loans Report", "loans");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="loans-report-${Date.now()}.xlsx"`,
    },
  });
}
