/* ── Shared shell ────────────────────────────────────────────── */
function shell({
  preheader, accent, icon, body,
}: { preheader: string; accent: string; icon: string; body: string }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;margin:0;padding:32px 16px;color:#111827;">
  <span style="display:none;font-size:1px;color:#f9fafb;">${preheader}</span>
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,${accent});padding:28px 32px;color:#fff;">
      <div style="font-size:14px;opacity:.85;margin-bottom:4px;">📚 PVD Library</div>
      <div style="font-size:22px;font-weight:700;">${icon}</div>
    </div>
    <div style="padding:28px 32px;font-size:15px;line-height:1.55;">
      ${body}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">© ${year} PVD Library · This is an automated notification.</p>
    </div>
  </div>
</body></html>`;
}

function loanRow(label: string, value: string) {
  return `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #f3f4f6;">
    <div style="color:#9ca3af;width:110px;flex-shrink:0;font-size:13px;">${label}</div>
    <div style="color:#111827;font-weight:500;">${value}</div>
  </div>`;
}

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/* ── Due soon ────────────────────────────────────────────────── */
export function dueSoonTemplate({ memberName, bookTitle, dueDate, daysLeft }: {
  memberName: string; bookTitle: string; dueDate: Date | string; daysLeft: number;
}) {
  const subject = `Reminder: "${bookTitle}" is due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
  const html = shell({
    preheader: `Your loan is due ${fmtDate(dueDate)}`,
    accent: "#f59e0b,#d97706",
    icon: "⏰ Friendly reminder",
    body: `
      <p style="margin:0 0 16px;">Hi <strong>${memberName}</strong>,</p>
      <p style="margin:0 0 20px;">This is a friendly reminder that your borrowed book is due soon:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:20px;">
        ${loanRow("Book", bookTitle)}
        ${loanRow("Due date", fmtDate(dueDate))}
        ${loanRow("Days remaining", `<span style="color:#d97706;font-weight:600;">${daysLeft}</span>`)}
      </div>
      <p style="margin:0 0 8px;color:#6b7280;">Please return the book on or before the due date to avoid late fees. Need more time? You can renew the loan from your account.</p>
    `,
  });
  return { subject, html };
}

/* ── Overdue ─────────────────────────────────────────────────── */
export function overdueTemplate({ memberName, bookTitle, dueDate, daysLate, fineAmount }: {
  memberName: string; bookTitle: string; dueDate: Date | string; daysLate: number; fineAmount: number;
}) {
  const subject = `Overdue: "${bookTitle}" was due ${daysLate} day${daysLate !== 1 ? "s" : ""} ago`;
  const html = shell({
    preheader: `Please return as soon as possible · Fine: $${fineAmount.toFixed(2)}`,
    accent: "#ef4444,#b91c1c",
    icon: "⚠️ Book overdue",
    body: `
      <p style="margin:0 0 16px;">Hi <strong>${memberName}</strong>,</p>
      <p style="margin:0 0 20px;">A borrowed book is now overdue. Please return it as soon as possible:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-bottom:20px;">
        ${loanRow("Book", bookTitle)}
        ${loanRow("Was due", fmtDate(dueDate))}
        ${loanRow("Days late", `<span style="color:#b91c1c;font-weight:600;">${daysLate}</span>`)}
        ${loanRow("Current fine", `<span style="color:#b91c1c;font-weight:600;">$${fineAmount.toFixed(2)}</span>`)}
      </div>
      <p style="margin:0 0 8px;color:#6b7280;">The fine continues to accrue daily until the book is returned. Please visit the library at your earliest convenience.</p>
    `,
  });
  return { subject, html };
}

/* ── Reservation ready ───────────────────────────────────────── */
export function reservationReadyTemplate({ memberName, bookTitle, holdShelf, expiresAt }: {
  memberName: string; bookTitle: string; holdShelf: string | null; expiresAt: Date | string | null;
}) {
  const subject = `Ready for pickup: "${bookTitle}"`;
  const html = shell({
    preheader: holdShelf ? `Available at ${holdShelf}` : "Available at the library",
    accent: "#10b981,#047857",
    icon: "✅ Reservation ready",
    body: `
      <p style="margin:0 0 16px;">Hi <strong>${memberName}</strong>,</p>
      <p style="margin:0 0 20px;">Great news — your reserved book is ready for pickup:</p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px;margin-bottom:20px;">
        ${loanRow("Book", bookTitle)}
        ${holdShelf ? loanRow("Pickup location", holdShelf) : ""}
        ${expiresAt ? loanRow("Hold expires", fmtDate(expiresAt)) : ""}
      </div>
      <p style="margin:0 0 8px;color:#6b7280;">Please collect your book before the hold expires, otherwise it will be returned to the shelf and offered to the next person in queue.</p>
    `,
  });
  return { subject, html };
}

/* ── Test email ──────────────────────────────────────────────── */
export function testEmailTemplate() {
  const subject = "PVD Library — test notification";
  const html = shell({
    preheader: "SMTP is working ✓",
    accent: "#3b82f6,#1d4ed8",
    icon: "✉️ Test email",
    body: `
      <p style="margin:0 0 16px;">SMTP is working correctly. 🎉</p>
      <p style="margin:0 0 8px;color:#6b7280;">If you received this email, your library's notification system is ready to send due-soon reminders, overdue notices, and reservation-ready alerts to members.</p>
    `,
  });
  return { subject, html };
}
