import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google      from "next-auth/providers/google";
import Nodemailer  from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const STAFF_ROLES = ["ADMIN", "LIBRARIAN", "STAFF"] as const;

function parseAuthMethods(raw?: string | null): string[] {
  try {
    const arr = JSON.parse(raw ?? '["password","google","magic"]');
    return Array.isArray(arr) ? arr : ["password", "google", "magic"];
  } catch {
    return ["password", "google", "magic"];
  }
}

/* ── Credentials (always active) ────────────────────────────── */
const credentialsProvider = Credentials({
  credentials: {
    identifier: { label: "Email or Member ID", type: "text" },
    password:   { label: "Password",           type: "password" },
  },
  async authorize(credentials) {
    try {
      const identifier = credentials?.identifier as string | undefined;
      const password   = credentials?.password   as string | undefined;
      if (!identifier || !password) return null;

      let user = null;

      if (identifier.includes("@")) {
        user = await prisma.user.findUnique({ where: { email: identifier } });
      }
      if (!user) {
        const member = await prisma.member.findFirst({
          where:   { memberId: identifier.toUpperCase() },
          include: { user: true },
        });
        if (member?.user) user = member.user;
      }

      if (!user || !user.password) return null;
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return null;

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    } catch (err) {
      console.error("[auth] credentials error:", err);
      return null;
    }
  },
});

/* ── Google OAuth (skipped when env vars are absent/empty) ───── */
const googleId     = process.env.GOOGLE_CLIENT_ID     ?? "";
const googleSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const googleProvider = googleId && googleSecret
  ? [Google({
      clientId:  googleId,
      clientSecret: googleSecret,
      // Safe in this app: accounts are admin-created (no public self-registration).
      // Without this, signing in with Google when a password account already exists
      // for the same email throws OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    })]
  : [];

/* ── Magic Link (skipped when SMTP credentials are absent) ───── */
const smtpUser = process.env.EMAIL_SERVER_USER ?? "";
const smtpPass = process.env.EMAIL_SERVER_PASS ?? "";
const nodemailerProvider = smtpUser && smtpPass
  ? [Nodemailer({
      server: {
        host:   process.env.EMAIL_SERVER_HOST ?? "smtp.gmail.com",
        port:   Number(process.env.EMAIL_SERVER_PORT ?? 587),
        secure: process.env.EMAIL_SERVER_SECURE === "true",
        auth:   { user: smtpUser, pass: smtpPass },
      },
      from:   process.env.EMAIL_FROM ?? `PVD Library <${smtpUser}>`,
      maxAge: 10 * 60,
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        const { createTransport } = await import("nodemailer");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transport = createTransport(provider.server as any);
        const year = new Date().getFullYear();
        const result = await transport.sendMail({
          to:      identifier,
          from:    provider.from,
          subject: "Sign in to PVD Library",
          text:    `Sign in to PVD Library\n\nLink (expires in 10 min):\n${url}`,
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:32px 32px 24px;">
      <span style="color:#fff;font-size:20px;font-weight:700;">📚 PVD Library</span>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 8px;color:#111827;">Your sign-in link</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Expires in <strong>10 minutes</strong>.</p>
      <a href="${url}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;">
        Sign in to PVD Library
      </a>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;">If you didn't request this, ignore this email.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;color:#d1d5db;font-size:12px;">© ${year} PVD Library</p>
    </div>
  </div>
</body></html>`,
        });
        const failed = (result.rejected as string[]).filter(Boolean);
        if (failed.length) throw new Error(`Email failed: ${failed.join(", ")}`);
      },
    })]
  : [];

/* ── NextAuth config ─────────────────────────────────────────── */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,

  pages: {
    signIn:        "/en/auth/login",
    verifyRequest: "/en/auth/verify-request",
    error:         "/en/auth/login",
  },

  providers: [credentialsProvider, ...googleProvider, ...nodemailerProvider],

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      const dbUser = await prisma.user.findUnique({
        where:  { email: user.email },
        select: { role: true, authMethods: true },
      });

      const methods = parseAuthMethods(dbUser?.authMethods);

      if (account?.provider === "credentials") {
        // All roles allowed via credentials, but "password" must be enabled
        if (!methods.includes("password")) {
          return "/en/auth/login?error=MethodNotAllowed";
        }
        return true;
      }

      // OAuth providers — staff only
      if (!dbUser || !STAFF_ROLES.includes(dbUser.role as typeof STAFF_ROLES[number])) {
        return false;
      }

      const methodName = account?.provider === "google" ? "google" : "magic";
      if (!methods.includes(methodName)) {
        return "/en/auth/login?error=MethodNotAllowed";
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) {
        // Always load fresh from DB on sign-in to pick up latest prefs
        const dbUser = await prisma.user.findUnique({
          where:  { id: user.id },
          select: { role: true, theme: true, authStyle: true, authMethods: true },
        });
        token.id          = user.id;
        token.role        = dbUser?.role        ?? (user as { role?: string }).role;
        token.theme       = dbUser?.theme       ?? null;
        token.authStyle   = dbUser?.authStyle   ?? null;
        token.authMethods = dbUser?.authMethods ?? '["password","google","magic"]';
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id          = token.id          as string;
        session.user.role        = token.role        as string;
        session.user.theme       = token.theme       as string | null;
        session.user.authStyle   = token.authStyle   as string | null;
        session.user.authMethods = token.authMethods as string;
      }
      return session;
    },
  },
});
