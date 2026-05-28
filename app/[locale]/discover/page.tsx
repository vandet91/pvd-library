import { prisma } from "@/lib/prisma";
import DiscoverClient from "./DiscoverClient";

// Always fetch fresh — settings can change any time
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const setting = await prisma.settings.findUnique({ where: { key: "OPAC_THEME" } });
  return <DiscoverClient opacTheme={setting?.value ?? "royal"} />;
}
