"use client";

import { useRouter, useParams, usePathname } from "next/navigation";
import BookSearchChat from "@/components/BookSearchChat";

/**
 * Thin client wrapper so the server admin layout can render BookSearchChat
 * without needing useRouter itself.
 *
 * Hidden on the dedicated AI Assistant page (users already have a full
 * chat interface there — showing the floating bubble would be redundant).
 */
export default function AdminBookSearchChat() {
  const router   = useRouter();
  const params   = useParams();
  const pathname = usePathname();
  const locale   = (params?.locale as string) ?? "en";

  // Don't show the floating bubble when already on the AI assistant page
  if (pathname?.includes("/admin/ai-assistant")) return null;

  return (
    <BookSearchChat
      locale={locale}
      onBookClick={(id) => router.push(`/${locale}/admin/books/${id}`)}
    />
  );
}
