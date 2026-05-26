import { prisma } from "@/lib/prisma";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ["DEFAULT_STAFF_AUTH_STYLE", "DEFAULT_STAFF_THEME"] } },
  });
  const map     = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const authStyle = map["DEFAULT_STAFF_AUTH_STYLE"] ?? "split";
  const theme     = map["DEFAULT_STAFF_THEME"]      ?? "ocean";

  return <LoginClient authStyle={authStyle} theme={theme} />;
}
