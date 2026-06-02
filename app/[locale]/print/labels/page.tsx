"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";

/* ── Types ───────────────────────────────────────────────────── */
interface BookLabel {
  id:            string;
  title:         string;
  barcode:       string | null;
  isbn:          string | null;
  callNumber:    string | null;
  location:      string | null;
  shelfLocation?: { name: string } | null;
  author:        { name: string } | null;
  copyNumber?:   number;
}

interface CopyApiRow {
  id:         string;
  copyNumber: number;
  barcode:    string | null;
  book: {
    id: string; title: string; isbn: string | null; callNumber: string | null; location: string | null;
    shelfLocation?: { name: string } | null;
    author: { name: string } | null;
  };
}

const LABEL_FONT = "'Noto Sans Khmer', 'Noto Sans', sans-serif";
const MONO_FONT  = "'Noto Sans Khmer', monospace";

type FontScale = "xs" | "sm" | "md" | "lg" | "xl";

const FONT_SCALE: Record<FontScale, { label: string; mult: number }> = {
  xs: { label: "XS",     mult: 0.75 },
  sm: { label: "Small",  mult: 0.88 },
  md: { label: "Normal", mult: 1.00 },
  lg: { label: "Large",  mult: 1.20 },
  xl: { label: "XL",     mult: 1.45 },
};

interface LabelSettings {
  showTitle:      boolean;
  showCopyNumber: boolean;
  showLocation:   boolean;
  showAuthor:     boolean;
  showIsbn:       boolean;
  fontScale:      FontScale;
}

const DEFAULT_SETTINGS: LabelSettings = {
  showTitle:      true,
  showCopyNumber: true,
  showLocation:   true,
  showAuthor:     false,
  showIsbn:       false,
  fontScale:      "md",
};

/* ── Persist settings in localStorage ───────────────────────── */
const LS_KEY = "pvd_label_settings";
function loadSettings(): LabelSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
function saveSettings(s: LabelSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ── Single label ────────────────────────────────────────────── */
function Label({ book, width, height, size, settings }: {
  book:     BookLabel;
  width:    number;
  height:   number;
  size:     "small" | "medium" | "large";
  settings: LabelSettings;
}) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const code        = book.barcode ?? book.isbn ?? "";

  const mult      = FONT_SCALE[settings.fontScale ?? "md"].mult;
  const titleBase = size === "small" ? 9  : size === "medium" ? 11 : 13;
  const subBase   = size === "small" ? 8  : size === "medium" ? 10 : 12;
  const titleSize = `${Math.round(titleBase * mult)}px`;
  const subSize   = `${Math.round(subBase   * mult)}px`;

  // Which text lines are visible — drives barcode re-render height
  const hasTitle  = settings.showTitle;
  const hasAuthor = settings.showAuthor && !!book.author?.name;
  const hasCopy   = settings.showCopyNumber && book.copyNumber !== undefined;
  const hasLoc    = settings.showLocation && !!(book.shelfLocation?.name ?? book.callNumber ?? book.location);
  const hasIsbn   = settings.showIsbn && !!book.isbn;
  const hasSubLine = hasCopy || hasLoc || hasIsbn;

  // Estimate pixels consumed by the text section so we can size the barcode optimally
  const lhBase    = size === "small" ? 13 : size === "medium" ? 15 : 18;
  const lh        = Math.round(lhBase * mult);
  const textPx    = (hasTitle  ? lh + 1 : 0)
                  + (hasAuthor ? lh + 1 : 0)
                  + (hasSubLine? lh + 1 : 0);
  const padding   = 10; // total vertical padding inside label
  const barcodeH  = Math.max(16, height - textPx - padding);

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      JsBarcode(svgRef.current, code, {
        format:       "CODE128",
        width:        size === "small" ? 1 : size === "medium" ? 1.5 : 2,
        height:       Math.max(14, barcodeH * 0.78), // bar height (excl. text line below bar)
        fontSize:     Math.round((size === "small" ? 10 : size === "medium" ? 12 : 14) * mult),
        margin:       2,
        displayValue: true,
        font:         "monospace",
      });
      // Force the SVG to fill its container regardless of barcode content width.
      // Without this, shorter barcodes (no prefix) scale taller due to aspect-ratio preservation.
      svgRef.current.setAttribute("preserveAspectRatio", "none");
    } catch { /* invalid barcode — skip */ }
  }, [code, size, barcodeH]);

  return (
    <div
      style={{
        width,
        height,
        border:          "1px solid #ccc",
        borderRadius:    "3px",
        padding:         "4px 4px 3px",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        overflow:        "hidden",
        background:      "#fff",
        boxSizing:       "border-box",
        pageBreakInside: "avoid",
        gap:             "1px",
      }}
    >
      {code ? (
        <>
          {/* ── Barcode — flex grows to fill whatever space text doesn't need ── */}
          <div
            ref={wrapperRef}
            style={{
              flex:           "1 1 0",
              minHeight:      0,
              width:          "100%",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              overflow:       "hidden",
            }}
          >
            {/* CSS width/height override JsBarcode's HTML attributes */}
            <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>

          {/* ── Text section — shrinks/expands based on visible fields ── */}
          {(hasTitle || hasAuthor || hasSubLine) && (
            <div style={{
              flex:          "0 0 auto",
              width:         "100%",
              display:       "flex",
              flexDirection: "column",
              alignItems:    "center",
              gap:           "1px",
            }}>
              {hasTitle && (
                <p style={{
                  margin: 0, fontSize: titleSize, textAlign: "center",
                  lineHeight: 1.2, overflow: "hidden", maxHeight: `${lh * 2}px`,
                  fontFamily: LABEL_FONT, color: "#111", width: "100%", fontWeight: 600,
                }}>
                  {book.title}
                </p>
              )}

              {hasAuthor && (
                <p style={{
                  margin: 0, fontSize: subSize, textAlign: "center", color: "#555",
                  fontFamily: LABEL_FONT, overflow: "hidden", whiteSpace: "nowrap",
                  maxWidth: "100%", textOverflow: "ellipsis",
                }}>
                  {book.author!.name}
                </p>
              )}

              {hasSubLine && (
                <div style={{
                  display: "flex", gap: "3px", alignItems: "center",
                  justifyContent: "center", flexWrap: "wrap",
                }}>
                  {hasCopy && (
                    <span style={{ fontSize: subSize, color: "#4f46e5", fontFamily: LABEL_FONT, fontWeight: 700 }}>
                      #{book.copyNumber}
                    </span>
                  )}
                  {hasLoc && (
                    <span style={{ fontSize: subSize, color: "#666", fontFamily: LABEL_FONT }}>
                      {hasCopy ? "· " : ""}{book.shelfLocation?.name ?? book.callNumber ?? book.location}
                    </span>
                  )}
                  {hasIsbn && (
                    <span style={{ fontSize: subSize, color: "#999", fontFamily: MONO_FONT }}>
                      {(hasCopy || hasLoc) ? "· " : ""}{book.isbn}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", color: "#aaa", fontSize: subSize, textAlign: "center",
        }}>
          <span style={{ fontSize: "18px", marginBottom: "2px" }}>⬜</span>
          No barcode
          {settings.showTitle && (
            <span style={{ fontSize: subSize, color: "#bbb", marginTop: "2px" }}>{book.title}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Label size definitions ──────────────────────────────────── */
const SIZES = {
  small:  { label: "Small  (38×21mm)",  w: 144, h:  80, cols: 5 },
  medium: { label: "Medium (63×38mm)",  w: 238, h: 144, cols: 3 },
  large:  { label: "Large  (99×57mm)",  w: 374, h: 216, cols: 2 },
} as const;
type SizeKey = keyof typeof SIZES;

/* ── Checkbox helper ─────────────────────────────────────────── */
function SettingToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "5px",
      color: "#374151", cursor: "pointer", userSelect: "none", fontSize: "12px" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: "14px", height: "14px", accentColor: "#4f46e5", cursor: "pointer" }}
      />
      {label}
    </label>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
export default function PrintLabelsPage() {
  const searchParams = useSearchParams();
  const idsParam     = searchParams.get("ids")     ?? "";
  const copyIdsParam = searchParams.get("copyIds") ?? "";
  const filterParam  = searchParams.get("filter")  ?? "";
  const sizeParam    = (searchParams.get("size") ?? "medium") as SizeKey;
  const copiesParam  = parseInt(searchParams.get("copies") ?? "1", 10) || 1;

  const [books,    setBooks]    = useState<BookLabel[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [size,     setSize]     = useState<SizeKey>(sizeParam in SIZES ? sizeParam : "medium");
  const [copies,   setCopies]   = useState(copiesParam);
  const [settings, setSettings] = useState<LabelSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // Load persisted settings once on mount
  useEffect(() => { setSettings(loadSettings()); }, []);

  function setSetting<K extends keyof LabelSettings>(key: K, value: LabelSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }

  /* Fetch books OR specific copies */
  useEffect(() => {
    if (copyIdsParam) {
      const ids = copyIdsParam.split(",").filter(Boolean);
      fetch(`/api/copies?ids=${encodeURIComponent(copyIdsParam)}`)
        .then((r) => r.json())
        .then((data: CopyApiRow[]) => {
          const map = new Map(data.map((c) => [c.id, c]));
          const ordered = ids
            .map((id) => map.get(id))
            .filter(Boolean)
            .map((c) => ({
              id:            c!.id,
              title:         c!.book.title,
              barcode:       c!.barcode,
              isbn:          c!.book.isbn,
              callNumber:    c!.book.callNumber,
              location:      c!.book.location,
              shelfLocation: c!.book.shelfLocation,
              author:        c!.book.author,
              copyNumber:    c!.copyNumber,
            } as BookLabel));
          setBooks(ordered);
        })
        .catch(() => setBooks([]))
        .finally(() => setLoading(false));
      return;
    }

    if (filterParam === "barcoded") {
      fetch(`/api/books?limit=50000`)
        .then((r) => r.json())
        .then((data: BookLabel[]) => {
          const list: BookLabel[] = Array.isArray(data) ? data : (data as { books?: BookLabel[] }).books ?? [];
          setBooks(list.filter((b) => b.barcode));
        })
        .catch(() => setBooks([]))
        .finally(() => setLoading(false));
      return;
    }

    if (!idsParam) { setLoading(false); return; }
    const ids = idsParam.split(",").filter(Boolean);
    fetch(`/api/books?limit=50000`)
      .then((r) => r.json())
      .then((data: BookLabel[]) => {
        const map = new Map(data.map((b) => [b.id, b]));
        setBooks(ids.map((id) => map.get(id)).filter(Boolean) as BookLabel[]);
      })
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, [idsParam, copyIdsParam, filterParam]);

  const s      = SIZES[size];
  const labels = books.flatMap((b) => Array(copies).fill(b) as BookLabel[]);

  /* ── Toolbar ── */
  const toolbar = (
    <div className="no-print" style={{
      fontFamily: LABEL_FONT, fontSize: "13px", background: "#f9fafb",
      borderBottom: "1px solid #e5e7eb",
    }}>
      {/* Main row */}
      <div style={{
        padding: "10px 16px", display: "flex", alignItems: "center",
        gap: "14px", flexWrap: "wrap",
      }}>
        <strong style={{ color: "#374151" }}>🖨 Barcode Labels</strong>
        <span style={{ color: "#6b7280" }}>
          {books.length} book{books.length !== 1 ? "s" : ""} · {labels.length} label{labels.length !== 1 ? "s" : ""}
        </span>

        {/* Size */}
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#374151" }}>
          Size:
          <select value={size} onChange={(e) => setSize(e.target.value as SizeKey)}
            style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px" }}>
            {(Object.entries(SIZES) as [SizeKey, typeof SIZES[SizeKey]][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>

        {/* Copies per label */}
        <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#374151" }}>
          Copies:
          <input type="number" min={1} max={10} value={copies}
            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: "52px", padding: "4px 8px", borderRadius: "6px",
              border: "1px solid #d1d5db", fontSize: "12px" }} />
        </label>

        {/* Label fields toggle */}
        <button
          onClick={() => setShowSettings((v) => !v)}
          style={{
            padding: "5px 12px", borderRadius: "7px", cursor: "pointer", fontSize: "12px",
            border: showSettings ? "1px solid #4f46e5" : "1px solid #d1d5db",
            background: showSettings ? "#eef2ff" : "#fff",
            color: showSettings ? "#4338ca" : "#374151",
            fontWeight: showSettings ? 600 : 400,
          }}
        >
          ⚙ Label Fields {showSettings ? "▲" : "▼"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => setTimeout(() => window.print(), 200)}
            style={{ padding: "6px 16px", background: "#4f46e5", color: "#fff",
              border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
            🖨 Print
          </button>
          <button onClick={() => window.close()}
            style={{ padding: "6px 12px", background: "#f3f4f6", color: "#374151",
              border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Expandable settings panel ── */}
      {showSettings && (
        <div style={{
          padding: "10px 16px 14px",
          borderTop: "1px solid #e5e7eb",
          background: "#fff",
          display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start",
        }}>
          <div>
            <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" }}>
              Show on label
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <SettingToggle label="Title"            checked={settings.showTitle}      onChange={(v) => setSetting("showTitle",      v)} />
              <SettingToggle label="Author"           checked={settings.showAuthor}     onChange={(v) => setSetting("showAuthor",     v)} />
              <SettingToggle label="Copy number"      checked={settings.showCopyNumber} onChange={(v) => setSetting("showCopyNumber", v)} />
              <SettingToggle label="Location / shelf" checked={settings.showLocation}   onChange={(v) => setSetting("showLocation",   v)} />
              <SettingToggle label="ISBN"             checked={settings.showIsbn}       onChange={(v) => setSetting("showIsbn",       v)} />
            </div>
          </div>

          {/* Font size */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" }}>
              Font size
            </p>
            <div style={{ display: "flex", gap: "4px" }}>
              {(Object.entries(FONT_SCALE) as [FontScale, { label: string; mult: number }][]).map(([key, { label }]) => {
                const active = (settings.fontScale ?? "md") === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSetting("fontScale", key)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: active ? "2px solid #4f46e5" : "1px solid #d1d5db",
                      background: active ? "#eef2ff" : "#fff",
                      color: active ? "#4338ca" : "#374151",
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      fontSize: "12px",
                      minWidth: "40px",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live preview of a single label */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280" }}>
              Preview
            </p>
            {books[0] && (
              <Label book={books[0]} width={s.w * 0.7} height={s.h * 0.7} size={size} settings={settings} />
            )}
          </div>

          <div style={{ marginLeft: "auto", alignSelf: "flex-end" }}>
            <button
              onClick={() => {
                setSettings({ ...DEFAULT_SETTINGS });
                saveSettings(DEFAULT_SETTINGS);
              }}
              style={{ fontSize: "11px", color: "#9ca3af", background: "none",
                border: "1px solid #e5e7eb", borderRadius: "6px",
                padding: "4px 10px", cursor: "pointer" }}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <>
        {toolbar}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
          height: "200px", fontFamily: LABEL_FONT, color: "#9ca3af", gap: "8px" }}>
          <span>Loading labels…</span>
        </div>
      </>
    );
  }

  if (books.length === 0) {
    return (
      <>
        {toolbar}
        <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: LABEL_FONT, color: "#6b7280" }}>
          <p>No books found. Select books from the books list and try again.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}

      {/* Label grid */}
      <div id="label-sheet" style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${s.cols}, ${s.w}px)`,
        gap:                 "4px",
        padding:             "8px",
        background:          "#fff",
      }}>
        {labels.map((book, i) => (
          <Label key={`${book.id}-${i}`} book={book} width={s.w} height={s.h} size={size} settings={settings} />
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap');
        body { font-family: 'Noto Sans Khmer', 'Noto Sans', sans-serif; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          #label-sheet { padding: 0; gap: 2px; }
          @page { margin: 6mm; size: A4; }
        }
        @media screen {
          body { background: #f3f4f6; }
          #label-sheet { background: white; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin: 12px auto; width: fit-content; }
        }
      `}</style>
    </>
  );
}
