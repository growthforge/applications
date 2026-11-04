// A small .xlsx reader for the browser: unzips only the sheets asked for and returns cached cell values.
// No library and no upload: the file is read in the page. Inflate is injectable so Node tests run this same
// code with zlib. Handles shared strings, inline strings, formula strings, numbers and booleans.

const decode = (s) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) => (
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'quot' ? '"' : e === 'apos' ? "'" : e === 'amp' ? '&'
    : e[1] === 'x' || e[1] === 'X' ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(parseInt(e.slice(1), 10))));

async function browserInflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not an .xlsx workbook (no zip directory found).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const td = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged workbook (zip directory).');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const n = dv.getUint16(p + 28, true), e = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    entries.set(td.decode(buf.subarray(p + 46, p + 46 + n)), { method, size, local });
    p += 46 + n + e + c;
  }
  return entries;
}

export async function openXlsx(input, { inflate = browserInflate } = {}) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = zipEntries(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const td = new TextDecoder();
  async function file(name) {
    const e = entries.get(name);
    if (!e) return null;
    const n = dv.getUint16(e.local + 26, true), x = dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + n + x;
    const data = buf.subarray(start, start + e.size);
    if (e.method === 0) return td.decode(data);
    if (e.method === 8) return td.decode(await inflate(data));
    throw new Error('Unsupported compression in the workbook.');
  }

  const wbXml = await file('xl/workbook.xml');
  const relXml = await file('xl/_rels/workbook.xml.rels');
  if (!wbXml || !relXml) throw new Error('This file is not an .xlsx workbook.');
  const rels = {};
  for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0]), target = /\bTarget="([^"]+)"/.exec(m[0]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheetFiles = {};
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0]), rid = /\br:id="([^"]+)"/.exec(m[0]);
    if (name && rid && rels[rid[1]]) sheetFiles[decode(name[1])] = 'xl/' + rels[rid[1]];
  }

  let shared = null;
  async function sharedStrings() {
    if (shared) return shared;
    const xml = (await file('xl/sharedStrings.xml')) || '';
    shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    return shared;
  }

  const sheets = {};
  async function load(name) {
    if (sheets[name]) return sheets[name];
    const path = sheetFiles[name];
    if (!path) return null;
    const xml = await file(path);
    const ss = await sharedStrings();
    const cells = new Map();
    let maxRow = 0;
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)(\d+)"/.exec(m[1]);
      if (!ref || m[2] === undefined) continue;
      const type = (/\bt="([^"]+)"/.exec(m[1]) || [])[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(m[2]);
      let value = null;
      if (type === 's' && v) value = ss[Number(v[1])] ?? null;
      else if (type === 'inlineStr') value = decode([...m[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else if ((type === 'str' || type === 'e') && v) value = decode(v[1]);
      else if (type === 'b' && v) value = v[1] === '1';
      else if (v) value = Number(v[1]);
      if (value === null || value === '') continue;
      cells.set(ref[1] + ref[2], value);
      maxRow = Math.max(maxRow, Number(ref[2]));
    }
    return (sheets[name] = { cells, maxRow });
  }

  return {
    names: Object.keys(sheetFiles),
    // Load the sheets you need first, then read synchronously.
    async loadSheets(names) { for (const n of names) await load(n); },
    has: (name) => name in sheetFiles,
    get: (name, ref) => (sheets[name] ? sheets[name].cells.get(ref) ?? null : null),
    maxRow: (name) => (sheets[name] ? sheets[name].maxRow : 0),
  };
}
