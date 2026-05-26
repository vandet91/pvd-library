import { prisma } from "@/lib/prisma";

/**
 * Read barcode settings from the Settings table.
 * Falls back to defaults if not configured.
 */
export async function getBarcodeSettings(): Promise<{ prefix: string; padding: number }> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ["BARCODE_PREFIX", "BARCODE_PADDING"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    prefix:  (map.BARCODE_PREFIX  ?? "PVD").trim().toUpperCase() || "PVD",
    padding: Math.max(1, Math.min(10, parseInt(map.BARCODE_PADDING ?? "6", 10) || 6)),
  };
}

/**
 * Generate the next available barcode using the configured prefix + padding.
 * Format example: PVD-000001
 * Idempotent — searches for the highest existing number under the current prefix.
 */
export async function generateBarcode(): Promise<string> {
  const { prefix, padding } = await getBarcodeSettings();
  const prefixWithDash = `${prefix}-`;

  const last = await prisma.book.findFirst({
    where:   { barcode: { startsWith: prefixWithDash } },
    orderBy: { barcode: "desc" },
    select:  { barcode: true },
  });

  let next = 1;
  if (last?.barcode) {
    const num = parseInt(last.barcode.replace(prefixWithDash, ""), 10);
    if (!isNaN(num)) next = num + 1;
  }

  return `${prefixWithDash}${String(next).padStart(padding, "0")}`;
}
