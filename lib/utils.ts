import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, locale = "en") {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale === "km" ? "km-KH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Apply a Member ID format string with token substitution.
 *
 * Tokens:
 *   {PREFIX}   — literal prefix (kept as-is; useful when the whole format IS the pattern)
 *   {YYYY}     — 4-digit year
 *   {YY}       — 2-digit year
 *   {MM}       — 2-digit month
 *   {SEQ4}     — zero-padded 4-digit sequence number
 *   {SEQ5}     — zero-padded 5-digit sequence number
 *   {SEQ6}     — zero-padded 6-digit sequence number
 *   {RAND4}    — 4-digit random number
 *   {RAND6}    — 6-digit random number
 */
export function applyMemberIdFormat(format: string, seq: number): string {
  const now  = new Date();
  const yyyy = String(now.getFullYear());
  const yy   = yyyy.slice(-2);
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const rand4 = String(Math.floor(Math.random() * 9000) + 1000);
  const rand6 = String(Math.floor(Math.random() * 900000) + 100000);
  return format
    .replace(/{YYYY}/g, yyyy)
    .replace(/{YY}/g,   yy)
    .replace(/{MM}/g,   mm)
    .replace(/{SEQ6}/g, String(seq).padStart(6, "0"))
    .replace(/{SEQ5}/g, String(seq).padStart(5, "0"))
    .replace(/{SEQ4}/g, String(seq).padStart(4, "0"))
    .replace(/{RAND6}/g, rand6)
    .replace(/{RAND4}/g, rand4);
}

/** Simple fallback used when no DB is available (e.g. outside request context). */
export function generateMemberId() {
  const year   = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `MEM-${year}-${random}`;
}

export function calculateFine(dueDate: Date, returnDate: Date, finePerDay = 0.25) {
  const due = new Date(dueDate);
  const returned = new Date(returnDate);
  const diffMs = returned.getTime() - due.getTime();
  const daysLate = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return { daysLate, amount: daysLate * finePerDay };
}

export function isOverdue(dueDate: Date) {
  return new Date() > new Date(dueDate);
}
