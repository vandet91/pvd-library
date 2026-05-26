"use client";

import { useEffect, useRef } from "react";

interface Props {
  value:    string;      // e.g. "PVD-000001"
  width?:   number;      // bar width multiplier (default 2)
  height?:  number;      // bar height in px (default 60)
  fontSize?: number;     // text size below barcode (default 14)
  className?: string;
}

export default function BarcodeDisplay({
  value,
  width    = 2,
  height   = 60,
  fontSize = 14,
  className = "",
}: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    // Dynamic import keeps jsbarcode out of the server bundle and avoids
    // Turbopack "can't resolve 'canvas'" errors in Node environments.
    import("jsbarcode").then(({ default: JsBarcode }) => {
      try {
        JsBarcode(ref.current!, value, {
          format:       "CODE128",
          width,
          height,
          fontSize,
          margin:       4,
          displayValue: true,
          font:         "monospace",
        });
      } catch (e) {
        console.error("BarcodeDisplay render error:", e);
      }
    }).catch((e) => {
      console.error("BarcodeDisplay import error:", e);
    });
  }, [value, width, height, fontSize]);

  if (!value) return null;
  return <svg ref={ref} className={className} />;
}
