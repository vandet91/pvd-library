import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { setWebhook } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { domain?: string };

  let origin: string;

  if (body.domain?.trim()) {
    // Manual domain supplied by admin — normalize it
    origin = body.domain.trim().replace(/\/$/, "");
    if (!origin.startsWith("http")) origin = `https://${origin}`;
  } else {
    // Auto-detect from headers (works on most reverse-proxy setups)
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host  = request.headers.get("x-forwarded-host")
               ?? request.headers.get("host")
               ?? new URL(request.url).host;
    origin = `${proto}://${host}`;
  }

  // Telegram requires HTTPS
  if (!origin.startsWith("https://")) {
    return NextResponse.json(
      { error: `Webhook must use HTTPS. Detected URL: ${origin}/api/telegram/webhook — enter your public HTTPS domain below.` },
      { status: 400 },
    );
  }

  const webhookUrl = `${origin}/api/telegram/webhook`;
  const result = await setWebhook(webhookUrl);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed to register webhook" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, webhookUrl });
}
