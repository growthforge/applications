// csv.js: a small RFC 4180 CSV reader and writer. No dependencies; runs in Node and the browser.
// Fields may be quoted with double quotes; a doubled quote inside a quoted field is a literal quote.
// The Tags column in the cost export carries JSON, so quoting matters.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const s = String(text).replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1 || r[0] !== '').map((r) => {
    const o = {};
    header.forEach((h, k) => { o[h] = r[k] === undefined ? '' : r[k]; });
    return o;
  });
}

function quote(v) {
  if (v === null || v === undefined) return '';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

export function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const out = [cols.join(',')];
  for (const r of rows) out.push(cols.map((c) => quote(r[c])).join(','));
  return out.join('\n') + '\n';
}

// Numbers in the files are plain decimals; empty strings become null.
export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
