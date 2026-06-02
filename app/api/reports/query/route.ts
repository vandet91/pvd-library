import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/reports/query
 * Runs a read-only custom SQL query and returns columns + rows.
 * Restricted to ADMIN role. Only SELECT statements are allowed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const sql: string = (body.sql ?? "").trim();

  if (!sql) return NextResponse.json({ error: "No SQL provided" }, { status: 400 });

  // Block anything that isn't a plain SELECT
  const normalized = sql.replace(/\s+/g, " ").toUpperCase();
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL|COPY|VACUUM|ANALYZE)\b/;
  if (forbidden.test(normalized))
    return NextResponse.json({ error: "Only SELECT queries are allowed" }, { status: 400 });
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH"))
    return NextResponse.json({ error: "Query must start with SELECT or WITH" }, { status: 400 });

  // Enforce a row cap so nobody accidentally pulls the entire DB
  const cappedSql = /\bLIMIT\b/i.test(sql) ? sql : `${sql} LIMIT 1000`;

  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(cappedSql);

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ columns: [], rows: [], count: 0 });

    const columns = Object.keys(rows[0]).map((key) => ({ key, label: key }));
    const serialized = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          v instanceof Date ? v.toISOString() :
          typeof v === "bigint" ? Number(v) :
          v ?? null,
        ]),
      ),
    );

    return NextResponse.json({ columns, rows: serialized, count: serialized.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
