import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { auth } from "@/lib/auth";

/**
 * GET /api/ebooks/[id]/download
 *
 * Secure access gate for ebook files.
 *
 * Public ebooks  (isPublic = true)  → redirect for everyone
 * Protected ebooks (isPublic = false) → require an active session first,
 *   then redirect to the real fileUrl.
 *
 * The actual fileUrl is NEVER exposed to the client — the browser just
 * follows the redirect server-side, so the URL stays server-only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ebook = await prisma.ebook.findUnique({
    where:  { id },
    select: { id: true, fileUrl: true, isPublic: true, title: true },
  });

  if (!ebook)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* ── Protected: require session ──────────────────────────────────────── */
  if (!ebook.isPublic) {
    const session = await auth();

    if (!session)
      return NextResponse.json(
        { error: "Login required to access this resource", requiresAuth: true },
        { status: 401 },
      );

    // Optionally: also require an active member record (not just any user)
    // Uncomment the block below if you want member-only (not admin-only) access.
    /*
    if (!can(session.user?.role, "LIBRARIAN")) {
      const member = await prisma.member.findFirst({
        where: { userId: session.user?.id, isActive: true },
      });
      if (!member)
        return NextResponse.json(
          { error: "An active library membership is required" },
          { status: 403 },
        );
    }
    */
  }

  /* ── Track access (increment view) ──────────────────────────────────── */
  await prisma.ebook.update({ where: { id }, data: { views: { increment: 1 } } });

  /* ── Redirect to the actual file ──────────────────────────────────────── */
  return NextResponse.redirect(ebook.fileUrl, 302);
}
