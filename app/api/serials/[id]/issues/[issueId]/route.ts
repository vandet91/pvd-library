import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await params;
  const body = await req.json();
  const { issueNumber, volume, issueDate, receivedDate, status, notes } = body;

  const issue = await prisma.serialIssue.update({
    where: { id: issueId },
    data: {
      ...(issueNumber  !== undefined && { issueNumber:  issueNumber.trim() }),
      ...(volume       !== undefined && { volume:       volume?.trim() || null }),
      ...(issueDate    !== undefined && { issueDate:    new Date(issueDate) }),
      ...(receivedDate !== undefined && { receivedDate: receivedDate ? new Date(receivedDate) : null }),
      ...(status       !== undefined && { status }),
      ...(notes        !== undefined && { notes: notes?.trim() || null }),
    },
  });
  return NextResponse.json(issue);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await params;
  await prisma.serialIssue.delete({ where: { id: issueId } });
  return NextResponse.json({ success: true });
}
