/**
 * ISBN formatting utility.
 *
 * Converts a raw 10 or 13 digit ISBN string into its hyphenated form,
 * e.g.  9789996301766  →  978-99963-01-76-6
 *       9780132350884  →  978-0-13-235088-4
 *
 * Uses publisher range data from the International ISBN Agency.
 * Groups covered: 0,1 (English), 2 (French), 3 (German), 4 (Japan),
 * 5 (Russian/CIS), 7 (China), 99963 (Cambodia), and common 2-5 digit groups.
 *
 * Unknown publisher ranges fall back to a best-effort split.
 */

export function stripIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function isValidIsbn(isbn: string | null | undefined): boolean {
  if (!isbn) return true;
  const s = stripIsbn(isbn);
  return s.length === 10 || s.length === 13;
}

export function isbn10to13(isbn10: string): string | null {
  const s = stripIsbn(isbn10);
  if (s.length !== 10) return null;
  const base = "978" + s.slice(0, 9);
  return base + isbn13Check(base);
}

function isbn13Check(d12: string): string {
  let s = 0;
  for (let i = 0; i < 12; i++) s += parseInt(d12[i]) * (i % 2 === 0 ? 1 : 3);
  const r = s % 10;
  return r === 0 ? "0" : String(10 - r);
}

export function formatIsbn(raw: string): string {
  const s = stripIsbn(raw);
  if (s.length === 13) return formatIsbn13(s) ?? s;
  if (s.length === 10) return formatIsbn10(s) ?? s;
  return raw;
}

// ── Publisher range definition ─────────────────────────────────────────────
// Each entry: [from, to, publisherDigits]
// The publisher code starts immediately after the group code in the body.
type PubRanges = [string, string, number][];

// ── Group range tables ─────────────────────────────────────────────────────
// Returns [groupLen, pubRanges] or null if unknown.
function groupInfo(prefix: string, body: string): [number, PubRanges] | null {
  if (prefix === "978" || prefix === "979") {
    return findGroup978(prefix, body);
  }
  return null;
}

function findGroup978(prefix: string, body: string): [number, PubRanges] | null {
  // ── 1-digit groups ──────────────────────────────────────────────────────
  const g1 = body[0];
  if (g1 >= "0" && g1 <= "5") return [1, englishPubRanges(g1)];
  if (g1 === "7")              return [1, chinesePubRanges()];

  // ── 2-digit groups ──────────────────────────────────────────────────────
  const g2 = body.slice(0, 2);
  if (g2 >= "60" && g2 <= "69") return [2, genericPub2Ranges()];
  if (g2 >= "80" && g2 <= "94") return [2, genericPub2Ranges()];

  // ── 3-digit groups ──────────────────────────────────────────────────────
  const g3 = body.slice(0, 3);
  if (g3 >= "600" && g3 <= "629") return [3, genericPub3Ranges()];
  if (g3 >= "950" && g3 <= "989") return [3, genericPub3Ranges()];

  // ── 4-digit groups ──────────────────────────────────────────────────────
  const g4 = body.slice(0, 4);
  if (g4 >= "9900" && g4 <= "9989") return [4, genericPub4Ranges()];

  // ── 5-digit groups ──────────────────────────────────────────────────────
  const g5 = body.slice(0, 5);
  if (g5 >= "99900" && g5 <= "99999") return [5, fiveDigitGroupPubRanges(g5)];

  // 979 prefix: 2-digit groups 10-19, 1-digit group 8
  if (prefix === "979") {
    if (g1 === "8") return [1, genericPub3Ranges()];
    if (g2 >= "10" && g2 <= "19") return [2, genericPub3Ranges()];
  }

  return null;
}

// ── Publisher ranges per group ────────────────────────────────────────────

function englishPubRanges(group: string): PubRanges {
  // Groups 0 and 1 (English language) share the same publisher scheme
  if (group === "0" || group === "1") {
    return [
      ["00",     "19",     2],
      ["200",    "699",    3],
      ["7000",   "8499",   4],
      ["85000",  "89999",  5],
      ["900000", "949999", 6],
      ["9500000","9999999",7],
    ];
  }
  // Group 2 (French / German)
  if (group === "2" || group === "3") {
    return [
      ["00",    "19",    2],
      ["200",   "699",   3],
      ["7000",  "8499",  4],
      ["85000", "89999", 5],
      ["900000","999999",6],
    ];
  }
  // Group 4 (Japan)
  if (group === "4") {
    return [
      ["00",    "19",    2],
      ["200",   "699",   3],
      ["7000",  "8499",  4],
      ["85000", "89999", 5],
      ["900000","999999",6],
    ];
  }
  // Group 5 (Russian/CIS)
  if (group === "5") {
    return [
      ["00000", "00999", 5],
      ["0100",  "0399",  4],
      ["040",   "059",   3],
      ["0600",  "1999",  4],
      ["200",   "420",   3],
      ["4210",  "4299",  4],
      ["430",   "430",   3],
      ["4310",  "4399",  4],
      ["440",   "440",   3],
      ["4410",  "4499",  4],
      ["450",   "459",   3],
      ["4600",  "4999",  4],
      ["500",   "500",   3],
      ["5010",  "5999",  4],
      ["60",    "89",    2],
      ["900",   "909",   3],
      ["9100",  "9199",  4],
      ["920",   "925",   3],
      ["9260",  "9999",  4],
    ];
  }
  return genericPub2Ranges();
}

function chinesePubRanges(): PubRanges {
  return [
    ["00",    "09",    2],
    ["100",   "499",   3],
    ["5000",  "7999",  4],
    ["80000", "89999", 5],
    ["900000","999999",6],
  ];
}

/** Publisher ranges for 5-digit registration groups (e.g. 99963 = Cambodia) */
function fiveDigitGroupPubRanges(g5: string): PubRanges {
  // Cambodia: 978-99963
  if (g5 === "99963") {
    return [
      ["00", "49", 2],   // 2-digit publisher  (e.g. 01)
      ["500","799", 3],  // 3-digit publisher
      ["8000","9999", 4],// 4-digit publisher
    ];
  }
  // Laos: 978-99957
  if (g5 === "99957") {
    return [
      ["00","39",2],
      ["400","799",3],
      ["8000","9999",4],
    ];
  }
  // Vietnam: 978-604
  // (covered in 3-digit groups above, but just in case)
  // Generic fallback for all other 5-digit groups
  return [
    ["00","39",2],
    ["400","699",3],
    ["7000","8999",4],
    ["90000","99999",5],
  ];
}

function genericPub2Ranges(): PubRanges {
  return [
    ["00","29",2], ["300","699",3], ["7000","8499",4], ["85000","99999",5],
  ];
}

function genericPub3Ranges(): PubRanges {
  return [
    ["00","29",2], ["300","599",3], ["6000","8999",4], ["90000","99999",5],
  ];
}

function genericPub4Ranges(): PubRanges {
  return [
    ["00","19",2], ["200","599",3], ["6000","8999",4], ["90000","99999",5],
  ];
}

// ── Lookup helpers ─────────────────────────────────────────────────────────

function findPublisherLen(ranges: PubRanges, rest: string): number | null {
  for (const [from, to, len] of ranges) {
    const candidate = rest.slice(0, len);
    if (candidate.length < len) continue;
    if (candidate >= from && candidate <= to) return len;
  }
  return null;
}

// ── Main format functions ──────────────────────────────────────────────────

function formatIsbn13(s: string): string | null {
  const prefix = s.slice(0, 3);
  const body   = s.slice(3, 12);
  const check  = s[12];

  const info = groupInfo(prefix, body);
  if (!info) return `${prefix}-${body}-${check}`; // unknown — minimal

  const [groupLen, pubRanges] = info;
  const groupCode  = body.slice(0, groupLen);
  const afterGroup = body.slice(groupLen);

  const pubLen = findPublisherLen(pubRanges, afterGroup);
  if (pubLen == null) {
    // Unknown publisher — split evenly as best effort
    const half = Math.ceil(afterGroup.length / 2);
    return `${prefix}-${groupCode}-${afterGroup.slice(0, half)}-${afterGroup.slice(half)}-${check}`;
  }

  const pubCode   = afterGroup.slice(0, pubLen);
  const titleCode = afterGroup.slice(pubLen);
  return `${prefix}-${groupCode}-${pubCode}-${titleCode}-${check}`;
}

function formatIsbn10(s: string): string | null {
  // Convert to ISBN-13, format, then strip "978-" prefix
  const as13 = isbn10to13(s);
  if (!as13) return null;
  const f = formatIsbn13(as13);
  if (!f) return null;
  return f.startsWith("978-") ? f.slice(4) : f;
}
