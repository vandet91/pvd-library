import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/* GET /api/book-requests
   Admin: all requests (filterable by status)
   Member: only their own requests */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const isStaff = can(session.user?.role, "STAFF");

  /* Find the member record linked to this user (for member self-service) */
  let memberId: string | undefined;
  if (!isStaff) {
    const member = await prisma.member.findFirst({
      where: { userId: session.user?.id },
      select: { id: true },
    });
    if (!member) return NextResponse.json([]);
    memberId = member.id;
  }

  const requests = await prisma.bookRequest.findMany({
    where: {
      ...(!isStaff && memberId ? { memberId } : {}),
      ...(status   ? { status: status as never } : {}),
    },
    include: {
      member: { select: { name: true, memberId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

/* POST /api/book-requests — any authenticated user */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, author, isbn, notes } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  /* Resolve member record */
  const member = await prisma.member.findFirst({
    where: { userId: session.user?.id },
    select: { id: true, isActive: true, pendingApproval: true },
  });
  if (!member)
    return NextResponse.json(
      { error: "You must be a registered member to submit requests" },
      { status: 403 },
    );
  if (member.pendingApproval)
    return NextResponse.json({ error: "Your account is pending staff approval", code: "PENDING_APPROVAL" }, { status: 403 });
  if (!member.isActive)
    return NextResponse.json({ error: "Your account is inactive. Please contact the library.", code: "ACCOUNT_INACTIVE" }, { status: 403 });

  const req = await prisma.bookRequest.create({
    data: { memberId: member.id, title: title.trim(), author, isbn, notes },
    include: { member: { select: { name: true, memberId: true } } },
  });

  return NextResponse.json(req, { status: 201 });
}
