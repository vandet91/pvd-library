"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ScanLine, X, Upload, ImageIcon, BookMarked, ExternalLink, Plus, Printer, RefreshCw, Loader2 } from "lucide-react";
import LanguageSelect from "@/components/shared/LanguageSelect";
import BarcodeDisplay from "@/components/admin/BarcodeDisplay";
import BookCopiesPanel from "@/components/admin/BookCopiesPanel";
import Link from "next/link";

interface Category  { id: string; name: string }
interface Author    { id: string; name: string }
interface Publisher { id: string; name: string }
interface Location  { id: string; name: string; description?: string | null }
interface LinkedEbook { id: string; title: string; ebookType: string; fileUrl: string }

const MATERIAL_TYPES = [
  "BOOK", "MAGAZINE", "JOURNAL", "NEWSPAPER", "DVD", "AUDIO_CD", "THESIS", "MAP", "OTHER",
] as const;

interface BookFormProps {
  initial?: {
    id: string;
    title: string; titleKm?: string; subtitle?: string; edition?: string;
    isbn?: string; barcode?: string | null;
    description?: string; coverImage?: string;
    publishYear?: number; pages?: number; language?: string;
    locationId?: string | null;
    totalCopies: number; price?: number | null;
    referenceOnly?: boolean;
    materialType?: string;
    categoryId?: string; authorId?: string; coAuthorIds?: string[]; publisherId?: string;
    ebooks?: LinkedEbook[];
  };
}

/** Shared upload helper — POSTs a file and returns the public URL */
async function uploadFile(file: File, category: string): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", category);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const { url } = await res.json();
  return url as string;
}

export default function BookForm({ initial }: BookFormProps) {
  const t  = useTranslations("books");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [authors,    setAuthors]    = useState<Author[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [locations,  setLocations]  = useState<Location[]>([]);
  const [scanning,   setScanning]   = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [form, setForm] = useState({
    title:       initial?.title       ?? "",
    titleKm:     initial?.titleKm     ?? "",
    subtitle:    initial?.subtitle    ?? "",
    edition:     initial?.edition     ?? "",
    isbn:        initial?.isbn        ?? "",
    description: initial?.description ?? "",
    coverImage:  initial?.coverImage  ?? "",
    publishYear: initial?.publishYear ?? ("" as number | ""),
    pages:       initial?.pages       ?? ("" as number | ""),
    language:     initial?.language     ?? "en",
    locationId:   initial?.locationId   ?? "",
    totalCopies:  initial?.totalCopies  ?? 1,
    price:        initial?.price        ?? ("" as number | ""),
    referenceOnly: initial?.referenceOnly ?? false,
    materialType: initial?.materialType ?? "BOOK",
    categoryId:  initial?.categoryId  ?? "",
    authorId:    initial?.authorId    ?? "",
    publisherId: initial?.publisherId ?? "",
  });
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>(initial?.coAuthorIds ?? []);

  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState("");
  const [coverUploading,  setCoverUploading]  = useState(false);
  const [coverPreview,    setCoverPreview]    = useState(initial?.coverImage ?? "");
  const [barcode,         setBarcode]         = useState<string | null>(initial?.barcode ?? null);
  const [genBusy,         setGenBusy]         = useState(false);
  const [genError,        setGenError]        = useState<string | null>(null);

  const linkedEbooks = initial?.ebooks ?? [];

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/authors").then((r)    => r.json()),
      fetch("/api/publishers").then((r) => r.json()),
      fetch("/api/locations").then((r)  => r.json()),
    ]).then(([cats, auths, pubs, locs]) => {
      setCategories(cats);
      setAuthors(auths);
      setPublishers(pubs);
      setLocations(locs);
    });
  }, []);

  async function handleCoverUpload(file: File) {
    setCoverUploading(true);
    const url = await uploadFile(file, "image");
    setCoverUploading(false);
    if (url) {
      setForm((f) => ({ ...f, coverImage: url }));
      setCoverPreview(url);
    }
  }

  async function startScan() {
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (result) {
            setForm((f) => ({ ...f, isbn: result.getText() }));
            stream.getTracks().forEach((t) => t.stop());
            setScanning(false);
          }
        });
      }
    } catch {
      setScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload: Record<string, unknown> = {
      ...form,
      publishYear: form.publishYear !== "" ? Number(form.publishYear) : undefined,
      pages:       form.pages       !== "" ? Number(form.pages)       : undefined,
      price:       form.price       !== "" ? Number(form.price)       : undefined,
      referenceOnly: !!form.referenceOnly,
      locationId:  form.locationId  || null,
      categoryId:  form.categoryId  || undefined,
      authorId:    form.authorId    || undefined,
      coAuthorIds: coAuthorIds.filter((id) => id && id !== form.authorId),
      publisherId: form.publisherId || undefined,
      coverImage:  form.coverImage  || undefined,
    };
    // totalCopies is only sent on CREATE (controls initial copy generation).
    // On EDIT, copies are the source of truth — managed via the Copies panel.
    if (initial) {
      delete payload.totalCopies;
    } else {
      payload.totalCopies = Number(form.totalCopies);
    }

    const url    = initial ? `/api/books/${initial.id}` : "/api/books";
    const method = initial ? "PATCH" : "POST";
    const res    = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    setSaving(false);
    if (res.ok) {
      router.push(`/${locale}/admin/books`);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error?.message ?? "Error saving book");
    }
  }

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* Titles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="book-title" className={labelCls}>{t("bookTitle")} *</label>
          <input id="book-title" type="text" value={form.title} onChange={set("title")} required className={inputCls} />
        </div>
        <div>
          <label htmlFor="book-title-km" className={labelCls}>ចំណងជើង (ខ្មែរ)</label>
          <input id="book-title-km" type="text" value={form.titleKm} onChange={set("titleKm")} className={inputCls} />
        </div>
      </div>

      {/* Subtitle + Edition */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="book-subtitle" className={labelCls}>{t("subtitle")}</label>
          <input id="book-subtitle" type="text" value={form.subtitle} onChange={set("subtitle")} className={inputCls}
            placeholder={t("subtitlePlaceholder")} />
        </div>
        <div>
          <label htmlFor="book-edition" className={labelCls}>{t("edition")}</label>
          <input id="book-edition" type="text" value={form.edition} onChange={set("edition")} className={inputCls}
            placeholder={t("editionPlaceholder")} />
        </div>
      </div>

      {/* ISBN + scan */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="book-isbn" className={labelCls}>{t("isbn")}</label>
          <input id="book-isbn" type="text" value={form.isbn} onChange={set("isbn")} className={inputCls} />
        </div>
        <div className="self-end">
          <button type="button" onClick={startScan}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            <ScanLine className="w-4 h-4" />{t("scanISBN")}
          </button>
        </div>
      </div>

      {/* System Barcode */}
      {initial?.id && (
        <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">{t("systemBarcode")}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t("systemBarcodeDesc")}
              </p>
            </div>
            <div className="flex gap-2">
              {!barcode && (
                <button
                  type="button"
                  disabled={genBusy}
                  onClick={async () => {
                    setGenBusy(true); setGenError(null);
                    try {
                      const res  = await fetch(`/api/books/${initial.id}/barcode`, { method: "POST" });
                      const data = await res.json() as { barcode?: string; error?: string };
                      if (data.barcode) {
                        setBarcode(data.barcode);
                      } else {
                        setGenError(data.error ?? `Server error (${res.status}) — check console`);
                      }
                    } catch {
                      setGenError("Network error — could not reach barcode API");
                    }
                    setGenBusy(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {t("generateBarcode")}
                </button>
              )}
              {barcode && (
                <Link
                  href={`/${locale}/admin/books/labels?ids=${initial.id}`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-white transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> {t("printLabel")}
                </Link>
              )}
            </div>
          </div>
          {barcode ? (
            <div className="flex items-center gap-4 bg-white rounded-lg p-3 border border-gray-100">
              <BarcodeDisplay value={barcode} height={50} fontSize={12} width={1.5} />
              <span className="text-sm font-mono text-gray-600">{barcode}</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">
              {t("noBarcode")}
            </p>
          )}
          {genError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              ⚠ {genError}
            </div>
          )}
        </div>
      )}

      {scanning && (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-sm">
          <video ref={videoRef} className="w-full h-full object-cover" />
          <button type="button" onClick={() => setScanning(false)}
            className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

          {/* URL paste */}
          <div className="flex-1 space-y-2">
            <input type="text" value={form.coverImage}
              onChange={(e) => { setForm((f) => ({ ...f, coverImage: e.target.value })); setCoverPreview(e.target.value); }}
              placeholder={t("pasteUrl")}
              className={inputCls} />
            {coverPreview && (
              <button type="button" onClick={() => { setForm((f) => ({ ...f, coverImage: "" })); setCoverPreview(""); }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                <X className="w-3 h-3" /> {t("removeCover")}
              </button>
            )}
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Upload className="w-3 h-3" /> {t("uploadHint")}
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="book-desc" className={labelCls}>{t("description")}</label>
        <textarea id="book-desc" value={form.description} onChange={set("description")} rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      {/* Primary Author + Category + Publisher */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="book-author" className={labelCls}>{t("primaryAuthor")} {t("author")}</label>
          <select id="book-author" value={form.authorId} onChange={set("authorId")} className={inputCls}>
            <option value="">— {t("author")} —</option>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="book-category" className={labelCls}>{t("category")}</label>
          <select id="book-category" value={form.categoryId} onChange={set("categoryId")} className={inputCls}>
            <option value="">— {t("category")} —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="book-publisher" className={labelCls}>{t("publisher")}</label>
          <select id="book-publisher" value={form.publisherId} onChange={set("publisherId")} className={inputCls}>
            <option value="">— {t("publisher")} —</option>
            {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Co-authors (multi-select) */}
      <div>
        <p className={labelCls}>{t("coAuthors")} <span className="text-gray-400 font-normal">{t("coAuthorsOptional")}</span></p>
        <div className="border border-gray-200 rounded-lg p-2 min-h-[44px] flex flex-wrap gap-1.5 bg-white">
          {coAuthorIds
            .filter((id) => id !== form.authorId)
            .map((id) => {
              const a = authors.find((x) => x.id === id);
              if (!a) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-md font-medium">
                  {a.name}
                  <button type="button"
                    onClick={() => setCoAuthorIds((prev) => prev.filter((x) => x !== id))}
                    className="text-indigo-400 hover:text-indigo-700">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              if (id === form.authorId) return; // skip if same as primary
              if (coAuthorIds.includes(id)) return; // skip duplicates
              setCoAuthorIds((prev) => [...prev, id]);
            }}
            className="text-xs border-0 focus:ring-0 bg-transparent text-gray-500 min-w-[140px] flex-1"
          >
            <option value="">{t("addCoAuthor")}</option>
            {authors
              .filter((a) => a.id !== form.authorId && !coAuthorIds.includes(a.id))
              .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">{t("coAuthorsHint")}</p>
      </div>

      {/* Year + Pages + Copies + Price */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="book-year" className={labelCls}>{t("publishYear")}</label>
          <input id="book-year" type="number" value={form.publishYear} onChange={set("publishYear")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="book-pages" className={labelCls}>{t("pages")}</label>
          <input id="book-pages" type="number" value={form.pages} onChange={set("pages")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="book-copies" className={labelCls}>
            {t("totalCopies")} {!initial && "*"}
            {initial && <span className="ml-1 text-[10px] text-gray-400 font-normal">{t("totalCopiesAuto")}</span>}
          </label>
          <input
            id="book-copies"
            type="number"
            value={form.totalCopies}
            onChange={set("totalCopies")}
            required={!initial}
            min={1}
            disabled={!!initial}
            className={inputCls + (initial ? " bg-gray-50 text-gray-500 cursor-not-allowed" : "")}
          />
          {initial && (
            <p className="text-[11px] text-gray-400 mt-1">{t("managedViaCopies")}</p>
          )}
        </div>
        <div>
          <label htmlFor="book-price" className={labelCls}>{t("priceUsd")}</label>
          <input id="book-price" type="number" value={form.price} onChange={set("price")}
            min={0} step={0.01} placeholder="0.00" className={inputCls} />
          <p className="text-[11px] text-gray-400 mt-1">{t("priceNote")}</p>
        </div>
      </div>

      {/* Reference-only flag — full-width toggle */}
      <div className="bg-amber-50/40 border border-amber-100 rounded-xl px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.referenceOnly}
            onChange={(e) => setForm((f) => ({ ...f, referenceOnly: e.target.checked }))}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-400 cursor-pointer"
          />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-800">{t("referenceOnly")}</span>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {t("referenceOnlyDesc")}
            </p>
          </div>
        </label>
      </div>

      {/* Material Type + Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="book-material" className={labelCls}>{t("materialType")}</label>
          <select id="book-material" value={form.materialType} onChange={set("materialType")} className={inputCls}>
            <option value="BOOK">{t("materialBook")}</option>
            <option value="MAGAZINE">{t("materialMagazine")}</option>
            <option value="JOURNAL">{t("materialJournal")}</option>
            <option value="NEWSPAPER">{t("materialNewspaper")}</option>
            <option value="DVD">{t("materialDvd")}</option>
            <option value="AUDIO_CD">{t("materialAudioCd")}</option>
            <option value="THESIS">{t("materialThesis")}</option>
            <option value="MAP">{t("materialMap")}</option>
            <option value="OTHER">{t("materialOther")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="book-location" className={labelCls}>{t("location")}</label>
          <select
            id="book-location"
            value={form.locationId}
            onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
            className={inputCls}
          >
            <option value="">{t("noLocation")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}{l.description ? ` — ${l.description}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            {locations.length > 0
              ? <Link href={`/${locale}/admin/taxonomy?tab=locations`} className="text-blue-500 hover:underline">{t("manageLocations")}</Link>
              : <Link href={`/${locale}/admin/taxonomy?tab=locations`} className="text-blue-600 hover:underline">{t("addLocations")}</Link>}
          </p>
        </div>
      </div>

      {/* Language */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className={labelCls}>{t("language")}</p>
          <LanguageSelect
            value={form.language}
            onChange={(code) => setForm((f) => ({ ...f, language: code }))}
          />
        </div>
      </div>

      {/* Physical copies (edit mode only) */}
      {initial && <BookCopiesPanel bookId={initial.id} />}

      {/* Linked ebooks (edit mode only) */}
      {initial && (
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-blue-500" />
              {t("digitalVersions")}
            </h3>
            <Link href={`/${locale}/admin/ebooks/new?bookId=${initial.id}`}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t("linkEbook")}
            </Link>
          </div>
          {linkedEbooks.length === 0 ? (
            <p className="text-xs text-gray-400">{t("noEbooks")}</p>
          ) : (
            <div className="space-y-2">
              {linkedEbooks.map((eb) => (
                <div key={eb.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    eb.ebookType === "PDF"   ? "bg-red-50 text-red-600" :
                    eb.ebookType === "EPUB"  ? "bg-blue-50 text-blue-600" :
                    eb.ebookType === "VIDEO" ? "bg-violet-50 text-violet-600" :
                    eb.ebookType === "AUDIO" ? "bg-emerald-50 text-emerald-600" :
                    "bg-gray-100 text-gray-600"
                  }`}>{eb.ebookType}</span>
                  <span className="text-sm text-gray-700 flex-1 truncate">{eb.title}</span>
                  <a href={eb.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-600 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <Link href={`/${locale}/admin/ebooks/${eb.id}`}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors">Edit</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving || coverUploading}
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
