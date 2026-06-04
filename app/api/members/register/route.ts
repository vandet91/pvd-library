import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateMemberIdFromSettings } from "@/lib/member-id";
import { z } from "zod";
import bcrypt from "bcryptjs";

const registerSchema = z.object({
  name:       z.string().min(2, "Name must be at least 2 characters"),
  email:      z.string().email("Invalid email address").optional().or(z.literal("")),
  phone:      z.string().optional(),
  address:    z.string().optional(),
  memberType: z.enum(["STUDENT", "TEACHER", "STAFF", "PUBLIC"]).default("PUBLIC"),
  password:   z.string().min(6, "Password must be at least 6 characters"),
}).refine(
  (d) => !!(d.email?.trim() || d.phone?.trim()),
  { message: "Please provide at least an email address or a phone number." },
);

/** Generate a placeholder email for phone-only members.
 *  Never displayed to the user; only used internally for the User.email UNIQUE constraint. */
function placeholderEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@pvd.local`;
}

export async function POST(request: NextRequest) {
  /* ── Check setting ── */
  const setting = await prisma.settings.findUnique({
    where: { key: "MEMBER_SELF_REGISTER" },
  });
  if (setting?.value !== "true") {
    return NextResponse.json(
      { error: "Self-registration is currently closed. Please contact the library." },
      { status: 403 },
    );
  }

  /* ── Validate body ── */
  const body   = await request.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, address, memberType, password } = parsed.data;
  const email = parsed.data.email?.trim() || null;
  const phone = parsed.data.phone?.trim() || null;
  const phoneOnly = !email && !!phone;

  /* ── Determine the User.email to use ── */
  const userEmail = email ?? placeholderEmail(phone!);

  /* ── Check duplicate ── */
  const [emailConflict, phoneConflict] = await Promise.all([
    prisma.user.findUnique({ where: { email: userEmail } }),
    phone ? prisma.member.findFirst({ where: { phone } }) : null,
  ]);

  if (emailConflict) {
    return NextResponse.json(
      { error: email
          ? "An account with this email already exists."
          : "An account with this phone number already exists." },
      { status: 409 },
    );
  }
  if (phoneConflict) {
    return NextResponse.json(
      { error: "An account with this phone number already exists." },
      { status: 409 },
    );
  }

  /* ── Check auto-approve setting ── */
  const autoApproveRow = await prisma.settings.findUnique({
    where: { key: "MEMBER_SELF_REGISTER_AUTO_APPROVE" },
  });
  const autoApprove = autoApproveRow?.value === "true";

  /* ── Create User + Member in one transaction ── */
  const hashed   = await bcrypt.hash(password, 12);
  const memberId = await generateMemberIdFromSettings();

  const expireDate = new Date();
  expireDate.setFullYear(expireDate.getFullYear() + 1);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email:    userEmail,
        password: hashed,
        role:     "MEMBER",
      },
    });

    await tx.member.create({
      data: {
        memberId,
        userId:          user.id,
        name,
        email:           email,          // store real email (null for phone-only)
        phone:           phone,
        address:         address || null,
        memberType,
        isActive:        autoApprove,
        pendingApproval: !autoApprove,   // true when waiting for staff review
        expireDate:      autoApprove ? expireDate : null,
      },
    });
  });

  return NextResponse.json({
    ok:          true,
    autoApprove,
    phoneOnly,
    memberId,
    message: autoApprove
      ? phoneOnly
        ? `Account created! Sign in using your Member ID: ${memberId}`
        : "Account created! You can now sign in with your email."
      : "Registration submitted! Your account is pending staff approval.",
  });
}
