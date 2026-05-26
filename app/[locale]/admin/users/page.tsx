import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session    = await auth();

  if (session?.user?.role !== "ADMIN") {
    redirect(`/${locale}/admin`);
  }

  return <UsersClient currentUserId={session.user.id!} />;
}
