/**
 * Server-side post-login redirect.
 * After signIn() the client navigates here; we read the JWT cookie
 * server-side and redirect to the right section immediately.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session   = await auth();

  if (!session) {
    redirect(`/${locale}/auth/login`);
  }

  const role = (session.user as { role?: string })?.role ?? "MEMBER";

  if (role === "MEMBER") {
    // Member accounts belong in the member portal, not the staff portal.
    // Send them back to the staff login with a clear, actionable error.
    redirect(`/${locale}/auth/login?error=MemberAccount`);
  }

  redirect(`/${locale}/admin`);
}
