import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, contact, phone, email, address, website, notes, isActive } = body;

  const vendor = await prisma.vendor.update({
    where: { id },
    data: {
      ...(name     !== undefined && { name:     name.trim()     }),
      ...(contact  !== undefined && { contact:  contact?.trim()  || null }),
      ...(phone    !== undefined && { phone:    phone?.trim()    || null }),
      ...(email    !== undefined && { email:    email?.trim()    || null }),
      ...(address  !== undefined && { address:  address?.trim()  || null }),
      ...(website  !== undefined && { website:  website?.trim()  || null }),
      ...(notes    !== undefined && { notes:    notes?.trim()    || null }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  return NextResponse.json(vendor);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderCount = await prisma.purchaseOrder.count({ where: { vendorId: id } });
  if (orderCount > 0)
    return NextResponse.json({ error: "Cannot delete vendor with existing orders. Deactivate it instead." }, { status: 409 });

  await prisma.vendor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
