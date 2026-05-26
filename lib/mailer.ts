import { createTransport, type Transporter } from "nodemailer";

/** Single shared transporter (warmed on first use, reused after). */
let cached: Transporter | null = null;

function getTransport(): Transporter {
  if (cached) return cached;

  const host = process.env.EMAIL_SERVER_HOST;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASS;
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP not configured — set EMAIL_SERVER_HOST / EMAIL_SERVER_USER / EMAIL_SERVER_PASS in .env"
    );
  }

  cached = createTransport({
    host,
    port:   Number(process.env.EMAIL_SERVER_PORT ?? 587),
    secure: process.env.EMAIL_SERVER_SECURE === "true",
    auth:   { user, pass },
  });
  return cached;
}

export interface SendEmailInput {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const transport = getTransport();
    const from = process.env.EMAIL_FROM ?? `PVD Library <${process.env.EMAIL_SERVER_USER}>`;
    const info = await transport.sendMail({
      to, from, subject, html,
      text: text ?? html.replace(/<[^>]+>/g, ""), // crude plain-text fallback
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    return { ok: false, error: message };
  }
}

/** Quick connectivity check — used by the "Send test email" button. */
export async function verifySmtp(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transport = getTransport();
    await transport.verify();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    return { ok: false, error: message };
  }
}
