import { redirect } from "next/navigation";

// Root path "/" — redirect to the default locale so the user always lands
// on a real page and isn't stranded on the default Next.js template.
export default function RootPage() {
  redirect("/en");
}
