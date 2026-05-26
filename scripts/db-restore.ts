/**
 * db-restore.ts
 * Run: npm run db:restore -- backups/2026-05-23_10-00-00
 *
 * Restores from a backup directory created by db-backup.ts.
 * Prefers the .sql dump (pg_dump); falls back to JSON snapshot restore.
 *
 * ⚠️  THIS WILL OVERWRITE YOUR CURRENT DATABASE — always back up first!
 */

import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans); }));
}

async function restoreFromSQL(backupDir: string, dbUrl: string) {
  const sqlFile = join(backupDir, "full-backup.sql");
  if (!existsSync(sqlFile)) return false;

  console.log("\n🔄  Restoring from SQL dump …");
  try {
    execSync(`psql "${dbUrl}" --no-password -f "${sqlFile}"`, { stdio: "inherit" });
    console.log("✅  SQL restore complete.");
    return true;
  } catch (e) {
    console.error("❌  psql restore failed:", e);
    return false;
  }
}

async function restoreFromJSON(backupDir: string) {
  const snapshotFile = join(backupDir, "snapshot.json");
  if (!existsSync(snapshotFile)) {
    console.error("❌  No snapshot.json found in backup directory.");
    return false;
  }

  console.log("\n🔄  Restoring from JSON snapshot …");
  console.log("    (JSON restore re-inserts rows — existing data should be cleared first)\n");

  const snapshot = JSON.parse(readFileSync(snapshotFile, "utf-8"));

  // Restore in dependency order
  if (snapshot.settings?.length) {
    for (const row of snapshot.settings) {
      await prisma.settings.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  settings        (${snapshot.settings.length})`);
  }

  if (snapshot.users?.length) {
    for (const row of snapshot.users) {
      await prisma.user.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  users           (${snapshot.users.length})`);
  }

  if (snapshot.members?.length) {
    for (const row of snapshot.members) {
      await prisma.member.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  members         (${snapshot.members.length})`);
  }

  if (snapshot.categories?.length) {
    for (const row of snapshot.categories) {
      await prisma.category.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  categories      (${snapshot.categories.length})`);
  }

  if (snapshot.authors?.length) {
    for (const row of snapshot.authors) {
      await prisma.author.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  authors         (${snapshot.authors.length})`);
  }

  if (snapshot.publishers?.length) {
    for (const row of snapshot.publishers) {
      await prisma.publisher.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  publishers      (${snapshot.publishers.length})`);
  }

  if (snapshot.locations?.length) {
    for (const row of snapshot.locations) {
      await prisma.location.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  locations       (${snapshot.locations.length})`);
  }

  if (snapshot.books?.length) {
    for (const row of snapshot.books) {
      await prisma.book.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  books           (${snapshot.books.length})`);
  }

  // Copies must come AFTER books (FK dependency)
  if (snapshot.bookCopies?.length) {
    for (const row of snapshot.bookCopies) {
      await prisma.bookCopy.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  bookCopies      (${snapshot.bookCopies.length})`);
  }

  if (snapshot.ebooks?.length) {
    for (const row of snapshot.ebooks) {
      await prisma.ebook.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  ebooks          (${snapshot.ebooks.length})`);
  }

  if (snapshot.loans?.length) {
    for (const row of snapshot.loans) {
      await prisma.loan.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  loans           (${snapshot.loans.length})`);
  }

  if (snapshot.fines?.length) {
    for (const row of snapshot.fines) {
      await prisma.fine.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  fines           (${snapshot.fines.length})`);
  }

  if (snapshot.reservations?.length) {
    for (const row of snapshot.reservations) {
      await prisma.reservation.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  reservations    (${snapshot.reservations.length})`);
  }

  if (snapshot.bookRequests?.length) {
    for (const row of snapshot.bookRequests) {
      await prisma.bookRequest.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  bookRequests    (${snapshot.bookRequests.length})`);
  }

  if (snapshot.baskets?.length) {
    for (const row of snapshot.baskets) {
      await prisma.basket.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  baskets         (${snapshot.baskets.length})`);
  }

  if (snapshot.basketItems?.length) {
    for (const row of snapshot.basketItems) {
      await prisma.basketItem.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  basketItems     (${snapshot.basketItems.length})`);
  }

  if (snapshot.notifications?.length) {
    for (const row of snapshot.notifications) {
      await prisma.notification.upsert({ where: { id: row.id }, update: row, create: row });
    }
    console.log(`  ✅  notifications   (${snapshot.notifications.length})`);
  }

  console.log("\n✅  JSON snapshot restore complete.");
  return true;
}

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error(
      "\nUsage: npm run db:restore -- <backup-dir>\n" +
      "Example: npm run db:restore -- backups/2026-05-23_10-00-00\n"
    );
    process.exit(1);
  }

  const backupDir = resolve(backupPath);
  if (!existsSync(backupDir)) {
    console.error(`❌  Directory not found: ${backupDir}`);
    process.exit(1);
  }

  // Read manifest if available
  const manifestFile = join(backupDir, "manifest.json");
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(readFileSync(manifestFile, "utf-8"));
    console.log("\n📋  Backup manifest:");
    console.log(`    Created    : ${manifest.createdAt}`);
    console.log(`    Total rows : ${manifest.totalRows}`);
    console.log(`    Tables     : ${Object.keys(manifest.tables).join(", ")}`);
  }

  console.log("\n⚠️   WARNING: This will overwrite data in your current database!");
  const answer = await ask("    Type YES to continue: ");
  if (answer.trim() !== "YES") {
    console.log("❌  Restore cancelled.");
    process.exit(0);
  }

  const dbUrl = process.env.DATABASE_URL;
  let restored = false;

  if (dbUrl) {
    restored = await restoreFromSQL(backupDir, dbUrl);
  }

  if (!restored) {
    restored = await restoreFromJSON(backupDir);
  }

  if (!restored) {
    console.error("\n❌  Restore failed — no valid backup files found.");
    process.exit(1);
  }

  console.log("\n🎉  Restore finished successfully.\n");
}

main()
  .catch((e) => { console.error("❌  Restore error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
