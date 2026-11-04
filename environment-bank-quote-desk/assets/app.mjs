// The desk in the browser. Same rules engine as the MCP server (core.mjs) and the same label-checked reader
// (metric-core.mjs); a workbook is unzipped and read in this page (xlsx-lite.mjs) and never leaves it.
import { DATA } from './data.mjs';
import { prepare } from './core.mjs';
import { scenarioToMetric, readMetricFrom, SHEETS } from './metric-core.mjs';
import { openXlsx } from './xlsx-lite.mjs';
import { deskOutput } from './render.mjs';

document.documentElement.classList.replace('no-js', 'js');

const result = document.getElementById('desk-result');
const status = document.getElementById('desk-status');
const sites = document.getElementById('sites');
const fileInput = document.getElementById('metric-file');
const ncaSelect = document.getElementById('site-nca');
const drop = document.getElementById('drop');
let lastBook = null;
let lastFile = '';

function say(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('is-error', isError);
}

function show(metric) {
  const out = prepare(DATA.lookups, metric, DATA.banks);
  result.innerHTML = deskOutput(out, metric, DATA.meta);
  return out;
}

function showScenario(file) {
  const s = DATA.scenarios.find((x) => x.file === file);
  if (!s) return;
  lastBook = null;
  const out = show(scenarioToMetric(DATA.lookups, s));
  const stops = out.checks.filter((c) => c.level === 'stop').length;
  say(`Showing ${s.name.replace(/ \(synthetic\)$/, '')}: ${out.requirement.deficits.length} trading ${out.requirement.deficits.length === 1 ? 'deficit' : 'deficits'}${stops ? `, ${stops} ${stops === 1 ? 'stop' : 'stops'}` : ''}.`);
  for (const l of sites.querySelectorAll('.site')) l.classList.toggle('is-on', l.querySelector('input').checked);
}

function showBook() {
  try {
    const metric = readMetricFrom(lastBook, { siteNca: ncaSelect.value, file: lastFile });
    const out = show(metric);
    say(`Read ${lastFile}: metric ${metric.version}, ${out.requirement.deficits.length} trading ${out.requirement.deficits.length === 1 ? 'deficit' : 'deficits'}. Nothing was uploaded.`);
    for (const r of sites.querySelectorAll('input')) r.checked = false;
    for (const l of sites.querySelectorAll('.site')) l.classList.remove('is-on');
  } catch (e) {
    say(e.message, true);
  }
}

async function readFile(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { say('Choose a .xlsx file. A macro-enabled .xlsm metric can be saved as .xlsx first.', true); return; }
  say(`Reading ${file.name} in this browser...`);
  try {
    const book = await openXlsx(await file.arrayBuffer());
    if (!book.has(SHEETS.start)) throw new Error('This workbook has no Start sheet, so it is not a statutory metric.');
    await book.loadSheets(Object.values(SHEETS).filter((n) => book.has(n)));
    lastBook = book;
    lastFile = file.name;
    showBook();
  } catch (e) {
    lastBook = null; // a rejected file must not leave the previous workbook in play
    say(e.message || 'This file could not be read.', true);
  }
}

if (result && sites) {
  sites.addEventListener('change', (e) => { if (e.target.name === 'site') showScenario(e.target.value); });
  fileInput.addEventListener('change', () => readFile(fileInput.files[0]));
  ncaSelect.addEventListener('change', () => { if (lastBook) showBook(); });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
  const checked = sites.querySelector('input:checked');
  if (checked) say(`Showing ${checked.closest('.site').querySelector('.site__name').textContent}. Pick another site or read your own metric.`);
}

// Copy the brief
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const text = document.getElementById(b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); say('Brief copied.'); } catch { say('Copy is blocked in this browser; select the text instead.', true); }
});
