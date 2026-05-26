import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const ALLOWED_EXTS  = ["png", "jpg", "jpeg", "webp", "svg"];
const MAX_BYTES     = 2 * 1024 * 1024; // 2 MB

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Remove any previously-stored logo file (any supported extension). */
async function deleteExistingLogo() {
  for (const ext of ALLOWED_EXTS) {
    try {
      await unlink(path.join(UPLOAD_DIR, `logo.${ext}`));
    } catch {
      // File doesn't exist — that's fine
    }
  }
}

/* ── POST /api/settings/logo — upload a new logo ── */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Validate type
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Unsupported file type. Use PNG, JPG, WebP or SVG." },
      { status: 400 },
    );

  // Validate size
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "File too large. Maximum size is 2 MB." },
      { status: 400 },
    );

  // Derive extension from MIME type (more reliable than filename)
  const extMap: Record<string, string> = {
    "image/png":     "png",
    "image/jpeg":    "jpg",
    "image/webp":    "webp",
    "image/svg+xml": "svg",
  };
  const ext = extMap[file.type] ?? "png";

  const bytes  = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Remove old logo(s) and write new one
  await deleteExistingLogo();
  await writeFile(path.join(UPLOAD_DIR, `logo.${ext}`), buffer);

  // Store the URL with a cache-busting version param
  const url = `/uploads/logo.${ext}?v=${Date.now()}`;
  await prisma.settings.upsert({
    where:  { key: "LIBRARY_LOGO" },
    update: { value: url },
    create: { key: "LIBRARY_LOGO", value: url },
  });

  return NextResponse.json({ url });
}

/* ── DELETE /api/settings/logo — remove the logo ── */
export async function DELETE() {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteExistingLogo();
  await prisma.settings.upsert({
    where:  { key: "LIBRARY_LOGO" },
    update: { value: "" },
    create: { key: "LIBRARY_LOGO", value: "" },
  });

  return NextResponse.json({ success: true });
}
