// calc.js: "Check any date" on the build-pack page. Same engine as the mock-up and the tests.
import * as clock from '../pack/engine/clock.js';

const form = document.querySelector('[data-calc]');
const out = document.querySelector('[data-calc-out]');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmt(iso) { const [y, m, d] = iso.split('-').map(Number); return `${DAYS[clock.dayOfWeek(iso)]} ${d} ${MONTHS[m - 1]} ${y}`; }

let H = new Set();

function update() {
  const f = new FormData(form);
  const received = f.get('received');
  if (!received) { out.innerHTML = '<p class="hint">Illustrative: enter the date the complaint was received.</p>'; return; }
  let a;
  try {
    a = clock.assess({ received, reservation: f.get('reservation') || '', completion: f.get('completion') || '', today: received }, H);
  } catch (e) {
    out.innerHTML = '<p class="hint">Illustrative: please enter real dates.</p>';
    return;
  }
  const win = a.window.ok === null ? 'needs a reservation or completion date' : a.window.ok ? `open until ${fmt(a.window.end)}` : `closed on ${fmt(a.window.end)}: a person decides`;
  const rows = a.rows.slice(0, 5).map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${fmt(r.due)}</td><td>${r.sendBy === r.due ? 'Same day' : fmt(r.sendBy)}</td></tr>`).join('');
  out.innerHTML = `
    <p><span class="badge badge--accent">Illustrative</span> The clock starts <strong>${fmt(a.initiation)}</strong>. Code: ${esc(a.code.label)}. Two-year window: ${esc(win)}.</p>
    <div class="table-wrap" role="region" tabindex="0" aria-label="Dates for this complaint">
      <table class="table"><caption>Commitments for this complaint</caption>
        <thead><tr><th scope="col">Commitment</th><th scope="col">Due</th><th scope="col">Suggested send-by</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
}

async function start() {
  try {
    const data = await (await fetch(new URL('../pack/engine/bank-holidays-england-wales.json', import.meta.url))).json();
    H = clock.holidaySet(data.dates);
  } catch (e) { return; }
  form.addEventListener('input', update);
  update();
}
if (form && out) start();
