import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string().min(8, "New password must be at least 8 characters"),
});

/** Any authenticated staff member can change their own password. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues.map((e) => e.message).join(", ") }, { status: 400 });

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { password: true },
  });

  if (!user?.password)
    return NextResponse.json(
      { error: "Password change is not available for accounts that use Google or Magic Link sign-in." },
      { status: 400 },
    );

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid)
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });

  await prisma.user.update({
    where: { id: session.user.id },
    data:  { password: await bcrypt.hash(parsed.data.newPassword, 12) },
  });

  return NextResponse.json({ success: true });
}
