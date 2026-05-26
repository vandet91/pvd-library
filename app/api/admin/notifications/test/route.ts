import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { sendEmail, verifySmtp } from "@/lib/mailer";
import { testEmailTemplate } from "@/lib/email-templates";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to } = (await request.json().catch(() => ({}))) as { to?: string };
  const recipient = to?.trim() || session.user?.email;
  if (!recipient) return NextResponse.json({ error: "No recipient address" }, { status: 400 });

  // Quick SMTP handshake first — better error message if creds are wrong
  const v = await verifySmtp();
  if (!v.ok) return NextResponse.json({ error: `SMTP error: ${v.error}` }, { status: 500 });

  const { subject, html } = testEmailTemplate();
  const r = await sendEmail({ to: recipient, subject, html });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  return NextResponse.json({ ok: true, messageId: r.messageId, recipient });
}
