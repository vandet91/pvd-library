"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  FileText, BookMarked, Link2, Video, Music, ExternalLink,
  Upload, ImageIcon, X, BookOpen,
} from "lucide-react";
import LanguageSelect from "@/components/shared/LanguageSelect";

interface Category { id: string; name: string }
interface Author   { id: string; name: string }
interface Book     { id: string; title: string; isbn: string | null }

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PDF:   <FileText   className="w-4 h-4" />,
  EPUB:  <BookMarked className="w-4 h-4" />,
  LINK:  <Link2      className="w-4 h-4" />,
  VIDEO: <Video      className="w-4 h-4" />,
  AUDIO: <Music      className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  PDF:   "bg-red-50    text-red-700   border-red-200",
  EPUB:  "bg-blue-50   text-blue-700  border-blue-200",
  LINK:  "bg-gray-50   text-gray-700  border-gray-200",
  VIDEO: "bg-violet-50 text-violet-700 border-violet-200",
  AUDIO: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const TYPE_HINT_KEYS: Record<string, "hintPdf" | "hintEpub" | "hintLink" | "hintVideo" | "hintAudio"> = {
  PDF:   "hintPdf",
  EPUB:  "hintEpub",
  LINK:  "hintLink",
  VIDEO: "hintVideo",
  AUDIO: "hintAudio",
};

/** Types that support direct file upload */
const UPLOADABLE = ["PDF", "EPUB", "AUDIO"];
/** Accept patterns per type */
const FILE_ACCEPT: Record<string, string> = {
  PDF:   ".pdf",
  EPUB:  ".epub",
  AUDIO: ".mp3,.wav,.ogg,.m4a,.aac,.flac",
};

async function uploadFile(file: File, category: string): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", category);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const { url } = await res.json();
  return url as string;
}

interface EbookFormProps {
  prefilledBookId?: string;
  initial?: {
    id: string; title: string; titleKm?: string; description?: string;
    ebookType: string; fileUrl: string; coverImage?: string;
    language?: string; publishYear?: number;
    categoryId?: string; authorId?: string; isPublic: boolean;
    bookId?: string;
  };
}

export default function EbookForm({ initial, prefilledBookId }: EbookFormProps) {
  const t  = useTranslations("ebooks");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [authors,    setAuthors]    = useState<Author[]>([]);
  const [books,      setBooks]      = useState<Book[]>([]);
  const [bookSearch, setBookSearch] = useState("");

  const [form, setForm] = useState({
    title:       initial?.title       ?? "",
    titleKm:     initial?.titleKm     ?? "",
    description: initial?.description ?? "",
    ebookType:   initial?.ebookType   ?? "PDF",
    fileUrl:     initial?.fileUrl     ?? "",
    coverImage:  initial?.coverImage  ?? "",
    language:    initial?.language    ?? "en",
    publishYear: initial?.publishYear ?? ("" as number | ""),
    categoryId:  initial?.categoryId  ?? "",
    authorId:    initial?.authorId    ?? "",
    isPublic:    initial?.isPublic    ?? true,
    bookId:      initial?.bookId      ?? prefilledBookId ?? "",
  });

  const [saving,          setSaving]         = useState(false);
  const [error,           setError]          = useState("");
  const [fileUploading,   setFileUploading]  = useState(false);
  const [coverUploading,  setCoverUploading] = useState(false);
  const [coverPreview,    setCoverPreview]   = useState(initial?.coverImage ?? "");

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/authors").then((r)    => r.json()),
      fetch("/api/books?limit=500").then((r) => r.json()),
    ]).then(([cats, auths, bks]) => {
      setCategories(cats);
      setAuthors(auths);
      setBooks(bks);
    });
  }, []);

  async function handleFileUpload(file: File) {
    setFileUploading(true);
    const category = form.ebookType.toLowerCase() as string;
    const url = await uploadFile(file, category === "audio" ? "audio" : category === "epub" ? "epub" : "pdf");
    setFileUploading(false);
    if (url) setForm((f) => ({ ...f, fileUrl: url }));
  }

  async function handleCoverUpload(file: File) {
    setCoverUploading(true);
    const url = await uploadFile(file, "image");
    setCoverUploading(false);
    if (url) {
      setForm((f) => ({ ...f, coverImage: url }));
      setCoverPreview(url);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      publishYear: form.publishYear !== "" ? Number(form.publishYear) : undefined,
      categoryId:  form.categoryId  || undefined,
      authorId:    form.authorId    || undefined,
      bookId:      form.bookId      || undefined,
      titleKm:     form.titleKm     || undefined,
      coverImage:  form.coverImage  || undefined,
      description: form.description || undefined,
    };

    const url    = initial ? `/api/ebooks/${initial.id}` : "/api/ebooks";
    const method = initial ? "PATCH" : "POST";
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    setSaving(false);
    if (res.ok) {
      router.push(`/${locale}/admin/ebooks`);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error?.message ?? JSON.stringify(data.error) ?? "Error saving ebook");
    }
  }

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

  const filteredBooks = bookSearch.trim()
    ? books.filter((b) => b.title.toLowerCase().includes(bookSearch.toLowerCase()) || (b.isbn ?? "").includes(bookSearch))
    : books;

  const linkedBook = books.find((b) => b.id === form.bookId);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* Type selector */}
      <div>
        <p className={labelCls}>{t("ebookType")}</p>
        <div className="grid grid-cols-5 gap-2">
          {(["PDF", "EPUB", "LINK", "VIDEO", "AUDIO"] as const).map((type) => (
            <button key={type} type="button"
              onClick={() => setForm((f) => ({ ...f, ebookType: type, fileUrl: "" }))}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                form.ebookType === type
                  ? TYPE_COLORS[type] + " scale-105 shadow-sm"
                  : "border-gray-200 text-gray-400 hover:border-gray-300"
              }`}>
              {TYPE_ICONS[type]}
              {t(type.toLowerCase() as "pdf" | "epub" | "link" | "video" | "audio")}
            </button>
          ))}
        </div>
      </div>

      {/* Titles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ebook-title" className={labelCls}>{t("ebookTitle")} (EN) *</label>
          <input id="ebook-title" type="text" value={form.title} onChange={set("title")} required className={inputCls} />
        </div>
        <div>
          <label htmlFor="ebook-title-km" className={labelCls}>ចំណងជើង (ខ្មែរ)</label>
          <input id="ebook-title-km" type="text" value={form.titleKm} onChange={set("titleKm")} className={inputCls} />
        </div>
      </div>

      {/* File — upload or URL */}
      <div>
        <p className={labelCls}>
          {t("fileUrl")} *
          <span className="ml-2 text-xs text-gray-400 font-normal">{t(TYPE_HINT_KEYS[form.ebookType])}</span>
        </p>

        {UPLOADABLE.includes(form.ebookType) ? (
          <div className="space-y-2">
            {/* Upload zone */}
            <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Upload className="w-5 h-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  {fileUploading ? t("uploading") : t("uploadFile", { type: form.ebookType })}
                </p>
                <p className="text-xs text-gray-400">
                  {FILE_ACCEPT[form.ebookType]} · {t("maxSize")}
                </p>
              </div>
              <input type="file" className="hidden" accept={FILE_ACCEPT[form.ebookType]}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
            </label>

            {/* URL override — type="text" so /uploads/... paths from the uploader are also accepted */}
            <div className="relative">
              <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" value={form.fileUrl} onChange={set("fileUrl")}
                placeholder={t("pasteUrl")}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {form.fileUrl && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                <span className="truncate flex-1">{form.fileUrl}</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, fileUrl: "" }))}
                  className="flex-shrink-0 text-green-500 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* VIDEO / LINK — URL only */
          <div className="relative">
            <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="url" value={form.fileUrl} onChange={set("fileUrl")} required
              placeholder="https://…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}
      </div>

      {/* Cover image */}
      <div>
        <p className={labelCls}>{t("coverImage")}</p>
        <div className="flex gap-3 items-start">
          {/* Upload zone */}
          <label className="flex-shrink-0 flex flex-col items-center justify-center w-24 h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors relative overflow-hidden">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <>
                <ImageIcon className="w-6 h-6 text-gray-300 mb-1" />
                <span className="text-xs text-gray-400 text-center px-1">
                  {coverUploading ? t("uploading") : t("uploadCover")}
                </span>
              </>
            )}
            <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }} />
          </label>

          <div className="flex-1 space-y-2">
            <input type="text" value={form.coverImage}
              onChange={(e) => { setForm((f) => ({ ...f, coverImage: e.target.value })); setCoverPreview(e.target.value); }}
              placeholder={t("pasteImageUrl")}
              className={inputCls} />
            {coverPreview && (
              <button type="button" onClick={() => { setForm((f) => ({ ...f, coverImage: "" })); setCoverPreview(""); }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                <X className="w-3 h-3" /> {t("removeCover")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="ebook-desc" className={labelCls}>{t("description")}</label>
        <textarea id="ebook-desc" value={form.description} onChange={set("description")} rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className={labelCls}>{tc("language")}</p>
          <LanguageSelect
            value={form.language}
            onChange={(code) => setForm((f) => ({ ...f, language: code }))}
          />
        </div>
        <div>
          <label htmlFor="ebook-year" className={labelCls}>{t("year")}</label>
          <input id="ebook-year" type="number" value={form.publishYear} onChange={set("publishYear")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ebook-category" className={labelCls}>{t("category")}</label>
          <select id="ebook-category" value={form.categoryId} onChange={set("categoryId")} className={inputCls}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ebook-author" className={labelCls}>{t("author")}</label>
          <select id="ebook-author" value={form.authorId} onChange={set("authorId")} className={inputCls}>
            <option value="">— none —</option>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Link to physical book */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-500" />
          <p className="text-sm font-semibold text-gray-700">{t("linkToBook")}</p>
          <span className="text-xs text-gray-400">— {t("optional")}</span>
        </div>

        {linkedBook ? (
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2">
            <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm text-blue-800 flex-1 truncate">{linkedBook.title}</span>
            {linkedBook.isbn && <span className="text-xs text-blue-400 font-mono">{linkedBook.isbn}</span>}
            <button type="button" onClick={() => setForm((f) => ({ ...f, bookId: "" }))}
              className="text-blue-400 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" value={bookSearch} onChange={(e) => setBookSearch(e.target.value)}
                placeholder={t("searchBooks")}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {bookSearch && (
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-36 overflow-y-auto shadow-sm">
                {filteredBooks.slice(0, 12).map((b) => (
                  <button key={b.id} type="button"
                    onClick={() => { setForm((f) => ({ ...f, bookId: b.id })); setBookSearch(""); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2 transition-colors">
                    <BookOpen className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    <span className="flex-1 truncate">{b.title}</span>
                    {b.isbn && <span className="text-xs text-gray-400 font-mono flex-shrink-0">{b.isbn}</span>}
                  </button>
                ))}
                {filteredBooks.length === 0 && (
                  <p className="text-center text-gray-400 text-xs py-3">{t("noBooksFound")}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Download protection */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">{t("downloadProtection")}</p>
        <div className="flex flex-col gap-2">
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            form.isPublic ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
          }`}>
            <input type="radio" name="accessLevel" checked={!!form.isPublic}
              onChange={() => setForm((f) => ({ ...f, isPublic: true }))}
              className="mt-0.5 accent-green-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">{t("freeAccess")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t("freeAccessDesc")}</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            !form.isPublic ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
          }`}>
            <input type="radio" name="accessLevel" checked={!form.isPublic}
              onChange={() => setForm((f) => ({ ...f, isPublic: false }))}
              className="mt-0.5 accent-amber-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">{t("membersOnly")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t("membersOnlyDesc")}</p>
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={saving || fileUploading || coverUploading}
          className="bg-blue-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors disabled:opacity-60">
          {saving ? tc("loading") : tc("save")}
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
