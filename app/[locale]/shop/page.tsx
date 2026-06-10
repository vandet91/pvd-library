import { prisma } from "@/lib/prisma";
import { buildGoogleFontsUrl } from "@/lib/font-url";
import ShopClient from "./ShopClient";

// Always fetch fresh — settings can change any time
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const keys = [
    "OPAC_THEME", "OPAC_FULL_WIDTH", "OPAC_PAGE_BG", "OPAC_FONT", "OPAC_FONT_EN", "OPAC_FONT_KM", "OPAC_CUSTOM_FONTS", "BOOK_SALE_ENABLED",
    "BOOK_COVER_STYLE", "BOOK_COVER_FRAME", "STOCK_CURRENCY", "STOCK_SECONDARY_CURRENCY", "STOCK_SECONDARY_RATE",
    "PUBLIC_PAGINATION_MODE", "PUBLIC_PAGINATION_LIMIT",
    "PUBLIC_FOOTER_ENABLED", "PUBLIC_FOOTER_SHOW",
    "LIBRARY_PHONE", "LIBRARY_EMAIL", "LIBRARY_ADDRESS",
    "LIBRARY_TELEGRAM", "LIBRARY_HOURS", "LIBRARY_FACEBOOK", "LIBRARY_WEBSITE",
  ];

  const rows = await prisma.settings.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const googleFontsUrl = buildGoogleFontsUrl([s.OPAC_FONT_EN, s.OPAC_FONT_KM, s.OPAC_FONT]);

  return (
    <>
      {googleFontsUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={googleFontsUrl} />
        </>
      )}
    <ShopClient
      opacTheme={s.OPAC_THEME ?? "royal"}
      fullWidth={s.OPAC_FULL_WIDTH === "true"}
      pageBg={(s.OPAC_PAGE_BG ?? "light") as "light" | "white" | "dark"}
      pageFont={s.OPAC_FONT ?? "default"}
      pageFontEn={s.OPAC_FONT_EN ?? "default"}
      pageFontKm={s.OPAC_FONT_KM ?? "default"}
      pageCustomFonts={(() => { try { return JSON.parse(s.OPAC_CUSTOM_FONTS ?? "[]"); } catch { return []; } })()}
      initialEnabled={s.BOOK_SALE_ENABLED === "true"}
      coverStyle={(s.BOOK_COVER_STYLE ?? "spine") as "spine" | "vignette" | "tilt" | "hardcover"}
      coverFrame={(s.BOOK_COVER_FRAME ?? "none") as "none" | "accent" | "glow" | "classic" | "shadow"}
      initialCurrency={s.STOCK_CURRENCY ?? "USD"}
      initialSecCur={s.STOCK_SECONDARY_CURRENCY ?? ""}
      initialSecRate={parseFloat(s.STOCK_SECONDARY_RATE ?? "0") || 0}
      paginationMode={(s.PUBLIC_PAGINATION_MODE ?? "loadmore") as "loadmore" | "numbers"}
      paginationLimit={parseInt(s.PUBLIC_PAGINATION_LIMIT ?? "30", 10) || 30}
      footerEnabled={s.PUBLIC_FOOTER_ENABLED === "true"}
      footerShow={(s.PUBLIC_FOOTER_SHOW ?? "phone,email,telegram,address").split(",").map((v: string) => v.trim()).filter(Boolean)}
      footerPhone={s.LIBRARY_PHONE ?? ""}
      footerEmail={s.LIBRARY_EMAIL ?? ""}
      footerAddress={s.LIBRARY_ADDRESS ?? ""}
      footerTelegram={s.LIBRARY_TELEGRAM ?? ""}
      footerHours={s.LIBRARY_HOURS ?? ""}
      footerFacebook={s.LIBRARY_FACEBOOK ?? ""}
      footerWebsite={s.LIBRARY_WEBSITE ?? ""}
    />
    </>
  );
}
