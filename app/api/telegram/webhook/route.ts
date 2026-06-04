import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegram, tg } from "@/lib/telegram";

/* ── Telegram update types (minimal) ───────────────────────────────────── */
interface TgUser    { id: number; first_name: string; username?: string }
interface TgChat    { id: number }
interface TgMessage { message_id: number; from?: TgUser; chat: TgChat; text?: string }
interface TgUpdate  { update_id: number; message?: TgMessage }

/* ── Verify the request comes from Telegram ─────────────────────────────── */
function isValidRequest(request: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // skip check if no secret configured
  return request.headers.get("x-telegram-bot-api-secret-token") === secret;
}

export async function POST(request: NextRequest) {
  if (!isValidRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = await request.json() as TgUpdate;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const text   = message.text.trim();

  /* ── Link account helper (used by /start and plain code) ── */
  async function linkWithCode(code: string) {
    const member = await prisma.member.findFirst({
      where: {
        telegramLinkCode:   code,
        telegramLinkExpiry: { gt: new Date() },
      },
    });

    if (!member) {
      await sendTelegram(chatId,
        `❌ <b>Invalid or expired code.</b>\n\nThe code may have expired (valid for 30 minutes) or was already used.\n\n` +
        `Please go to your <b>Account page</b> on the library website, click <b>"Link Telegram Account"</b> to generate a fresh code, then send it here.\n\n` +
        `Your chat ID: <code>${chatId}</code>`,
      );
      return;
    }

    const existing = await prisma.member.findUnique({
      where: { telegramChatId: String(chatId) },
    });
    if (existing && existing.id !== member.id) {
      await sendTelegram(chatId,
        `⚠️ This Telegram account is already linked to another library membership.`,
      );
      return;
    }

    await prisma.member.update({
      where: { id: member.id },
      data: {
        telegramChatId:     String(chatId),
        telegramLinkedAt:   new Date(),
        telegramLinkCode:   null,
        telegramLinkExpiry: null,
      },
    });

    await sendTelegram(chatId, tg.linked(member.name));
  }

  /* ── /start [code] — link account ── */
  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.trim();

    if (!code) {
      await sendTelegram(chatId,
        `👋 <b>Welcome to PVD Library Bot!</b>\n\nTo link your library account:\n1. Go to your <b>My Profile</b> page on the library website\n2. Click <b>"Link Telegram"</b>\n3. Send the 6-digit code you receive here\n\nType /help for more info.`,
      );
      return NextResponse.json({ ok: true });
    }

    await linkWithCode(code);
    return NextResponse.json({ ok: true });
  }

  /* ── Plain 6-digit code — member typed it manually ── */
  if (/^\d{6}$/.test(text)) {
    await linkWithCode(text);
    return NextResponse.json({ ok: true });
  }

  /* ── /myloans — list active loans ── */
  if (text === "/myloans") {
    const member = await prisma.member.findUnique({
      where: { telegramChatId: String(chatId) },
    });
    if (!member) {
      await sendTelegram(chatId, `❌ Your Telegram is not linked to a library account.\n\nVisit your profile page and click <b>"Link Telegram"</b>.`);
      return NextResponse.json({ ok: true });
    }

    const loans = await prisma.loan.findMany({
      where:   { memberId: member.id, status: { in: ["ACTIVE", "OVERDUE"] } },
      include: { book: { select: { title: true } } },
      orderBy: { dueDate: "asc" },
    });

    if (loans.length === 0) {
      await sendTelegram(chatId, `📚 You have no active loans right now.`);
      return NextResponse.json({ ok: true });
    }

    const now   = new Date();
    const lines = loans.map((l, i) => {
      const due     = l.dueDate.toLocaleDateString();
      const overdue = l.dueDate < now;
      const flag    = overdue ? "⚠️" : "📖";
      return `${flag} ${i + 1}. <i>${l.book.title}</i>\n   Due: <b>${due}</b>${overdue ? " — OVERDUE" : ""}`;
    });

    await sendTelegram(chatId, `📚 <b>Your Active Loans</b>\n\n${lines.join("\n\n")}`);
    return NextResponse.json({ ok: true });
  }

  /* ── /status — membership info ── */
  if (text === "/status") {
    const member = await prisma.member.findUnique({
      where: { telegramChatId: String(chatId) },
    });
    if (!member) {
      await sendTelegram(chatId, `❌ Your Telegram is not linked to a library account.\n\nVisit your profile page and click <b>"Link Telegram"</b>.`);
      return NextResponse.json({ ok: true });
    }

    const [activeLoans, unpaidFines] = await Promise.all([
      prisma.loan.count({ where: { memberId: member.id, status: { in: ["ACTIVE", "OVERDUE"] } } }),
      prisma.fine.aggregate({ where: { memberId: member.id, status: "UNPAID" }, _sum: { amount: true } }),
    ]);

    const expiry  = member.expireDate ? member.expireDate.toLocaleDateString() : "Never";
    const fineAmt = unpaidFines._sum.amount ?? 0;

    await sendTelegram(chatId,
      `👤 <b>Membership Status</b>\n\n` +
      `Name: <b>${member.name}</b>\n` +
      `ID: <code>${member.memberId}</code>\n` +
      `Status: <b>${member.isActive ? "✅ Active" : "❌ Inactive"}</b>\n` +
      `Expires: <b>${expiry}</b>\n\n` +
      `Active loans: <b>${activeLoans}</b>\n` +
      `Outstanding fines: <b>$${Number(fineAmt).toFixed(2)}</b>`,
    );
    return NextResponse.json({ ok: true });
  }

  /* ── /myorders — list recent sale orders ── */
  if (text === "/myorders") {
    const member = await prisma.member.findUnique({
      where: { telegramChatId: String(chatId) },
    });
    if (!member) {
      await sendTelegram(chatId, `❌ Your Telegram is not linked to a library account.\n\nVisit your profile page and click <b>"Link Telegram"</b>.`);
      return NextResponse.json({ ok: true });
    }

    const orders = await prisma.saleOrder.findMany({
      where:   { memberId: member.id },
      orderBy: { createdAt: "desc" },
      take:    5,
      include: { items: { select: { id: true } } },
    });

    if (orders.length === 0) {
      await sendTelegram(chatId, `🛒 You have no book orders yet.\n\nVisit the library shop on the website to browse books for sale.`);
      return NextResponse.json({ ok: true });
    }

    const statusEmoji: Record<string, string> = {
      PENDING_PAYMENT:   "⏳",
      PAYMENT_SUBMITTED: "📤",
      PAYMENT_CONFIRMED: "✅",
      PREPARING:         "📦",
      READY_FOR_PICKUP:  "🎉",
      SHIPPED:           "🚚",
      DELIVERED:         "📬",
      COMPLETED:         "🎊",
      CANCELLED:         "❌",
      RETURN_REQUESTED:  "↩️",
      RETURNED:          "📮",
      REFUNDED:          "💰",
    };

    const lines = orders.map((o) => {
      const emoji  = statusEmoji[o.status] ?? "📋";
      const date   = o.createdAt.toLocaleDateString();
      const status = o.status.replace(/_/g, " ");
      return `${emoji} <code>${o.orderNumber}</code>\n   <i>${status}</i> · ${o.items.length} item${o.items.length !== 1 ? "s" : ""} · ${o.currency} ${o.total.toFixed(2)}\n   Ordered: ${date}`;
    });

    await sendTelegram(chatId, `🛒 <b>Your Recent Orders</b>\n\n${lines.join("\n\n")}\n\nVisit the library website to view full details or take action.`);
    return NextResponse.json({ ok: true });
  }

  /* ── /help ── */
  if (text === "/help") {
    await sendTelegram(chatId, tg.help());
    return NextResponse.json({ ok: true });
  }

  /* ── Unknown command ── */
  await sendTelegram(chatId,
    `🤔 I didn't understand that. Type /help to see available commands.`,
  );
  return NextResponse.json({ ok: true });
}
