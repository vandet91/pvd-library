import { prisma } from "@/lib/prisma";
import EbooksClient from "./EbooksClient";

export const dynamic = "force-dynamic";

const FOOTER_KEYS = [
  "PUBLIC_FOOTER_ENABLED", "PUBLIC_FOOTER_SHOW", "PUBLIC_FOOTER_DESCRIPTION",
  "LIBRARY_PHONE", "LIBRARY_EMAIL", "LIBRARY_ADDRESS",
  "LIBRARY_TELEGRAM", "LIBRARY_HOURS",
  "LIBRARY_WHATSAPP", "LIBRARY_WEBSITE",
];

export default async function EbooksPage() {
  const keys = ["OPAC_THEME", "OPAC_FULL_WIDTH", "OPAC_PAGE_BG", "OPAC_FONT", "OPAC_CUSTOM_FONTS", "BOOK_SALE_ENABLED", "AI_SEARCH_MEMBER", "PUBLIC_PAGINATION_MODE", "PUBLIC_PAGINATION_LIMIT", ...FOOTER_KEYS];
  const rows = await prisma.settings.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return (
    <EbooksClient
      opacTheme={s.OPAC_THEME ?? "royal"}
      fullWidth={s.OPAC_FULL_WIDTH === "true"}
      pageBg={(s.OPAC_PAGE_BG ?? "light") as "light" | "white" | "dark"}
      pageFont={s.OPAC_FONT ?? "default"}
      pageCustomFonts={(() => { try { return JSON.parse(s.OPAC_CUSTOM_FONTS ?? "[]"); } catch { return []; } })()}
      initialSaleEnabled={s.BOOK_SALE_ENABLED === "true"}
      initialAiEnabled={s.AI_SEARCH_MEMBER !== "false"}
      paginationMode={(s.PUBLIC_PAGINATION_MODE ?? "loadmore") as "loadmore" | "numbers"}
      paginationLimit={parseInt(s.PUBLIC_PAGINATION_LIMIT ?? "20", 10) || 20}
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
  );
}
