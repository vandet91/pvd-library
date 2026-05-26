import { NextRequest, NextResponse } from "next/server";
import { runAllNotifications } from "@/lib/notifications";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

/**
 * Daily notifications cron endpoint.
 *
 * Two ways to call it:
 *   1) External cron (Vercel Cron, GitHub Actions, crontab):
 *      `Authorization: Bearer <CRON_SECRET>` header — set CRON_SECRET in .env
 *   2) Admin "Run now" button (logged-in ADMIN user)
 */
export async function GET(request: NextRequest) {
  const ok = await authorize(request);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

export async function POST(request: NextRequest) {
  const ok = await authorize(request);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

async function authorize(request: NextRequest): Promise<boolean> {
  // Path 1: cron secret in Authorization header
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }
  // Path 2: logged-in ADMIN via session
  const session = await auth();
  if (session && can(session.user?.role, "ADMIN")) return true;
  return false;
}

async function run() {
  const started = Date.now();
  try {
    const result = await runAllNotifications();
    return NextResponse.json({
      ok:        true,
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (err) {
    console.error("[cron/notifications] failed:", err);
    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
