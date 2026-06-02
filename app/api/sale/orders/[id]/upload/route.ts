import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const ALLOWED  = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/sale/orders/[id]/upload
 * Member uploads a payment proof screenshot for their own order.
 * Returns { url: "/uploads/payment-proofs/xxx.jpg" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const member = await prisma.member.findFirst({
    where:  { userId: session.user?.id ?? "" },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Verify order belongs to this member
  const order = await prisma.saleOrder.findFirst({
    where:  { id, memberId: member.id },
    select: { id: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "Payment proof can only be uploaded for orders pending payment" }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext))
    return NextResponse.json({ error: "Only image files are allowed (jpg, png, gif, webp)" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_SIZE)
    return NextResponse.json({ error: "File too large — maximum 10 MB" }, { status: 400 });

  const filename  = `${randomUUID()}${ext}`;
  const uploadDir = join(process.cwd(), "public", "uploads", "payment-proofs");
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), Buffer.from(bytes));
  } catch (err) {
    console.error("[upload] file write error:", err);
    return NextResponse.json({ error: "Failed to save file. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: `/uploads/payment-proofs/${filename}` });
}
