import { prisma } from "@/lib/prisma";
import { buildGoogleFontsUrl } from "@/lib/font-url";
import DiscoverClient from "./DiscoverClient";

export const dynamic = "force-dynamic";

const FOOTER_KEYS = [
  "PUBLIC_FOOTER_ENABLED", "PUBLIC_FOOTER_SHOW", "PUBLIC_FOOTER_DESCRIPTION",
  "LIBRARY_PHONE", "LIBRARY_EMAIL", "LIBRARY_ADDRESS",
  "LIBRARY_TELEGRAM", "LIBRARY_HOURS",
  "LIBRARY_WHATSAPP", "LIBRARY_WEBSITE",
];

export default async function DiscoverPage() {
  const keys = ["OPAC_THEME", "OPAC_FULL_WIDTH", "OPAC_PAGE_BG", "OPAC_FONT", "OPAC_FONT_EN", "OPAC_FONT_KM", "OPAC_CUSTOM_FONTS", "BOOK_SALE_ENABLED", "AI_SEARCH_MEMBER", "PUBLIC_PAGINATION_MODE", "PUBLIC_PAGINATION_LIMIT", "BOOK_COVER_STYLE", "BOOK_COVER_FRAME", ...FOOTER_KEYS];
  const [rows, categories] = await Promise.all([
    prisma.settings.findMany({ where: { key: { in: keys } } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
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
    <DiscoverClient
      opacTheme={s.OPAC_THEME ?? "royal"}
      fullWidth={s.OPAC_FULL_WIDTH === "true"}
      pageBg={(s.OPAC_PAGE_BG ?? "light") as "light" | "white" | "dark"}
      pageFont={s.OPAC_FONT ?? "default"}
      pageFontEn={s.OPAC_FONT_EN ?? "default"}
      pageFontKm={s.OPAC_FONT_KM ?? "default"}
      pageCustomFonts={(() => { try { return JSON.parse(s.OPAC_CUSTOM_FONTS ?? "[]"); } catch { return []; } })()}
      initialSaleEnabled={s.BOOK_SALE_ENABLED === "true"}
      initialAiEnabled={s.AI_SEARCH_MEMBER !== "false"}
      coverStyle={(s.BOOK_COVER_STYLE ?? "spine") as "spine" | "vignette" | "tilt" | "hardcover"}
      coverFrame={(s.BOOK_COVER_FRAME ?? "none") as "none" | "accent" | "glow" | "classic" | "shadow"}
      paginationMode={(s.PUBLIC_PAGINATION_MODE ?? "loadmore") as "loadmore" | "numbers"}
      paginationLimit={parseInt(s.PUBLIC_PAGINATION_LIMIT ?? "30", 10) || 30}
      initialCategories={categories}
      footerEnabled={s.PUBLIC_FOOTER_ENABLED === "true"}
      footerShow={(s.PUBLIC_FOOTER_SHOW ?? "phone,email,telegram,address").split(",").map(v => v.trim()).filter(Boolean)}
      footerPhone={s.LIBRARY_PHONE ?? ""}
      footerEmail={s.LIBRARY_EMAIL ?? ""}
      footerAddress={s.LIBRARY_ADDRESS ?? ""}
      footerTelegram={s.LIBRARY_TELEGRAM ?? ""}
      footerHours={s.LIBRARY_HOURS ?? ""}
      footerWhatsapp={s.LIBRARY_WHATSAPP ?? ""}
      footerWebsite={s.LIBRARY_WEBSITE ?? ""}
      footerDescription={s.PUBLIC_FOOTER_DESCRIPTION ?? ""}
    />
    </>
  );
}
