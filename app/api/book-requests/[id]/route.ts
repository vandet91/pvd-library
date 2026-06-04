import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { notifyMember, tg } from "@/lib/telegram";
import { sendEmail } from "@/lib/mailer";
import { bookRequestStatusTemplate } from "@/lib/email-templates";

type Ctx = { params: Promise<{ id: string }> };

/* PATCH /api/book-requests/[id] — admin updates status / adminNote */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { status, adminNote } = body;

  const allowed = ["PENDING", "APPROVED", "REJECTED", "FULFILLED"];
  if (status && !allowed.includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  /* Enforce legal transitions */
  const TRANSITIONS: Record<string, string[]> = {
    PENDING:   ["APPROVED", "REJECTED"],
    APPROVED:  ["FULFILLED", "REJECTED"],
    REJECTED:  [],
    FULFILLED: [],
  };

  if (status) {
    const current = await prisma.bookRequest.findUnique({ where: { id }, select: { status: true } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!TRANSITIONS[current.status]?.includes(status))
      return NextResponse.json(
        { error: `Cannot move from ${current.status} to ${status}` },
        { status: 422 },
      );
  }

  const updated = await prisma.bookRequest.update({
    where: { id },
    data: {
      ...(status    ? { status }    : {}),
      ...(adminNote !== undefined ? { adminNote } : {}),
    },
    include: {
      member: { select: { name: true, memberId: true, id: true, email: true, telegramChatId: true } },
    },
  });

  /* ── Notify member on status change ─────────────────────────────────── */
  if (status && ["APPROVED", "REJECTED", "FULFILLED"].includes(status)) {
    const s      = status as "APPROVED" | "REJECTED" | "FULFILLED";
    const note   = updated.adminNote ?? undefined;
    const member = updated.member as typeof updated.member & { email: string | null; telegramChatId: string | null };

    // Telegram (fire-and-forget)
    notifyMember(member.id, s === "APPROVED"
      ? tg.bookRequestApproved(member.name, updated.title, note)
      : s === "REJECTED"
        ? tg.bookRequestRejected(member.name, updated.title, note)
        : tg.bookRequestFulfilled(member.name, updated.title, note),
    ).catch(() => {});

    // Email (fire-and-forget)
    if (member.email) {
      const { subject, html } = bookRequestStatusTemplate({ memberName: member.name, title: updated.title, status: s, adminNote: note });
      sendEmail({ to: member.email, subject, html }).catch(() => {});
    }
  }

  return NextResponse.json(updated);
}

/* DELETE /api/book-requests/[id] — admin only */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.bookRequest.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
