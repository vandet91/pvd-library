import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, contact, phone, email, address, website, notes } = await req.json();
  if (!name?.trim())
    return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });

  const vendor = await prisma.vendor.create({
    data: {
      name: name.trim(),
      contact: contact?.trim() || null,
      phone:   phone?.trim()   || null,
      email:   email?.trim()   || null,
      address: address?.trim() || null,
      website: website?.trim() || null,
      notes:   notes?.trim()   || null,
    },
  });
  return NextResponse.json(vendor, { status: 201 });
}
