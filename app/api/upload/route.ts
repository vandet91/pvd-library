import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_TYPES: Record<string, string[]> = {
  image:    [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"],
  pdf:      [".pdf"],
  epub:     [".epub"],
  audio:    [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"],
  video:    [".mp4", ".webm", ".mov", ".avi", ".mkv"],
  fonts:    [".ttf", ".woff", ".woff2", ".otf"],
  settings: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"],
  any:      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg",
             ".pdf", ".epub", ".mp3", ".wav", ".ogg", ".m4a", ".aac",
             ".flac", ".mp4", ".webm", ".mov"],
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !can(session.user?.role, "LIBRARIAN"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Size guard
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_SIZE)
    return NextResponse.json({ error: "File too large (max 50 MB)" }, { status: 413 });

  // Extension check
  const ext = extname(file.name).toLowerCase();
  // Support both "folder" (used by font/settings uploaders) and "category"
  const folder   = (formData.get("folder") as string | null) ?? (formData.get("category") as string | null) ?? "any";
  const allowed  = ALLOWED_TYPES[folder] ?? ALLOWED_TYPES.any;
  if (!allowed.includes(ext))
    return NextResponse.json({ error: `File type ${ext} not allowed` }, { status: 415 });

  // Sanitize filename and write into subfolder
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename  = `${Date.now()}-${safe}`;
  const uploadDir = join(process.cwd(), "public", "uploads", folder === "any" ? "" : folder);

  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), Buffer.from(bytes));

  return NextResponse.json({ url: `/uploads/${folder === "any" ? "" : folder + "/"}${filename}` });
}
