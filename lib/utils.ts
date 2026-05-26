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

export function generateMemberId() {
  const year = new Date().getFullYear();
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
