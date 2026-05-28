import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import {
  dueSoonTemplate,
  overdueTemplate,
  reservationReadyTemplate,
} from "@/lib/email-templates";
import { calculateFine } from "@/lib/utils";
import { sendTelegram, tg, TELEGRAM_ENABLED } from "@/lib/telegram";
import type { NotificationType } from "@prisma/client";

/* ── Telegram helper ─────────────────────────────────────────── */
async function tryTelegram(
  chatId: string | null | undefined,
  text:   string,
  result: SendResult,
): Promise<boolean> {
  if (!TELEGRAM_ENABLED || !chatId) return false;
  const r = await sendTelegram(chatId, text);
  if (r.ok) { result.sent++; return true; }
  // Don't count as failed — fall through to email
  return false;
}

/* ── helpers ─────────────────────────────────────────────────── */
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay  (d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

/** Has a notification of this type already been sent today for this loan/reservation? */
async function alreadyNotifiedToday(opts: {
  type: NotificationType;
  memberId: string;
  loanId?: string;
  reservationId?: string;
}): Promise<boolean> {
  const now = new Date();
  const existing = await prisma.notification.findFirst({
    where: {
      type:          opts.type,
      memberId:      opts.memberId,
      loanId:        opts.loanId        ?? undefined,
      reservationId: opts.reservationId ?? undefined,
      status:        "SENT",
      sentAt:        { gte: startOfDay(now), lte: endOfDay(now) },
    },
    select: { id: true },
  });
  return !!existing;
}

interface SendResult { sent: number; skipped: number; failed: number; errors: string[] }

async function recordAndSend(opts: {
  type: NotificationType;
  memberId: string;
  recipient: string;
  subject: string;
  html: string;
  loanId?: string;
  reservationId?: string;
}, result: SendResult) {
  if (!opts.recipient || !opts.recipient.includes("@")) {
    result.skipped++;
    return;
  }
  const log = await prisma.notification.create({
    data: {
      type:          opts.type,
      memberId:      opts.memberId,
      loanId:        opts.loanId ?? null,
      reservationId: opts.reservationId ?? null,
      recipient:     opts.recipient,
      subject:       opts.subject,
      status:        "PENDING",
    },
  });
  const r = await sendEmail({ to: opts.recipient, subject: opts.subject, html: opts.html });
  if (r.ok) {
    await prisma.notification.update({
      where: { id: log.id },
      data:  { status: "SENT", sentAt: new Date() },
    });
    result.sent++;
  } else {
    await prisma.notification.update({
      where: { id: log.id },
      data:  { status: "FAILED", error: r.error },
    });
    result.failed++;
    result.errors.push(`[${opts.type}] ${opts.recipient}: ${r.error}`);
  }
}

/* ── 1. Due-soon (N days before due) ─────────────────────────── */
export async function notifyDueSoon(daysBefore = 3): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0, errors: [] };

  // Find loans whose dueDate falls on the day exactly `daysBefore` from today
  const target = new Date();
  target.setDate(target.getDate() + daysBefore);

  const loans = await prisma.loan.findMany({
    where: {
      status:  { in: ["ACTIVE"] },
      dueDate: { gte: startOfDay(target), lte: endOfDay(target) },
    },
    include: { member: true, book: { select: { title: true } } },
  });

  for (const loan of loans) {
    if (await alreadyNotifiedToday({ type: "DUE_SOON", memberId: loan.memberId, loanId: loan.id })) {
      result.skipped++; continue;
    }
    // Try Telegram first, fall back to email
    const tgSent = await tryTelegram(
      loan.member.telegramChatId,
      tg.dueSoon(loan.member.name, loan.book.title, loan.dueDate, daysBefore),
      result,
    );
    if (!tgSent) {
      const recipient = loan.member.email;
      if (!recipient) { result.skipped++; continue; }
      const { subject, html } = dueSoonTemplate({
        memberName: loan.member.name,
        bookTitle:  loan.book.title,
        dueDate:    loan.dueDate,
        daysLeft:   daysBefore,
      });
      await recordAndSend({ type: "DUE_SOON", memberId: loan.memberId, loanId: loan.id, recipient, subject, html }, result);
    }
  }
  return result;
}

/* ── 2. Overdue ──────────────────────────────────────────────── */
export async function notifyOverdue(finePerDay = 0.25): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
  const now = new Date();

  const loans = await prisma.loan.findMany({
    where: {
      status:  { in: ["ACTIVE", "OVERDUE"] },
      dueDate: { lt: now },
    },
    include: { member: true, book: { select: { title: true } } },
  });

  for (const loan of loans) {
    if (await alreadyNotifiedToday({ type: "OVERDUE", memberId: loan.memberId, loanId: loan.id })) {
      result.skipped++; continue;
    }
    const { daysLate, amount } = calculateFine(loan.dueDate, now, finePerDay);
    // Try Telegram first, fall back to email
    const tgSent = await tryTelegram(
      loan.member.telegramChatId,
      tg.overdue(loan.member.name, loan.book.title, daysLate, amount),
      result,
    );
    if (!tgSent) {
      const recipient = loan.member.email;
      if (!recipient) { result.skipped++; continue; }
      const { subject, html } = overdueTemplate({
        memberName: loan.member.name,
        bookTitle:  loan.book.title,
        dueDate:    loan.dueDate,
        daysLate,
        fineAmount: amount,
      });
      await recordAndSend({ type: "OVERDUE", memberId: loan.memberId, loanId: loan.id, recipient, subject, html }, result);
    }
  }
  return result;
}

/* ── 3. Reservation ready ────────────────────────────────────── */
export async function notifyReservationReady(): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0, errors: [] };

  const reservations = await prisma.reservation.findMany({
    where:   { status: "READY" },
    include: { member: true, book: { select: { title: true } } },
  });

  for (const r of reservations) {
    // For reservation-ready, only send ONCE total (not once per day)
    const alreadySent = await prisma.notification.findFirst({
      where:  { type: "RESERVATION_READY", reservationId: r.id, status: "SENT" },
      select: { id: true },
    });
    if (alreadySent) { result.skipped++; continue; }

    // Try Telegram first, fall back to email
    const tgSent = await tryTelegram(
      r.member.telegramChatId,
      tg.reservationReady(r.member.name, r.book.title, r.expiresAt),
      result,
    );
    if (!tgSent) {
      const recipient = r.member.email;
      if (!recipient) { result.skipped++; continue; }
      const { subject, html } = reservationReadyTemplate({
        memberName: r.member.name,
        bookTitle:  r.book.title,
        holdShelf:  r.holdShelf,
        expiresAt:  r.expiresAt,
      });
      await recordAndSend({
        type: "RESERVATION_READY", memberId: r.memberId, reservationId: r.id, recipient, subject, html,
      }, result);
    }
  }
  return result;
}

/* ── 4. Membership expiring soon (Telegram only) ──────────────── */
export async function notifyMembershipExpiring(daysBefore = 7): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
  if (!TELEGRAM_ENABLED) return result;

  const target = new Date();
  target.setDate(target.getDate() + daysBefore);

  const members = await prisma.member.findMany({
    where: {
      isActive:          true,
      telegramChatId:    { not: null },
      expireDate:        { gte: startOfDay(target), lte: endOfDay(target) },
    },
  });

  for (const member of members) {
    if (!member.expireDate) continue;
    await tryTelegram(
      member.telegramChatId,
      tg.membershipExpiring(member.name, member.expireDate, daysBefore),
      result,
    );
  }
  return result;
}

/* ── Run all ─────────────────────────────────────────────────── */
export async function runAllNotifications() {
  // Resolve settings once so each pass uses the same values
  const [enabled, daysBeforeRow, fineRow, tgEnabledRow, tgExpiryDaysRow] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "NOTIFICATIONS_ENABLED" } }),
    prisma.settings.findUnique({ where: { key: "DUE_SOON_DAYS" } }),
    prisma.settings.findUnique({ where: { key: "FINE_PER_DAY" } }),
    prisma.settings.findUnique({ where: { key: "TELEGRAM_NOTIFICATIONS_ENABLED" } }),
    prisma.settings.findUnique({ where: { key: "TELEGRAM_MEMBERSHIP_EXPIRY_DAYS" } }),
  ]);

  if (enabled?.value === "false") {
    return { disabled: true as const, dueSoon: null, overdue: null, reservationReady: null, membershipExpiring: null };
  }

  const daysBefore       = Number(daysBeforeRow?.value ?? 3);
  const finePerDay       = Number(fineRow?.value ?? process.env.FINE_PER_DAY ?? 0.25);
  const tgEnabled        = tgEnabledRow?.value !== "false";
  const tgExpiryDays     = Number(tgExpiryDaysRow?.value ?? 7);

  const [dueSoon, overdue, reservationReady, membershipExpiring] = await Promise.all([
    notifyDueSoon(daysBefore),
    notifyOverdue(finePerDay),
    notifyReservationReady(),
    tgEnabled ? notifyMembershipExpiring(tgExpiryDays) : Promise.resolve({ sent: 0, skipped: 0, failed: 0, errors: [] }),
  ]);
  return { disabled: false as const, dueSoon, overdue, reservationReady, membershipExpiring };
}
