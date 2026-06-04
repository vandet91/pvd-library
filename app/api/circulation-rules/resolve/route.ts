import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { resolveCirculationRule } from "@/lib/circulation-rules";

/**
 * GET /api/circulation-rules/resolve
 * ?memberType=STUDENT&materialType=BOOK&branchId=xxx
 *
 * Returns the resolved rule for a given combination so the UI can
 * display the correct loan days / limits before checkout.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "STAFF"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const memberType   = searchParams.get("memberType")   || null;
  const materialType = searchParams.get("materialType") || null;
  const branchId     = searchParams.get("branchId")     || null;

  const rule = await resolveCirculationRule({ memberType, materialType, branchId });
  return NextResponse.json(rule);
}
