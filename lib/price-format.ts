/**
 * Format a monetary amount for display.
 *
 * Rules:
 *  - KHR  → whole number, thousands separator, ៛ suffix  e.g.  "4,100 ៛"
 *  - USD  → $-prefix, 2 decimal places                   e.g.  "$4.99"
 *  - THB  → ฿-prefix, 2 decimal places                   e.g.  "฿4.99"
 *  - Other→ currency code prefix, 2 decimal places        e.g.  "EUR 4.99"
 */
export function formatPrice(amount: number, currency: string): string {
  switch (currency) {
    case "KHR":
      return `${Math.round(amount).toLocaleString("en-US")} ៛`;
    case "USD":
      return `$${amount.toFixed(2)}`;
    case "THB":
      return `฿${amount.toFixed(2)}`;
    default:
      return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Given a primary amount, convert it to the secondary currency and format.
 * Returns null if secondaryCurrency is empty / rate is 0.
 *
 * Example: formatSecondary(4.99, "KHR", 4100) → "20,459 ៛"
 */
export function formatSecondary(
  primaryAmount: number,
  secondaryCurrency: string,
  rate: number,
): string | null {
  if (!secondaryCurrency || rate <= 0) return null;
  const converted = primaryAmount * rate;
  return formatPrice(converted, secondaryCurrency);
}
