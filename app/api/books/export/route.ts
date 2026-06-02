import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { exportToExcel, exportToCSV } from "@/lib/excel";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fmt = searchParams.get("format") ?? "xlsx";
  const ids = searchParams.get("ids");

  const books = await prisma.book.findMany({
    where: ids ? { id: { in: ids.split(",") } } : {},
    include: { category: true, author: true, coAuthors: true, publisher: true, shelfLocation: true },
    orderBy: { title: "asc" },
  });

  const rows = books.map((b) => ({
    Title:        b.title,
    Subtitle:     b.subtitle ?? "",
    Edition:      b.edition ?? "",
    TitleKm:      b.titleKm ?? "",
    ISBN:         b.isbn ?? "",
    Barcode:      b.barcode ?? "",
    MaterialType:  b.materialType,
    AudienceLevel: b.audienceLevel,
    Author:       b.author?.name ?? "",
    CoAuthors:    b.coAuthors.map((a) => a.name).join("; "),
    Category:     b.category?.name ?? "",
    Publisher:    b.publisher?.name ?? "",
    PublishYear:  b.publishYear ?? "",
    Pages:        b.pages ?? "",
    Language:     b.language ?? "",
    CallNumber:   b.callNumber ?? "",
    Location:     b.shelfLocation?.name ?? b.location ?? "",
    TotalCopies:    b.totalCopies,
    AvailableCopies: b.availableCopies,
    ReferenceOnly:  b.referenceOnly ? "Yes" : "",
    Price:          b.price ?? "",
    Description:    b.description ?? "",
  }));

  if (fmt === "csv") {
    const csv = exportToCSV(rows as Record<string, unknown>[]);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="books-${Date.now()}.csv"`,
      },
    });
  }

  const buf = exportToExcel(rows as Record<string, unknown>[], "Books", "books");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="books-${Date.now()}.xlsx"`,
    },
  });
}
