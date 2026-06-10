import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { LOCALE_CODES, DEFAULT_LOCALE } from "@/lib/locales";
import { LOCALE_META } from "@/lib/locale-meta";

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
  LIBRARY_TELEGRAM:         "",   // e.g. "@pvdlibrary" — shown to members for direct contact
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
  // Stock & sales
  STOCK_CURRENCY:                    "USD",   // primary currency (USD / KHR / THB …)
  STOCK_SECONDARY_CURRENCY:          "",      // optional second currency (e.g. KHR); empty = off
  STOCK_SECONDARY_RATE:              "4100",  // 1 USD = X secondary units
  // Book sale / shop
  BOOK_SALE_ENABLED:                 "false",
  BOOK_SALE_QR_IMAGE:                "",      // URL of payment QR code image
  BOOK_SALE_PAYMENT_METHODS:         "qr",    // comma-separated: qr,cash_on_pickup
  BOOK_SALE_SHIPPING_FEE:            "2.00",  // default delivery fee in primary currency
  BOOK_SALE_TAX_RATE:                "0",     // tax percentage e.g. "10" = 10%
  BOOK_SALE_DELIVERY_ENABLED:        "true",
  BOOK_SALE_PICKUP_ENABLED:          "true",
  BOOK_SALE_RETURN_WINDOW_DAYS:      "7",
  BOOK_SALE_CART_HOLD_MINUTES:       "60",    // reserve copy in cart for X minutes
  // Bank / QR payment details shown to members at checkout
  BOOK_SALE_BANK_NAME:               "",      // e.g. "ABA Bank"
  BOOK_SALE_ACCOUNT_NAME:            "",      // account holder name
  BOOK_SALE_ACCOUNT_NUMBER:          "",      // account number or phone
  BOOK_SALE_PAYMENT_INSTRUCTIONS:    "",      // freeform instructions shown to member
  // Member self-registration
  MEMBER_SELF_REGISTER:              "false",
  MEMBER_SELF_REGISTER_AUTO_APPROVE: "false",
  // Member ID format
  MEMBER_ID_FORMAT:                  "MEM-{YYYY}-{RAND4}",
  MEMBER_ID_COUNTER:                 "0",
  // Public catalog (Discover + E-Library) theme
  OPAC_THEME:                        "royal",
  // Full-width layout for Discover, E-Library and Shop (false = max-w-6xl centered)
  OPAC_FULL_WIDTH:                   "false",
  OPAC_PAGE_BG:                      "light",  // "light" | "white" | "dark"
  OPAC_FONT:                         "default", // Google Fonts family name, "default", or a custom font name
  OPAC_FONT_EN:                      "default", // Font for English / Latin text
  OPAC_FONT_KM:                      "default", // Font for Khmer text
  OPAC_CUSTOM_FONTS:                 "[]",      // JSON: [{name:string, url:string}]
  // Public footer — contact info shown on Discover, E-Library, Bookstore
  PUBLIC_FOOTER_ENABLED:             "false",
  PUBLIC_FOOTER_SHOW:                "phone,email,telegram,address",
  PUBLIC_FOOTER_DESCRIPTION:         "Your gateway to knowledge and discovery. Explore, learn, and grow with us.",
  LIBRARY_HOURS:                     "",
  LIBRARY_WHATSAPP:                  "",
  LIBRARY_WEBSITE:                   "",
  // Public catalog pagination mode — "numbers" or "loadmore"
  PUBLIC_PAGINATION_MODE:            "loadmore",
  // Per-page limit for paginated catalog/ebook/shop listings
  PUBLIC_PAGINATION_LIMIT:           "30",
  // Book cover style for Discover, E-Library and Shop pages
  BOOK_COVER_STYLE:                  "spine",  // "spine" | "vignette" | "tilt" | "hardcover"
  // Book cover frame for Discover, E-Library and Shop pages
  BOOK_COVER_FRAME:                  "none",   // "none" | "accent" | "glow" | "classic" | "shadow"
  // Audience level display labels (JSON map of enum value → display name)
  AUDIENCE_LEVEL_LABELS: JSON.stringify({ CHILDREN: "Children", YOUTH: "Youth", ADULTS: "Adults", UNSPECIFIED: "Unspecified" }),
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
      // the list contains only known locale codes (LOCALE_META covers all 40+ supported languages).
      if (key === "ENABLED_LOCALES") {
        try {
          const arr = JSON.parse(safe);
          const valid = (Array.isArray(arr) ? arr : [])
            .filter((c: unknown): c is string => typeof c === "string" && c in LOCALE_META);
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
