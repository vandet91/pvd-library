import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync, statSync, rmSync } from "fs";
import { join } from "path";

/* ── SQL table name map (snapshot key → PostgreSQL table name) ── */
const SQL_TABLE: Record<string, string> = {
  settings:       "Settings",
  users:          "User",
  authors:        "Author",
  publishers:     "Publisher",
  categories:     "Category",
  locations:      "Location",
  members:        "Member",
  books:          "Book",
  bookCopies:     "BookCopy",
  ebooks:         "Ebook",
  loans:          "Loan",
  fines:          "Fine",
  reservations:   "Reservation",
  bookRequests:   "BookRequest",
  baskets:        "Basket",
  basketItems:    "BasketItem",
  notifications:  "Notification",
  inventory:      "Inventory",
  inventoryItems: "InventoryItem",
};

/** Escape a value for PostgreSQL SQL literal. */
function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean")        return v ? "TRUE" : "FALSE";
  if (typeof v === "number")         return String(v);
  // Dates stored as ISO strings
  const str = String(v).replace(/'/g, "''");
  return `'${str}'`;
}

/** Convert a snapshot to a PostgreSQL .sql dump string. */
function buildSqlDump(
  snapshot:  Record<string, unknown[]>,
  manifest:  { createdAt: string; createdBy: string; totalRows: number },
  timestamp: string,
): string {
  const lines: string[] = [
    `-- ============================================================`,
    `-- PVD Library Database Backup`,
    `-- Timestamp : ${timestamp}`,
    `-- Created   : ${manifest.createdAt}`,
    `-- Created by: ${manifest.createdBy ?? "unknown"}`,
    `-- Total rows: ${manifest.totalRows}`,
    `-- ============================================================`,
    `-- This file contains INSERT statements for PostgreSQL.`,
    `-- Run against a fresh PVD Library database schema.`,
    `-- ============================================================`,
    ``,
    `BEGIN;`,
    ``,
    `-- Disable triggers to bypass FK checks during restore`,
    `SET session_replication_role = replica;`,
    ``,
  ];

  // Truncate in child-first order
  const truncateOrder = [
    "InventoryItem","Inventory","BasketItem","Basket",
    "Notification","Fine","Loan","Reservation","BookRequest",
    "BookCopy","Ebook","Book","Member","Settings","User",
    "Author","Publisher","Category","Location",
  ];
  lines.push(`-- Clear all tables`);
  lines.push(`TRUNCATE TABLE ${truncateOrder.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`);
  lines.push(``);

  // Insert in parent-first order
  const insertOrder = [
    "settings","users","authors","publishers","categories","locations",
    "members","books","bookCopies","ebooks","loans","fines",
    "reservations","bookRequests","baskets","basketItems",
    "notifications","inventory","inventoryItems",
  ];

  for (const key of insertOrder) {
    const rows = snapshot[key];
    const tbl  = SQL_TABLE[key];
    if (!rows || rows.length === 0 || !tbl) continue;

    lines.push(`-- ============================================================`);
    lines.push(`-- ${tbl} (${rows.length} rows)`);
    lines.push(`-- ============================================================`);

    const cols = Object.keys(rows[0] as Record<string, unknown>);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    // Chunk into batches of 500 to avoid huge single INSERT statements
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH) as Record<string, unknown>[];
      const values = batch
        .map((row) => `(${cols.map((c) => sqlVal(row[c])).join(", ")})`)
        .join(",\n  ");
      lines.push(`INSERT INTO "${tbl}" (${colList}) VALUES`);
      lines.push(`  ${values};`);
    }
    lines.push(``);
  }

  lines.push(`-- Re-enable triggers`);
  lines.push(`SET session_replication_role = DEFAULT;`);
  lines.push(``);
  lines.push(`COMMIT;`);
  lines.push(``);

  return lines.join("\n");
}

/** GET — list existing backups, or download one (?download=timestamp&format=json|sql) */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const backupsRoot = join(process.cwd(), "backups");
  const params      = new URL(req.url).searchParams;
  const download    = params.get("download");
  const format      = params.get("format") ?? "json"; // "json" | "sql"

  // ── Download a specific backup ──
  if (download) {
    // Prevent path traversal
    if (download.includes("/") || download.includes("\\") || download.includes(".."))
      return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });

    const snapshotPath  = join(backupsRoot, download, "snapshot.json");
    const manifestPath  = join(backupsRoot, download, "manifest.json");
    if (!existsSync(snapshotPath))
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });

    const content  = readFileSync(snapshotPath, "utf-8");

    if (format === "sql") {
      let manifest = { createdAt: download, createdBy: "", totalRows: 0 };
      try { manifest = JSON.parse(readFileSync(manifestPath, "utf-8")); } catch { /* ignore */ }
      const snapshot = JSON.parse(content) as Record<string, unknown[]>;
      const sql      = buildSqlDump(snapshot, manifest, download);
      return new NextResponse(sql, {
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="backup-${download}.sql"`,
        },
      });
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${download}.json"`,
      },
    });
  }

  // ── List all backups ──
  if (!existsSync(backupsRoot)) return NextResponse.json([]);
  const dirs = readdirSync(backupsRoot)
    .filter((d) => existsSync(join(backupsRoot, d, "manifest.json")))
    .map((d) => {
      try {
        const manifest = JSON.parse(readFileSync(join(backupsRoot, d, "manifest.json"), "utf-8"));
        const size = statSync(join(backupsRoot, d, "snapshot.json")).size;
        return { timestamp: d, ...manifest, sizeBytes: size };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));

  return NextResponse.json(dirs);
}

export async function POST() {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);

  const backupDir = join(process.cwd(), "backups", timestamp);
  mkdirSync(backupDir, { recursive: true });

  // Snapshot every table via Prisma
  const tables = [
    { name: "users",          fn: () => prisma.user.findMany()          },
    { name: "members",        fn: () => prisma.member.findMany()        },
    { name: "books",          fn: () => prisma.book.findMany()          },
    { name: "bookCopies",     fn: () => prisma.bookCopy.findMany()      },
    { name: "authors",        fn: () => prisma.author.findMany()        },
    { name: "publishers",     fn: () => prisma.publisher.findMany()     },
    { name: "categories",     fn: () => prisma.category.findMany()      },
    { name: "locations",      fn: () => prisma.location.findMany()      },
    { name: "loans",          fn: () => prisma.loan.findMany()          },
    { name: "fines",          fn: () => prisma.fine.findMany()          },
    { name: "reservations",   fn: () => prisma.reservation.findMany()   },
    { name: "ebooks",         fn: () => prisma.ebook.findMany()         },
    { name: "bookRequests",   fn: () => prisma.bookRequest.findMany()   },
    { name: "settings",       fn: () => prisma.settings.findMany()      },
    { name: "inventory",      fn: () => prisma.inventory.findMany()     },
    { name: "inventoryItems", fn: () => prisma.inventoryItem.findMany() },
    { name: "baskets",        fn: () => prisma.basket.findMany()        },
    { name: "basketItems",    fn: () => prisma.basketItem.findMany()    },
    { name: "notifications",  fn: () => prisma.notification.findMany()  },
  ] as const;

  const snapshot: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const { name, fn } of tables) {
    const rows = await fn();
    snapshot[name] = rows;
    tableCounts[name] = rows.length;
    totalRows += rows.length;
  }

  writeFileSync(join(backupDir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf-8");
  writeFileSync(
    join(backupDir, "manifest.json"),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      createdBy: session.user?.email,
      totalRows,
      tables: tableCounts,
    }, null, 2),
    "utf-8"
  );

  return NextResponse.json({ success: true, timestamp, backupDir, totalRows, tables: tableCounts });
}

/** DELETE — remove a backup folder (?timestamp=…) */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const timestamp = new URL(req.url).searchParams.get("timestamp");
  if (!timestamp)
    return NextResponse.json({ error: "timestamp required" }, { status: 400 });

  // Prevent path traversal
  if (timestamp.includes("/") || timestamp.includes("\\") || timestamp.includes(".."))
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });

  const backupDir = join(process.cwd(), "backups", timestamp);
  if (!existsSync(backupDir))
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });

  rmSync(backupDir, { recursive: true, force: true });
  return NextResponse.json({ success: true, timestamp });
}
