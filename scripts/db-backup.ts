/**
 * db-backup.ts
 * Run: npm run db:backup
 *
 * Creates a timestamped backup in /backups/<timestamp>/
 *   - full-backup.sql   (pg_dump — requires pg_dump in PATH)
 *   - snapshot.json     (Prisma JSON dump of every table)
 *   - manifest.json     (row counts + metadata)
 */

import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);

  const backupDir = join(process.cwd(), "backups", timestamp);
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  console.log("\n📦  PVD Library — Database Backup");
  console.log(`📁  Destination: ${backupDir}\n`);

  // ── 1. pg_dump (SQL) ─────────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const sqlFile = join(backupDir, "full-backup.sql");
      execSync(`pg_dump "${dbUrl}" --no-password -f "${sqlFile}"`, {
        stdio: "pipe",
      });
      console.log("✅  SQL dump       → full-backup.sql");
    } catch {
      console.warn(
        "⚠️   pg_dump failed — install PostgreSQL client tools and add to PATH\n" +
        "     Download: https://www.postgresql.org/download/\n" +
        "     Falling back to JSON snapshot only.\n"
      );
    }
  }

  // ── 2. JSON snapshot via Prisma ──────────────────────────────────────────
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

  console.log("📄  Exporting tables:");
  for (const { name, fn } of tables) {
    const rows = await fn();
    snapshot[name] = rows;
    tableCounts[name] = rows.length;
    totalRows += rows.length;
    console.log(`      ${name.padEnd(16)} ${rows.length} rows`);
  }

  // Combined JSON snapshot
  writeFileSync(
    join(backupDir, "snapshot.json"),
    JSON.stringify(snapshot, null, 2),
    "utf-8"
  );

  // Manifest
  const manifest = {
    createdAt: new Date().toISOString(),
    totalRows,
    tables: tableCounts,
    databaseUrl: dbUrl?.replace(/:([^@]+)@/, ":***@"), // mask password
  };
  writeFileSync(
    join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  console.log(`\n✅  Backup complete!`);
  console.log(`    Total rows : ${totalRows}`);
  console.log(`    Location   : ${backupDir}\n`);
}

main()
  .catch((e) => { console.error("❌  Backup failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
