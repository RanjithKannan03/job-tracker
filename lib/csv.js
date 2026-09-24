// Minimal RFC 4180 CSV parse/serialize (handles quotes, commas, newlines in fields).

function parse(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  text = text.replace(/^﻿/, '');
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
}

function toObjects(text) {
  const [header, ...rows] = parse(text);
  if (!header) return [];
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function escape(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function stringify(objects, columns) {
  const lines = [columns.map(escape).join(',')];
  for (const o of objects) lines.push(columns.map(c => escape(o[c])).join(','));
  return lines.join('\n') + '\n';
}

module.exports = { parse, toObjects, stringify };
