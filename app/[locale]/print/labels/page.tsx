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
  location:      string | null;
  shelfLocation?: { name: string } | null;
  author:        { name: string } | null;
  /** Set when this label represents a specific copy (not just the title) */
  copyNumber?: number;
}

interface CopyApiRow {
  id:         string;
  copyNumber: number;
  barcode:    string | null;
  book: {
    id: string; title: string; isbn: string | null; location: string | null;
    shelfLocation?: { name: string } | null;
    author: { name: string } | null;
  };
}

/* ── Single label — renders its own barcode SVG ──────────────── */
function Label({ book, width, height, size }: {
  book:   BookLabel;
  width:  number;
  height: number;
  size:   "small" | "medium" | "large";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const code   = book.barcode ?? book.isbn ?? "";

  useEffect(() => {
    if (!svgRef.current || !code) return;
    try {
      JsBarcode(svgRef.current, code, {
        format:       "CODE128",
        width:        size === "small" ? 1 : size === "medium" ? 1.5 : 2,
        height:       size === "small" ? 30 : size === "medium" ? 46 : 64,
        fontSize:     size === "small" ? 9 : 11,
        margin:       3,
        displayValue: true,
        font:         "monospace",
      });
    } catch { /* invalid barcode value — skip */ }
  }, [code, size]);

  const titleSize = size === "small" ? "8px" : "9px";
  const subSize   = "7px";

  return (
    <div
      style={{
        width,
        height,
        border:         "1px solid #ccc",
        borderRadius:   "3px",
        padding:        "4px",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "space-between",
        overflow:       "hidden",
        background:     "#fff",
        boxSizing:      "border-box",
        pageBreakInside: "avoid",
      }}
    >
      {code ? (
        <>
          <svg ref={svgRef} style={{ width: "100%", maxHeight: height * 0.65 }} />
          <p style={{ margin: 0, fontSize: titleSize, textAlign: "center", lineHeight: 1.2,
            overflow: "hidden", maxHeight: "2.4em", fontFamily: "sans-serif", color: "#222", width: "100%" }}>
            {book.title}
          </p>
          <div style={{ display: "flex", gap: "4px", alignItems: "center", justifyContent: "center" }}>
            {book.copyNumber !== undefined && (
              <span style={{ fontSize: subSize, color: "#4f46e5", fontFamily: "sans-serif", fontWeight: 600 }}>
                Copy #{book.copyNumber}
              </span>
            )}
            {(book.shelfLocation?.name ?? book.location) && (
              <span style={{ fontSize: subSize, color: "#888", fontFamily: "sans-serif" }}>
                · {book.shelfLocation?.name ?? book.location}
              </span>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", color: "#aaa", fontSize: subSize, textAlign: "center" }}>
          <span style={{ fontSize: "18px", marginBottom: "2px" }}>⬜</span>
          No barcode
          <span style={{ fontSize: subSize, color: "#bbb", marginTop: "2px" }}>{book.title}</span>
        </div>
      )}
    </div>
  );
}

/* ── Label size definitions (px at 96dpi, ~mm at print) ──────── */
const SIZES = {
  small:  { label: "Small  (38×21mm)",  w: 144, h:  80, cols: 5 },
  medium: { label: "Medium (63×38mm)",  w: 238, h: 144, cols: 3 },
  large:  { label: "Large  (99×57mm)",  w: 374, h: 216, cols: 2 },
} as const;
type SizeKey = keyof typeof SIZES;

/* ── Main page ───────────────────────────────────────────────── */
export default function PrintLabelsPage() {
  const searchParams = useSearchParams();
  const idsParam       = searchParams.get("ids")     ?? "";
  const copyIdsParam   = searchParams.get("copyIds") ?? "";
  const sizeParam      = (searchParams.get("size") ?? "medium") as SizeKey;
  const copiesParam    = parseInt(searchParams.get("copies") ?? "1", 10) || 1;

  const [books,   setBooks]   = useState<BookLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [size,    setSize]    = useState<SizeKey>(sizeParam in SIZES ? sizeParam : "medium");
  const [copies,  setCopies]  = useState(copiesParam);
  const [printed, setPrinted] = useState(false);

  /* Fetch books OR specific copies */
  useEffect(() => {
    // Copy mode — fetch from /api/copies and map to BookLabel format
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
              id:         c!.id,
              title:      c!.book.title,
              barcode:    c!.barcode,           // ← uses COPY's barcode, not the book's
              isbn:       c!.book.isbn,
              location:      c!.book.location,
            shelfLocation: c!.book.shelfLocation,
              author:     c!.book.author,
              copyNumber: c!.copyNumber,
            } as BookLabel));
          setBooks(ordered);
        })
        .catch(() => setBooks([]))
        .finally(() => setLoading(false));
      return;
    }

    // Book mode (legacy) — fetch from /api/books
    if (!idsParam) { setLoading(false); return; }
    const ids = idsParam.split(",").filter(Boolean);
    fetch(`/api/books?limit=2000`)
      .then((r) => r.json())
      .then((data: BookLabel[]) => {
        const map = new Map(data.map((b) => [b.id, b]));
        setBooks(ids.map((id) => map.get(id)).filter(Boolean) as BookLabel[]);
      })
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, [idsParam, copyIdsParam]);

  /* Auto-print after barcodes have rendered */
  useEffect(() => {
    if (loading || books.length === 0 || printed) return;
    /* small delay to let JsBarcode SVGs render */
    const timer = setTimeout(() => {
      window.print();
      setPrinted(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [loading, books, printed]);

  const s      = SIZES[size];
  const labels = books.flatMap((b) => Array(copies).fill(b) as BookLabel[]);

  /* ── Settings toolbar (hidden on print) ── */
  const toolbar = (
    <div className="no-print" style={{
      padding: "12px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
      display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
      fontFamily: "sans-serif", fontSize: "13px",
    }}>
      <strong style={{ color: "#374151" }}>🖨 Barcode Labels</strong>
      <span style={{ color: "#6b7280" }}>{books.length} book{books.length !== 1 ? "s" : ""} · {labels.length} label{labels.length !== 1 ? "s" : ""}</span>

      <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#374151" }}>
        Size:
        <select value={size} onChange={(e) => { setSize(e.target.value as SizeKey); setPrinted(false); }}
          style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px" }}>
          {(Object.entries(SIZES) as [SizeKey, typeof SIZES[SizeKey]][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#374151" }}>
        Copies:
        <input type="number" min={1} max={10} value={copies}
          onChange={(e) => { setCopies(Math.max(1, parseInt(e.target.value) || 1)); setPrinted(false); }}
          style={{ width: "56px", padding: "4px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px" }} />
      </label>

      <button onClick={() => { setPrinted(false); setTimeout(() => window.print(), 200); }}
        style={{ marginLeft: "auto", padding: "6px 16px", background: "#4f46e5", color: "#fff",
          border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
        🖨 Print
      </button>

      <button onClick={() => window.close()}
        style={{ padding: "6px 12px", background: "#f3f4f6", color: "#374151",
          border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}>
        ✕ Close
      </button>
    </div>
  );

  if (loading) {
    return (
      <>
        {toolbar}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
          height: "200px", fontFamily: "sans-serif", color: "#9ca3af", gap: "8px" }}>
          <span>Loading labels…</span>
        </div>
      </>
    );
  }

  if (books.length === 0) {
    return (
      <>
        {toolbar}
        <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "sans-serif", color: "#6b7280" }}>
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
          <Label key={`${book.id}-${i}`} book={book} width={s.w} height={s.h} size={size} />
        ))}
      </div>

      {/* Print CSS — inline so it works in the new tab */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          #label-sheet {
            padding: 0;
            gap: 2px;
          }
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
