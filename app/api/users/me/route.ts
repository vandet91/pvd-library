import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

/** GET /api/users/me — return the current user's preferences */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { theme: true, authStyle: true, authMethods: true },
  });

  return NextResponse.json({
    theme:       user?.theme       ?? null,
    authStyle:   user?.authStyle   ?? null,
    authMethods: user?.authMethods ?? '["password","google","magic"]',
  });
}

const prefSchema = z.object({
  theme:     z.enum(["ocean", "midnight", "emerald", "academic"]).optional(),
  authStyle: z.enum(["split", "glass", "minimal"]).optional(),
});

/** PATCH /api/users/me — update own theme / authStyle (any logged-in user) */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json();
  const parsed = prefSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const data: { theme?: string; authStyle?: string } = {};
  if (parsed.data.theme     !== undefined) data.theme     = parsed.data.theme;
  if (parsed.data.authStyle !== undefined) data.authStyle = parsed.data.authStyle;

  const user = await prisma.user.update({
    where:  { id: session.user.id },
    data,
    select: { theme: true, authStyle: true, authMethods: true },
  });

  return NextResponse.json(user);
}
