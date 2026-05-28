import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "";
const CODE_TTL_MS  = 10 * 60 * 1000; // 10 minutes

/* ── GET — check current link status ───────────────────────────────────── */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const member = await prisma.member.findFirst({
      where:  { user: { email: session.user.email } },
      select: {
        telegramChatId:   true,
        telegramLinkedAt: true,
      },
    });

    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    return NextResponse.json({
      linked:      !!member.telegramChatId,
      linkedAt:    member.telegramLinkedAt,
      botUsername: BOT_USERNAME,
    });
  } catch (err) {
    console.error("[TelegramLink GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ── POST — generate a one-time link code ───────────────────────────────── */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const member = await prisma.member.findFirst({
      where: { user: { email: session.user.email } },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    // Generate 6-digit numeric code
    const code   = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = new Date(Date.now() + CODE_TTL_MS);

    await prisma.member.update({
      where: { id: member.id },
      data:  { telegramLinkCode: code, telegramLinkExpiry: expiry },
    });

    return NextResponse.json({
      code,
      expiresAt:   expiry,
      botUsername: BOT_USERNAME,
      deepLink:    BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=${code}` : null,
    });
  } catch (err) {
    console.error("[TelegramLink POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ── DELETE — unlink Telegram account ──────────────────────────────────── */
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const member = await prisma.member.findFirst({
      where: { user: { email: session.user.email } },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    await prisma.member.update({
      where: { id: member.id },
      data:  {
        telegramChatId:   null,
        telegramLinkedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[TelegramLink DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
