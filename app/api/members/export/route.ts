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
  const ids = new URL(request.url).searchParams.get("ids"); // comma-separated for basket export

  const members = await prisma.member.findMany({
    where: ids ? { id: { in: ids.split(",") } } : {},
    include: { _count: { select: { loans: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = members.map((m) => ({
    MemberID:   m.memberId,
    Name:       m.name,
    Email:      m.email ?? "",
    Phone:      m.phone ?? "",
    Address:    m.address ?? "",
    Type:       m.memberType,
    Gender:     m.gender ?? "UNSPECIFIED",
    StudentID:  m.studentId ?? "",
    School:     m.school ?? "",
    Class:      m.className ?? "",
    JoinDate:   format(m.joinDate, "yyyy-MM-dd"),
    ExpireDate: m.expireDate ? format(m.expireDate, "yyyy-MM-dd") : "",
    TotalLoans: m._count.loans,
    Active:     m.isActive ? "Yes" : "No",
  }));

  if (fmt === "csv") {
    const csv = exportToCSV(rows as Record<string, unknown>[]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="members-${Date.now()}.csv"`,
      },
    });
  }

  const buf = exportToExcel(rows as Record<string, unknown>[], "Members", "members");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="members-${Date.now()}.xlsx"`,
    },
  });
}
