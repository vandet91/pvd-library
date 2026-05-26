import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { parseExcelBuffer, parseCSVText, exportToExcel } from "@/lib/excel";

/** Find or create a record by name (case-insensitive). */
async function findOrCreate<T extends { id: string }>(
  findFn: () => Promise<T | null>,
  createFn: () => Promise<T>
): Promise<T> {
  const existing = await findFn();
  return existing ?? createFn();
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isCSV  = file.name.endsWith(".csv");

  let rows: Record<string, unknown>[];
  try {
    rows = isCSV
      ? parseCSVText(buffer.toString("utf-8"))
      : parseExcelBuffer(buffer);
  } catch {
    return NextResponse.json({ error: "Failed to parse file" }, { status: 400 });
  }

  let created = 0, skipped = 0;

  for (const row of rows) {
    const title = String(row["Title"] ?? row["title"] ?? "").trim();
    if (!title) { skipped++; continue; }

    try {
      // Find or create Author (no unique constraint on name → findFirst + create)
      let authorId: string | undefined;
      const authorName = String(row["Author"] ?? "").trim();
      if (authorName) {
        const author = await findOrCreate(
          () => prisma.author.findFirst({ where: { name: { equals: authorName, mode: "insensitive" } } }),
          () => prisma.author.create({ data: { name: authorName } })
        );
        authorId = author.id;
      }

      // Find or create Category (has @unique on name → upsert works)
      let categoryId: string | undefined;
      const categoryName = String(row["Category"] ?? "").trim();
      if (categoryName) {
        const cat = await prisma.category.upsert({
          where:  { name: categoryName },
          update: {},
          create: { name: categoryName },
        });
        categoryId = cat.id;
      }

      // Find or create Publisher (no unique constraint on name → findFirst + create)
      let publisherId: string | undefined;
      const publisherName = String(row["Publisher"] ?? "").trim();
      if (publisherName) {
        const pub = await findOrCreate(
          () => prisma.publisher.findFirst({ where: { name: { equals: publisherName, mode: "insensitive" } } }),
          () => prisma.publisher.create({ data: { name: publisherName } })
        );
        publisherId = pub.id;
      }

      // Find or create Location from the "Location" column — keeps the string
      // value AND links to the managed Location row so dropdowns stay clean.
      let locationId: string | undefined;
      const locationName = String(row["Location"] ?? "").trim();
      if (locationName) {
        const loc = await prisma.location.upsert({
          where:  { name: locationName },
          update: {},
          create: { name: locationName },
        });
        locationId = loc.id;
      }

      const totalCopies = parseInt(String(row["TotalCopies"] ?? "1"), 10) || 1;
      const isbn = String(row["ISBN"] ?? "").trim() || undefined;
      const priceRaw = String(row["Price"] ?? "").trim();
      const price    = priceRaw ? (parseFloat(priceRaw) || undefined) : undefined;

      const VALID_MATERIAL_TYPES = ["BOOK","MAGAZINE","JOURNAL","NEWSPAPER","DVD","AUDIO_CD","THESIS","MAP","OTHER"] as const;
      const rawMaterialType = String(row["MaterialType"] ?? "").trim().toUpperCase();
      const materialType = (VALID_MATERIAL_TYPES as readonly string[]).includes(rawMaterialType)
        ? (rawMaterialType as typeof VALID_MATERIAL_TYPES[number])
        : "BOOK";

      // Resolve co-authors (semicolon-separated list, e.g. "Jane Doe; John Smith")
      const coAuthorsRaw = String(row["CoAuthors"] ?? "").trim();
      const coAuthorIds: string[] = [];
      if (coAuthorsRaw) {
        const names = coAuthorsRaw.split(";").map((n) => n.trim()).filter(Boolean);
        for (const name of names) {
          const a = await findOrCreate(
            () => prisma.author.findFirst({ where: { name: { equals: name, mode: "insensitive" } } }),
            () => prisma.author.create({ data: { name } })
          );
          if (a.id !== authorId) coAuthorIds.push(a.id); // skip if same as primary
        }
      }

      // Auto-generate a system barcode for each imported book (matches the manual-create flow)
      const { generateBarcode } = await import("@/lib/barcode");
      const sysBarcode = await generateBarcode();

      await prisma.$transaction(async (tx) => {
        const created = await tx.book.create({
          data: {
            title,
            titleKm:      String(row["TitleKm"]     ?? "").trim() || undefined,
            subtitle:     String(row["Subtitle"]    ?? "").trim() || undefined,
            edition:      String(row["Edition"]     ?? "").trim() || undefined,
            isbn,
            barcode:      sysBarcode,
            description:  String(row["Description"] ?? "").trim() || undefined,
            publishYear:  row["PublishYear"] ? parseInt(String(row["PublishYear"]), 10) || undefined : undefined,
            pages:        row["Pages"]       ? parseInt(String(row["Pages"]),       10) || undefined : undefined,
            language:     String(row["Language"]    ?? "en").trim() || "en",
            location:     String(row["Location"]    ?? "").trim()   || undefined,
            locationId,
            totalCopies,
            availableCopies: totalCopies,
            price,
            materialType,
            authorId,
            categoryId,
            publisherId,
            ...(coAuthorIds.length > 0 && {
              coAuthors: { connect: coAuthorIds.map((cid) => ({ id: cid })) },
            }),
          },
        });
        // Auto-generate N copies, matching the manual-create behavior
        for (let i = 1; i <= totalCopies; i++) {
          const pad = String(i).padStart(3, "0");
          await tx.bookCopy.create({
            data: {
              bookId:     created.id,
              copyNumber: i,
              barcode:    i === 1 ? sysBarcode : `${sysBarcode}-C${pad}`,
              condition:  "GOOD",
              status:     "AVAILABLE",
              price:      price ?? null,
            },
          });
        }
      });
      created++;
    } catch { skipped++; }
  }

  return NextResponse.json({ created, skipped, total: rows.length });
}

// Template download
export async function GET() {
  const template = [
    {
      Title: "Introduction to Computer Science",
      Subtitle: "A Modern Approach",
      Edition: "3rd",
      TitleKm: "ការណែនាំអំពីវិទ្យាសាស្ត្រកុំព្យូទ័រ",
      ISBN: "978-0-13-110362-7",
      MaterialType: "BOOK",
      Author: "John Smith",
      CoAuthors: "Jane Doe; Alex Park",
      Category: "Technology",
      Publisher: "Tech Press",
      PublishYear: 2023,
      Pages: 450,
      Language: "en",
      Location: "A1-01",
      TotalCopies: 3,
      Price: 24.99,
      Description: "A comprehensive introduction to computer science fundamentals.",
    },
    {
      Title: "Khmer History",
      Subtitle: "",
      Edition: "",
      TitleKm: "ប្រវត្តិសាស្ត្រខ្មែរ",
      ISBN: "",
      MaterialType: "BOOK",
      Author: "Sok Dara",
      CoAuthors: "",
      Category: "History",
      Publisher: "Phnom Penh Press",
      PublishYear: 2020,
      Pages: 320,
      Language: "km",
      Location: "B2-05",
      TotalCopies: 2,
      Price: 12.50,
      Description: "",
    },
    {
      Title: "Science Monthly",
      Subtitle: "",
      Edition: "",
      TitleKm: "",
      ISBN: "",
      MaterialType: "MAGAZINE",
      Author: "Various Authors",
      CoAuthors: "",
      Category: "Science",
      Publisher: "Science Press",
      PublishYear: 2024,
      Pages: 80,
      Language: "en",
      Location: "M1-01",
      TotalCopies: 1,
      Price: "",
      Description: "Monthly science magazine.",
    },
  ];
  const buf = exportToExcel(template as Record<string, unknown>[], "Books", "template");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="books-template.xlsx"',
    },
  });
}
