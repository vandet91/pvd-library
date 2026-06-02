import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * POST /api/admin/migration/pmb/wipe
 * Wipes all library data using TRUNCATE CASCADE.
 * Keeps: User, Settings, Location, Branch, ActivityLog
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session || !can(session.user?.role, "ADMIN"))
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [books, copies, loans, fines, members] = await Promise.all([
      prisma.book.count(),
      prisma.bookCopy.count(),
      prisma.loan.count(),
      prisma.fine.count(),
      prisma.member.count(),
    ]);

    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Fine",
        "Loan",
        "Reservation",
        "BookRequest",
        "BasketItem",
        "Basket",
        "InventoryItem",
        "StockMovement",
        "Rating",
        "BookCopy",
        "Book",
        "Author",
        "Publisher",
        "Category",
        "Member"
      CASCADE
    `);

    try { await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Ebook" CASCADE`); } catch { /* optional */ }
    try { await prisma.$executeRawUnsafe(`TRUNCATE TABLE "SaleOrder", "SaleCartItem" CASCADE`); } catch { /* optional */ }

    return NextResponse.json({ success: true, deleted: { books, copies, loans, fines, members } });
  } catch (e) {
    console.error("[wipe]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
