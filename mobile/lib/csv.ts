/**
 * Small RFC-4180-ish CSV parser (quotes, escaped quotes, CR/LF, BOM),
 * replacing Node's csv-parse which doesn't run in React Native.
 * Returns rows keyed by normalized headers (lowercase, spaces → underscores).
 */

export function parseCsvRows(content: string): Record<string, string>[] {
  const text = content.replace(/^﻿/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip rows that are entirely empty.
    if (row.some((c) => c.trim() !== "")) table.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();

  if (table.length < 2) return [];
  const headers = table[0].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_")
  );
  return table.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (cells[idx] ?? "").trim();
    });
    return record;
  });
}
