import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * POST /api/admin/db/restore
 * Body: { timestamp: string }
 *
 * Restores the database from a stored JSON snapshot.
 * Deletes all data in child-first order, then re-inserts in parent-first order.
 * Runs inside a single Prisma transaction (60 s timeout).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { timestamp } = body as { timestamp?: string };

  if (!timestamp || timestamp.includes("/") || timestamp.includes("\\") || timestamp.includes(".."))
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });

  const snapshotPath = join(process.cwd(), "backups", timestamp, "snapshot.json");
  if (!existsSync(snapshotPath))
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });

  let snapshot: Record<string, unknown[]>;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Corrupt backup file" }, { status: 500 });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        /* ── 1. Delete in child-first order ─────────────────────── */
        await tx.notification.deleteMany({});
        await tx.basketItem.deleteMany({});
        await tx.basket.deleteMany({});
        await tx.inventoryItem.deleteMany({});
        await tx.inventory.deleteMany({});
        await tx.fine.deleteMany({});
        await tx.loan.deleteMany({});
        await tx.reservation.deleteMany({});
        await tx.bookRequest.deleteMany({});
        await tx.bookCopy.deleteMany({});
        await tx.ebook.deleteMany({});
        await tx.book.deleteMany({});
        await tx.member.deleteMany({});
        await tx.settings.deleteMany({});
        // Deleting users also CASCADE-deletes Account + Session (NextAuth tables)
        await tx.user.deleteMany({});
        await tx.author.deleteMany({});
        await tx.publisher.deleteMany({});
        await tx.category.deleteMany({});
        await tx.location.deleteMany({});

        /* ── 2. Insert in parent-first order ─────────────────────── */
        const ins = async (rows: unknown[] | undefined, fn: (data: unknown[]) => Promise<unknown>) => {
          if (!rows || rows.length === 0) return;
          await fn(rows);
        };

        await ins(snapshot.settings,       (d) => tx.settings.createMany({ data: d as never[] }));
        await ins(snapshot.users,           (d) => tx.user.createMany({ data: d as never[] }));
        await ins(snapshot.authors,         (d) => tx.author.createMany({ data: d as never[] }));
        await ins(snapshot.publishers,      (d) => tx.publisher.createMany({ data: d as never[] }));
        await ins(snapshot.categories,      (d) => tx.category.createMany({ data: d as never[] }));
        await ins(snapshot.locations,       (d) => tx.location.createMany({ data: d as never[] }));
        await ins(snapshot.members,         (d) => tx.member.createMany({ data: d as never[] }));
        await ins(snapshot.books,           (d) => tx.book.createMany({ data: d as never[] }));
        await ins(snapshot.bookCopies,      (d) => tx.bookCopy.createMany({ data: d as never[] }));
        await ins(snapshot.ebooks,          (d) => tx.ebook.createMany({ data: d as never[] }));
        await ins(snapshot.loans,           (d) => tx.loan.createMany({ data: d as never[] }));
        await ins(snapshot.fines,           (d) => tx.fine.createMany({ data: d as never[] }));
        await ins(snapshot.reservations,    (d) => tx.reservation.createMany({ data: d as never[] }));
        await ins(snapshot.bookRequests,    (d) => tx.bookRequest.createMany({ data: d as never[] }));
        await ins(snapshot.baskets,         (d) => tx.basket.createMany({ data: d as never[] }));
        await ins(snapshot.basketItems,     (d) => tx.basketItem.createMany({ data: d as never[] }));
        await ins(snapshot.notifications,   (d) => tx.notification.createMany({ data: d as never[] }));
        await ins(snapshot.inventory,       (d) => tx.inventory.createMany({ data: d as never[] }));
        await ins(snapshot.inventoryItems,  (d) => tx.inventoryItem.createMany({ data: d as never[] }));
      },
      { timeout: 120_000 }, // 2-minute timeout for large datasets
    );

    const totalRows = Object.values(snapshot).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
    const tables = Object.fromEntries(
      Object.entries(snapshot).map(([k, v]) => [k, v?.length ?? 0])
    );

    return NextResponse.json({ success: true, timestamp, totalRows, tables });
  } catch (err: unknown) {
    console.error("[restore]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restore failed" },
      { status: 500 },
    );
  }
}
