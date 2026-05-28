/**
 * Telegram Bot client — thin wrapper around the Bot API.
 * No external library needed; just fetch.
 *
 * Set TELEGRAM_BOT_TOKEN in .env to enable.
 * After deploying, register your webhook once:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram/webhook"
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const TELEGRAM_ENABLED = !!BOT_TOKEN;

/* ── Send a plain or HTML message ───────────────────────────────────────── */
export async function sendTelegram(
  chatId: string | number,
  text:   string,
  parseMode: "HTML" | "Markdown" = "HTML",
): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          chat_id:    chatId,
          text,
          parse_mode: parseMode,
        }),
      },
    );
    const data = await res.json() as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/* ── Register webhook with Telegram (call once after deploy) ────────────── */
export async function setWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  const res  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ url }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  return data.ok ? { ok: true } : { ok: false, error: data.description };
}

/* ── Notify a member by their memberId (fire-and-forget safe) ────────────── */
export async function notifyMember(memberId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const { prisma } = await import("@/lib/prisma");
    const [setting, member] = await Promise.all([
      prisma.settings.findUnique({ where: { key: "TELEGRAM_NOTIFICATIONS_ENABLED" } }),
      prisma.member.findUnique({ where: { id: memberId }, select: { telegramChatId: true } }),
    ]);
    if (setting?.value === "false") return;
    if (!member?.telegramChatId) return;
    await sendTelegram(member.telegramChatId, text);
  } catch {
    // Never let notification errors bubble up to the caller
  }
}

/* ── Message templates ──────────────────────────────────────────────────── */
export const tg = {
  // ── Scheduled reminders ───────────────────────────────────────────────
  dueSoon: (memberName: string, bookTitle: string, dueDate: Date, daysLeft: number) =>
    `📚 <b>Loan Reminder</b>\n\nHi ${memberName}! Your loan of <i>${bookTitle}</i> is due in <b>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</b> (${dueDate.toLocaleDateString()}).\n\nPlease return or renew on time to avoid fines.`,

  overdue: (memberName: string, bookTitle: string, daysLate: number, fineAmount: number) =>
    `⚠️ <b>Overdue Notice</b>\n\nHi ${memberName}! Your loan of <i>${bookTitle}</i> is <b>${daysLate} day${daysLate !== 1 ? "s" : ""} overdue</b>.\n\nCurrent fine: <b>$${fineAmount.toFixed(2)}</b>\n\nPlease return the book as soon as possible.`,

  membershipExpiring: (memberName: string, expireDate: Date, daysLeft: number) =>
    `🔔 <b>Membership Expiring Soon</b>\n\nHi ${memberName}! Your library membership expires in <b>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</b> (${expireDate.toLocaleDateString()}).\n\nVisit the library or contact staff to renew.`,

  // ── Loan events ───────────────────────────────────────────────────────
  checkout: (memberName: string, bookTitle: string, dueDate: Date) =>
    `📖 <b>Book Checked Out</b>\n\nHi ${memberName}! You have borrowed <i>${bookTitle}</i>.\n\nDue date: <b>${dueDate.toLocaleDateString()}</b>\n\nEnjoy your reading! Type /myloans to see all your active loans.`,

  returned: (memberName: string, bookTitle: string, fineAmount?: number) =>
    `📦 <b>Book Returned</b>\n\nHi ${memberName}! <i>${bookTitle}</i> has been returned successfully.${
      fineAmount && fineAmount > 0
        ? `\n\n⚠️ A fine of <b>$${fineAmount.toFixed(2)}</b> has been added to your account. Please settle it at the library.`
        : "\n\nThank you for returning on time!"
    }`,

  renewed: (memberName: string, bookTitle: string, newDueDate: Date, renewalCount: number) =>
    `🔄 <b>Loan Renewed</b>\n\nHi ${memberName}! Your loan of <i>${bookTitle}</i> has been renewed.\n\nNew due date: <b>${newDueDate.toLocaleDateString()}</b> (renewal #${renewalCount})`,

  lostBook: (memberName: string, bookTitle: string, replacementCost: number) =>
    `⚠️ <b>Book Marked as Lost</b>\n\nHi ${memberName}! <i>${bookTitle}</i> has been marked as lost on your account.\n\nReplacement fine: <b>$${replacementCost.toFixed(2)}</b>\n\nPlease visit the library to resolve this.`,

  // ── Reservation events ────────────────────────────────────────────────
  reservationCreated: (memberName: string, bookTitle: string, queuePosition: number) =>
    `📋 <b>Reservation Placed</b>\n\nHi ${memberName}! You are now in the queue for <i>${bookTitle}</i>.\n\nYour queue position: <b>#${queuePosition}</b>\n\nWe'll notify you when it's ready for pickup.`,

  reservationApproved: (memberName: string, bookTitle: string) =>
    `✅ <b>Reservation Approved</b>\n\nHi ${memberName}! Your reservation for <i>${bookTitle}</i> has been approved by staff.\n\nWe'll notify you as soon as a copy is ready for pickup.`,

  reservationReady: (memberName: string, bookTitle: string, expiresAt: Date | null) =>
    `✅ <b>Your Book Is Ready!</b>\n\nHi ${memberName}! <i>${bookTitle}</i> is ready for pickup at the library.${
      expiresAt ? `\n\nHold expires: <b>${expiresAt.toLocaleDateString()}</b> — please collect it before then.` : ""
    }`,

  reservationCancelled: (memberName: string, bookTitle: string) =>
    `❌ <b>Reservation Cancelled</b>\n\nHi ${memberName}! Your reservation for <i>${bookTitle}</i> has been cancelled.`,

  // ── Account ───────────────────────────────────────────────────────────
  linked: (memberName: string) =>
    `🎉 <b>Telegram Linked!</b>\n\nHi ${memberName}! Your Telegram account is now linked to your PVD Library membership.\n\nYou'll receive reminders for:\n• Loan due dates\n• Overdue notices\n• Reservation alerts\n• Membership renewal\n\nType /help to see available commands.`,

  help: () =>
    `📖 <b>PVD Library Bot</b>\n\nAvailable commands:\n/myloans — View your active loans\n/status — Check membership status\n/help — Show this message\n\nFor support, visit the library or contact staff.`,
};
