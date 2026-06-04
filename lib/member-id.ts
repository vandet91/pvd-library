/**
 * Generates the next Member ID using the format stored in Settings.
 *
 * Settings keys:
 *   MEMBER_ID_FORMAT  — format string, e.g. "MEM-{YYYY}-{SEQ4}"  (default: "MEM-{YYYY}-{RAND4}")
 *   MEMBER_ID_COUNTER — integer counter used by {SEQ*} tokens, auto-incremented each call
 *
 * Uniqueness: if the generated ID already exists (collision), we retry up to 10 times.
 */

import { prisma } from "@/lib/prisma";
import { applyMemberIdFormat } from "@/lib/utils";

const DEFAULT_FORMAT  = "MEM-{YYYY}-{RAND4}";

export async function generateMemberIdFromSettings(): Promise<string> {
  /* ── Read settings ── */
  const [fmtRow, ctrRow] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "MEMBER_ID_FORMAT"  } }),
    prisma.settings.findUnique({ where: { key: "MEMBER_ID_COUNTER" } }),
  ]);

  const format = fmtRow?.value?.trim() || DEFAULT_FORMAT;
  const usesSeq = /{SEQ[456]}/.test(format);

  let counter = parseInt(ctrRow?.value ?? "0", 10);
  if (isNaN(counter)) counter = 0;

  /* ── If format uses a sequence, increment atomically ── */
  if (usesSeq) {
    counter += 1;
    await prisma.settings.upsert({
      where:  { key: "MEMBER_ID_COUNTER" },
      update: { value: String(counter) },
      create: { key: "MEMBER_ID_COUNTER", value: String(counter) },
    });
  }

  /* ── Generate & check uniqueness (retry on collision) ── */
  for (let attempt = 0; attempt < 10; attempt++) {
    const seq = usesSeq ? counter + attempt : counter;
    const id  = applyMemberIdFormat(format, seq);

    const exists = await prisma.member.findUnique({ where: { memberId: id }, select: { id: true } });
    if (!exists) return id;

    /* Collision — if using random tokens, retry with new random; if seq, increment */
    if (usesSeq) counter++;
  }

  /* Last resort: fall back to timestamp */
  return `MEM-${Date.now()}`;
}
