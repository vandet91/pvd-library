import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { generateMemberIdFromSettings } from "@/lib/member-id";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q    = searchParams.get("q")    ?? "";
  const role = searchParams.get("role") ?? "";

  const users = await prisma.user.findMany({
    where: {
      AND: [
        q ? {
          OR: [
            { name:  { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        } : {},
        role ? { role: role as "ADMIN" | "LIBRARIAN" | "STAFF" | "MEMBER" } : {},
      ],
    },
    include: {
      member: { select: { memberId: true, memberType: true, isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    users.map(({ password: _p, ...u }) => u)
  );
}

const createSchema = z.object({
  name:     z.string().min(1, "Name is required"),
  email:    z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role:     z.enum(["ADMIN", "LIBRARIAN", "STAFF", "MEMBER"]).default("STAFF"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || session.user?.role !== "ADMIN")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing)
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });

  const hashed = await bcrypt.hash(password, 12);

  // For new staff accounts, read and apply library-configured defaults
  let defaultTheme:       string | undefined;
  let defaultAuthStyle:   string | undefined;
  let defaultAuthMethods: string | undefined;
  if (role !== "MEMBER") {
    const defaultRows = await prisma.settings.findMany({
      where: { key: { in: ["DEFAULT_STAFF_THEME", "DEFAULT_STAFF_AUTH_STYLE", "DEFAULT_STAFF_AUTH_METHODS"] } },
    });
    const byKey = Object.fromEntries(defaultRows.map((r) => [r.key, r.value]));
    defaultTheme       = byKey["DEFAULT_STAFF_THEME"]        ?? "ocean";
    defaultAuthStyle   = byKey["DEFAULT_STAFF_AUTH_STYLE"]   ?? "split";
    defaultAuthMethods = byKey["DEFAULT_STAFF_AUTH_METHODS"] ?? '["password","google","magic"]';
  }

  const user = await prisma.user.create({
    data: {
      name, email, password: hashed, role,
      theme:       defaultTheme,
      authStyle:   defaultAuthStyle,
      authMethods: defaultAuthMethods,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  // Automatically create a Member record (library card) for borrower accounts
  if (role === "MEMBER") {
    const memberName = name || email.split("@")[0];
    // Retry once on the rare chance of a memberId collision
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await prisma.member.create({
          data: {
            memberId:   await generateMemberIdFromSettings(),
            userId:     user.id,
            name:       memberName,
            email:      email,
            memberType: "STUDENT",
          },
        });
        break;
      } catch (err: unknown) {
        if ((err as { code?: string }).code !== "P2002" || attempt === 1) throw err;
      }
    }
  }

  return NextResponse.json(user, { status: 201 });
}
