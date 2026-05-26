import * as XLSX from "xlsx";

// ── Export helpers ────────────────────────────────────────────────

export function exportToExcel(data: Record<string, unknown>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

export function exportToCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return "";
  function esc(v: unknown): string {
    if (v == null) return "";
    const s = String(v);
    // Quote any field that contains a comma, double-quote, newline, or carriage return
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  const headers = Object.keys(data[0]).map(esc).join(",");
  const rows    = data.map((row) => Object.values(row).map(esc).join(","));
  return [headers, ...rows].join("\r\n"); // RFC 4180 CRLF
}

// ── Import helpers ─────────────────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}

export function parseCSVText(text: string): Record<string, unknown>[] {
  // RFC 4180-compliant tokeniser — handles quoted fields, commas inside quotes,
  // and escaped double-quotes ("").
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let i = 0;
    while (i <= line.length) {
      if (i === line.length) { fields.push(""); break; }
      if (line[i] === '"') {
        // Quoted field
        let field = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (line[i + 1] === '"') { field += '"'; i += 2; } // escaped quote
            else { i++; break; }                               // closing quote
          } else {
            field += line[i++];
          }
        }
        fields.push(field);
        if (i < line.length && line[i] === ",") i++; // skip separator
      } else {
        // Unquoted field
        const end = line.indexOf(",", i);
        if (end === -1) { fields.push(line.slice(i).trim()); break; }
        fields.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
    return fields;
  }

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });
}
