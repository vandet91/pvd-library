import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { parseExcelBuffer, parseCSVText } from "@/lib/excel";
import { generateMemberId } from "@/lib/utils";

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

  const validTypes   = ["STUDENT", "TEACHER", "STAFF", "PUBLIC"];
  const validGenders = ["MALE", "FEMALE", "UNSPECIFIED"];
  let created = 0, skipped = 0;

  for (const row of rows) {
    const name = String(row["Name"] ?? row["name"] ?? "").trim();
    if (!name) { skipped++; continue; }

    const memberType = validTypes.includes(String(row["Type"] ?? "").toUpperCase())
      ? String(row["Type"]).toUpperCase() as "STUDENT"|"TEACHER"|"STAFF"|"PUBLIC"
      : "STUDENT";

    const genderRaw = String(row["Gender"] ?? "").toUpperCase().trim();
    const gender = validGenders.includes(genderRaw)
      ? genderRaw as "MALE"|"FEMALE"|"UNSPECIFIED"
      : "UNSPECIFIED";

    const studentId = String(row["StudentID"] ?? row["Student ID"] ?? "").trim() || undefined;
    const school    = String(row["School"]    ?? "").trim() || undefined;
    const className = String(row["Class"]     ?? "").trim() || undefined;

    try {
      await prisma.member.create({
        data: {
          memberId:   generateMemberId(),
          name,
          email:      String(row["Email"]   ?? "").trim() || undefined,
          phone:      String(row["Phone"]   ?? "").trim() || undefined,
          address:    String(row["Address"] ?? "").trim() || undefined,
          memberType,
          gender,
          studentId,
          school,
          className,
          expireDate: row["ExpireDate"] ? new Date(String(row["ExpireDate"])) : undefined,
        },
      });
      created++;
    } catch { skipped++; }
  }

  return NextResponse.json({ created, skipped, total: rows.length });
}

// Template download
export async function GET() {
  const { exportToExcel } = await import("@/lib/excel");
  const template = [
    { Name: "Sok Dara",    Email: "sokdara@example.com", Phone: "012345678", Address: "Phnom Penh", Type: "STUDENT", Gender: "MALE",   StudentID: "STU-2024-001", School: "Hun Sen High School", Class: "12A", ExpireDate: "2025-12-31" },
    { Name: "Kim Sreyleak", Email: "",                   Phone: "",          Address: "",            Type: "STUDENT", Gender: "FEMALE", StudentID: "STU-2024-002", School: "Hun Sen High School", Class: "11B", ExpireDate: "2025-12-31" },
    { Name: "Chan Piseth",  Email: "piseth@example.com", Phone: "",          Address: "",            Type: "TEACHER", Gender: "MALE",   StudentID: "",             School: "",                   Class: "",    ExpireDate: "" },
  ];
  const buf = exportToExcel(template as Record<string, unknown>[], "Members", "template");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="members-template.xlsx"',
    },
  });
}
