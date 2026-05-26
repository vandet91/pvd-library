import Sidebar from "@/components/admin/Sidebar";
import Header from "@/components/admin/Header";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  const staffRoles = ["ADMIN", "LIBRARIAN", "STAFF"];
  if (!session || !staffRoles.includes(session.user?.role ?? "")) {
    redirect(`/${locale}/auth/login`);
  }

  const libNameRow = await prisma.settings.findUnique({ where: { key: "LIBRARY_NAME" } });
  const libraryName = libNameRow?.value ?? "PVD Library";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--page-bg)" }}>
      <Sidebar role={session.user?.role ?? "STAFF"} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={libraryName}
          adminName={session.user?.name ?? "Admin"}
          adminEmail={session.user?.email ?? ""}
          role={session.user?.role ?? "STAFF"}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
