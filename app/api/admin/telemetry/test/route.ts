import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { sendHeartbeat } from "@/lib/telemetry";

export async function POST() {
  const session = await auth();
  if (!session || !can(session.user?.role, "ADMIN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendHeartbeat();
  return NextResponse.json(result);
}
