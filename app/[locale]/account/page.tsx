"use client";

import { useSession } from "next-auth/react";
import { useLocale }  from "next-intl";
import { useRouter }  from "next/navigation";
import { useEffect }  from "react";
import Link           from "next/link";
import { User, BookOpen, ChevronLeft, Send, Inbox } from "lucide-react";
import MemberHeader        from "@/components/shared/MemberHeader";
import TelegramLinkWidget  from "@/components/member/TelegramLinkWidget";
import { useLibraryName }  from "@/context/library-name";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const locale      = useLocale();
  const router      = useRouter();
  const libraryName = useLibraryName();

  // Redirect if not a member
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/member/login`);
    }
  }, [status, locale, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const role = (session?.user as { role?: string })?.role;
  if (role && role !== "MEMBER") {
    router.push(`/${locale}/admin`);
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-[#0f1e4a]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link href={`/${locale}/discover`}
              className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs transition-colors">
              <ChevronLeft className="w-4 h-4" />
              {libraryName}
            </Link>
          </div>
          <MemberHeader theme="dark" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Profile header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <User className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{session?.user?.name ?? "Member"}</h1>
            <p className="text-sm text-gray-500">{session?.user?.email}</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/${locale}/loans`}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">My Loans</span>
          </Link>
          <Link href={`/${locale}/discover`}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">Discover Books</span>
          </Link>
          <Link href={`/${locale}/book-requests`}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
            <div className="w-9 h-9 bg-pink-50 rounded-lg flex items-center justify-center">
              <Inbox className="w-5 h-5 text-pink-600" />
            </div>
            <span className="text-sm font-medium text-gray-700">Book Requests</span>
          </Link>
        </div>

        {/* Telegram linking */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800">Telegram Notifications</h2>
          </div>
          <TelegramLinkWidget />
        </div>

      </main>
    </div>
  );
}
