import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Eye, Lock, LogIn } from "lucide-react";
import EbookViewer from "@/components/shared/EbookViewer";

export default async function EbookViewPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const locale  = await getLocale();

  const ebook = await prisma.ebook.findUnique({
    where:   { id },
    include: { category: true, author: true },
  });
  if (!ebook) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  /* ── Protected ebook: require login ──────────────────────────────────── */
  if (!ebook.isPublic && !session) {
    // Show a login wall instead of 404 so users know the resource exists
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
          <Lock className="w-8 h-8 text-white/70" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Members Only</h1>
          <p className="text-white/60 text-sm max-w-sm">
            <span className="font-semibold text-white">&ldquo;{ebook.title}&rdquo;</span>{" "}
            is available to library members only. Please log in to access this resource.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={`/${locale}/auth/login?callbackUrl=/${locale}/ebooks/${id}`}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <LogIn className="w-4 h-4" /> Log in to read
          </Link>
          <Link
            href={`/${locale}/ebooks`}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to library
          </Link>
        </div>
      </div>
    );
  }

  // Increment view (only for the viewer, not the login-wall)
  await prisma.ebook.update({ where: { id }, data: { views: { increment: 1 } } });

  const displayTitle = locale === "km" && ebook.titleKm ? ebook.titleKm : ebook.title;

  /* ── Access URL: route through the secure download endpoint ─────────── */
  // For protected ebooks the direct fileUrl is never sent to the browser;
  // we always use the /api/ebooks/[id]/download proxy which re-checks auth.
  const accessUrl = !ebook.isPublic
    ? `/api/ebooks/${id}/download`
    : ebook.fileUrl;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-gray-800 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/${locale}/ebooks`}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="text-white/30">|</span>
          <h1 className="text-sm font-medium text-white truncate">{displayTitle}</h1>
          {ebook.author && (
            <span className="text-white/50 text-xs flex-shrink-0">— {ebook.author.name}</span>
          )}
          {!ebook.isPublic && (
            <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full flex-shrink-0">
              <Lock className="w-3 h-3" /> Members Only
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs text-white/40">
            <Eye className="w-3.5 h-3.5" />{ebook.views + 1}
          </span>
          {/* Only show "Open original" link to admins for protected ebooks */}
          {(ebook.isPublic || isAdmin) && (
            <a
              href={accessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open original
            </a>
          )}
        </div>
      </div>

      {/* Viewer — uses secure proxy URL for protected ebooks */}
      <div className="flex-1">
        <EbookViewer type={ebook.ebookType} url={accessUrl} title={displayTitle} />
      </div>
    </div>
  );
}
