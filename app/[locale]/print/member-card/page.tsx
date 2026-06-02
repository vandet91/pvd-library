"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";
import { BookOpen } from "lucide-react";
import { useLibraryName } from "@/context/library-name";

interface MemberCard {
  id: string;
  memberId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  memberType: string;
  expireDate?: string | null;
  isActive: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  STAFF:   "Staff",
  PUBLIC:  "Public",
};

const TYPE_COLOR: Record<string, string> = {
  STUDENT: "#1d4ed8",
  TEACHER: "#059669",
  STAFF:   "#7c3aed",
  PUBLIC:  "#d97706",
};

export default function MemberCardPage() {
  const searchParams = useSearchParams();
  const id           = searchParams.get("id");
  const libraryName  = useLibraryName();

  const [members, setMembers] = useState<MemberCard[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setError("No member ID provided"); setLoading(false); return; }

    // Support comma-separated list of member IDs for batch printing
    const ids = id.split(",").map((s) => s.trim()).filter(Boolean);
    Promise.all(
      ids.map((mid) =>
        fetch(`/api/members/${mid}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((results) => {
      const valid = results.filter(Boolean) as MemberCard[];
      if (valid.length === 0) setError("Member not found");
      else setMembers(valid);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading…</div>;
  if (error)   return <div className="flex items-center justify-center min-h-screen text-red-500">{error}</div>;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @page { size: 85.6mm 54mm; margin: 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .card-wrapper { page-break-after: always; }
        }
      `}</style>

      {/* Print button (hidden when printing) */}
      <div className="no-print flex items-center justify-center gap-3 p-4 bg-gray-100 min-h-screen flex-col">
        <p className="text-sm text-gray-500">Preview — {members.length} card(s)</p>
        <button
          onClick={() => window.print()}
          className="bg-blue-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-800 transition-colors"
        >
          Print Card{members.length > 1 ? "s" : ""}
        </button>

        <div className="flex flex-wrap gap-6 justify-center mt-4">
          {members.map((m) => <CardPreview key={m.id} member={m} />)}
        </div>
      </div>

      {/* Print target */}
      <div className="print-only hidden print:block">
        {members.map((m) => (
          <div key={m.id} className="card-wrapper">
            <CardPreview member={m} />
          </div>
        ))}
      </div>
    </>
  );
}

function CardPreview({ member }: { member: MemberCard }) {
  const barcodeRef  = useRef<SVGSVGElement>(null);
  const libraryName = useLibraryName();
  const color = TYPE_COLOR[member.memberType] ?? "#1d4ed8";

  useEffect(() => {
    if (barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, member.memberId, {
          format:      "CODE128",
          width:       1.5,
          height:      32,
          displayValue: true,
          fontSize:    9,
          textMargin:  2,
          margin:      0,
          background:  "transparent",
        });
      } catch {
        // ignore barcode errors
      }
    }
  }, [member.memberId]);

  const expireLabel = member.expireDate
    ? new Date(member.expireDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    /* CR80 card size: 85.6 × 54 mm */
    <div
      style={{
        width: "85.6mm", height: "54mm",
        background: "#fff",
        border: `3px solid ${color}`,
        borderRadius: "4mm",
        overflow: "hidden",
        fontFamily: "sans-serif",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* Colour header strip */}
      <div style={{ background: color, height: "13mm", display: "flex", alignItems: "center", padding: "0 4mm", gap: "2mm" }}>
        <BookOpen style={{ color: "#fff", width: 16, height: 16, flexShrink: 0 }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: "10pt", flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {libraryName}
        </span>
        <span style={{
          background: "rgba(255,255,255,0.25)", color: "#fff",
          fontSize: "7pt", fontWeight: 600,
          padding: "1mm 2mm", borderRadius: "2mm",
        }}>
          {TYPE_LABEL[member.memberType] ?? member.memberType}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "2mm 4mm", height: "calc(100% - 13mm)", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "11pt", color: "#111", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {member.name}
          </p>
          {member.email && (
            <p style={{ margin: "0.5mm 0 0", fontSize: "7.5pt", color: "#666", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {member.email}
            </p>
          )}
          {member.phone && (
            <p style={{ margin: "0.5mm 0 0", fontSize: "7.5pt", color: "#666", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              📞 {member.phone}
            </p>
          )}
          {expireLabel && (
            <p style={{ margin: "1mm 0 0", fontSize: "7pt", color: "#888" }}>
              Expires: <strong style={{ color: "#555" }}>{expireLabel}</strong>
            </p>
          )}
        </div>

        {/* Barcode */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "1mm" }}>
          <svg ref={barcodeRef} />
        </div>
      </div>
    </div>
  );
}
