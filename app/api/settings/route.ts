import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/lib/locales";

/** Default values seeded when a key has never been saved. */
const DEFAULTS: Record<string, string> = {
  DEFAULT_LOAN_DAYS:        "14",
  FINE_PER_DAY:             "0.50",
  MAX_RENEWALS:             "2",
  MAX_LOANS_PER_MEMBER:     "3",
  LIBRARY_NAME:             "PVD Library",
  LIBRARY_EMAIL:            "",
  LIBRARY_PHONE:            "",
  LIBRARY_ADDRESS:          "",
  BARCODE_PREFIX:           "PVD",
  BARCODE_PADDING:          "6",
  RESERVATION_EXPIRE_DAYS:  "7",
  // Defaults applied to newly-created staff accounts
  DEFAULT_STAFF_THEME:        "ocean",
  DEFAULT_STAFF_AUTH_STYLE:   "split",
  DEFAULT_STAFF_AUTH_METHODS: '["password","google","magic"]',
  // All registered locales are enabled by default
  ENABLED_LOCALES: JSON.stringify(LOCALE_CODES),
  // AI book search — can be toggled per audience
  AI_SEARCH_ADMIN:  "true",
  AI_SEARCH_MEMBER: "true",
  // Email notifications
  NOTIFICATIONS_ENABLED:             "true",
  DUE_SOON_DAYS:                     "3",
  // Telegram bot notifications
  TELEGRAM_NOTIFICATIONS_ENABLED:   "true",
  TELEGRAM_MEMBERSHIP_EXPIRY_DAYS:   "7",
  TELEGRAM_LINK_MEMBER:              "true",
  PHONE_CLICK_ACTION:                "both",
  // Member self-registration
  MEMBER_SELF_REGISTER:              "false",
  MEMBER_SELF_REGISTER_AUTO_APPROVE: "false",
  // Public catalog (Discover + E-Library) theme
  OPAC_THEME:                        "royal",
  // NOTE: LIBRARY_LOGO is intentionally excluded here.
  // It is managed exclusively via POST/DELETE /api/settings/logo
  // and must never be overwritten by the bulk PUT handler.
};

export async function GET() {
  const rows = await prisma.settings.findMany();
  // Merge stored values on top of defaults so every key is always present
  const merged: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    merged[row.key] = row.value;
  }
  return NextResponse.json(merged);
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: Record<string, string> = await request.json();

  // Only allow known keys to be saved
  const allowedKeys = Object.keys(DEFAULTS);
  const ops = Object.entries(body)
    .filter(([k]) => allowedKeys.includes(k))
    .map(([key, value]) => {
      let safe = String(value);

      // ENABLED_LOCALES: ensure the default locale is always present and
      // the list contains only known locale codes.
      if (key === "ENABLED_LOCALES") {
        try {
          const arr = JSON.parse(safe);
          const valid = (Array.isArray(arr) ? arr : [])
            .filter((c: unknown): c is string => (LOCALE_CODES as readonly string[]).includes(c as string));
          if (!valid.includes(DEFAULT_LOCALE)) valid.unshift(DEFAULT_LOCALE);
          safe = JSON.stringify(valid.length > 0 ? valid : [DEFAULT_LOCALE]);
        } catch {
          safe = JSON.stringify([DEFAULT_LOCALE]);
        }
      }

      return prisma.settings.upsert({
        where:  { key },
        update: { value: safe },
        create: { key,  value: safe },
      });
    });

  await prisma.$transaction(ops);
  return NextResponse.json({ success: true });
}
