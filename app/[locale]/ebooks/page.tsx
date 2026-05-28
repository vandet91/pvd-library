import { prisma } from "@/lib/prisma";
import EbooksClient from "./EbooksClient";

// Always fetch fresh — settings can change any time
export const dynamic = "force-dynamic";

export default async function EbooksPage() {
  const setting = await prisma.settings.findUnique({ where: { key: "OPAC_THEME" } });
  return <EbooksClient opacTheme={setting?.value ?? "royal"} />;
}
