// HTML for the quote-prep desk. Pure functions, used at build time (prerender for no-JS and print) and in
// the browser, so both show exactly the same output.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '');
const short = (name) => String(name).replace(/ Habitat Bank$/, '');
// The metric labels habitats "Broad - Habitat"; on screen they read "Broad: Habitat".
export const habitatName = (label) => { const [broad, ...rest] = String(label).split(' - '); return rest.length ? `${broad}: ${rest.join(' - ')}` : String(label); };
const BAND_NAME = { 'V.High': 'Very high', High: 'High', Medium: 'Medium', Low: 'Low' };
const TIER = { inside: 'Same LPA or NCA', neighbouring: 'Neighbouring', beyond: 'Beyond the neighbours', unconfirmed: 'Neighbours not listed' };

export function stamp(metric, meta) {
  const nca = metric.site.nca ? `, ${esc(metric.site.nca)} NCA` : ', site NCA not given';
  return `<p class="stamp"><span class="stamp__site">${esc(metric.site.name || 'Development site')}</span> <span>${esc(metric.site.lpa)}${nca}. ${esc(metric.site.applicationType || '')}</span> <span class="stamp__rules">Statutory metric ${esc(metric.version || '1.1.0')}, rules as of ${esc(meta.rulesAsOf)}. Banks as listed on environmentbank.com on ${esc(meta.banksAsOf)}.</span></p>`;
}

export function unitTiles(req) {
  const tile = (type, label, cls) => {
    const t = req.types[type];
    if (!t) return `<div class="unit unit--${cls} unit--none"><h4>${label}</h4><p>Not in this metric</p></div>`;
    return `<div class="unit unit--${cls}"><h4>${label}</h4><dl>`
      + `<div><dt>Baseline</dt><dd>${fmt(t.baseline)}</dd></div>`
      + `<div><dt>After development</dt><dd>${fmt(t.post)}</dd></div>`
      + `<div><dt>Target</dt><dd>${fmt(t.target)}</dd></div>`
      + `<div class="unit__short"><dt>Short by</dt><dd>${fmt(t.shortfall)}</dd></div></dl></div>`;
  };
  return `<div class="units">${tile('Habitat', 'Area habitat units', 'area')}${tile('Hedgerow', 'Hedgerow units', 'hedge')}${tile('Watercourse', 'Watercourse units', 'water')}</div>`;
}

// The spatial-risk rings: the site at the centre, banks placed in the ring their multiplier puts them in.
export function rings(s, idx = 0) {
  const R = { inside: 62, neighbouring: 112, beyond: 160 };
  const mid = { inside: 36, neighbouring: 88, beyond: 137 };
  const groups = { inside: [], neighbouring: [], beyond: [] };
  for (const o of s.options) groups[o.spatial.tier === 'unconfirmed' ? 'beyond' : o.spatial.tier].push(o);
  const best = s.best && s.best.bank;
  const dots = [];
  for (const [tier, os] of Object.entries(groups)) {
    os.forEach((o, i) => {
      const a = (-60 + (i * 360) / Math.max(os.length, 1) + (tier === 'neighbouring' ? 25 : tier === 'beyond' ? 50 : 0)) * (Math.PI / 180);
      const x = 180 + mid[tier] * Math.cos(a), y = 180 + mid[tier] * Math.sin(a);
      let anchor = Math.cos(a) < -0.2 ? 'end' : Math.cos(a) > 0.2 ? 'start' : 'middle';
      const w = short(o.bank).length * 7.6; // rough label width at 15px, so labels stay inside the drawing
      if (anchor === 'start' && x + 9 + w > 356) anchor = 'end';
      else if (anchor === 'end' && x - 9 - w < 4) anchor = 'start';
      let lx = x + (anchor === 'end' ? -9 : anchor === 'start' ? 9 : 0);
      if (anchor === 'middle') lx = Math.min(356 - w / 2, Math.max(4 + w / 2, lx));
      const ly = y + (anchor === 'middle' ? (Math.sin(a) < 0 ? -10 : 18) : 4);
      const isBest = o.bank === best;
      dots.push(`<g class="ring-bank${isBest ? ' ring-bank--best' : ''}"><circle cx="${fmt(x)}" cy="${fmt(y)}" r="${isBest ? 7 : 5}"/><text x="${fmt(lx)}" y="${fmt(ly)}" text-anchor="${anchor}">${esc(short(o.bank))}</text></g>`);
    });
  }
  const label = `Spatial risk for ${habitatName(s.deficit.label)}: ` + (s.options.length ? s.options.map((o) => `${o.bank}, ${TIER[o.spatial.tier].toLowerCase()}, multiplier ${o.spatial.multiplier}`).join('; ') : 'no listed bank satisfies the trading rule');
  return `<figure class="rings"><svg viewBox="0 0 360 360" role="img" aria-labelledby="rings-t-${idx}"><title id="rings-t-${idx}">${esc(label)}</title>`
    + `<circle class="ring ring--3" cx="180" cy="180" r="${R.beyond}"/><circle class="ring ring--2" cx="180" cy="180" r="${R.neighbouring}"/><circle class="ring ring--1" cx="180" cy="180" r="${R.inside}"/>`
    + `<text class="ring-label" x="180" y="${180 - R.inside + 17}" text-anchor="middle">×1</text>`
    + `<text class="ring-label" x="180" y="${180 - R.neighbouring + 17}" text-anchor="middle">×0.75</text>`
    + `<text class="ring-label" x="180" y="${180 - R.beyond + 17}" text-anchor="middle">×0.5</text>`
    + `<rect class="ring-site" x="173" y="173" width="14" height="14" rx="2"/>`
    + dots.join('')
    + `</svg><figcaption>Centre: the site. ×1 in its LPA or NCA; ×0.75 a neighbour the bank's page lists; ×0.5 further away. Positions around a ring are spaced for reading, not geography.</figcaption></figure>`;
}

export function shortlistTable(s) {
  if (!s.options.length) return `<p class="none">No live bank lists a habitat that satisfies the trading rule for this loss.</p>`;
  const rows = s.options.map((o) => `<tr${o.bank === s.best.bank ? ' class="is-best"' : ''}>`
    + `<th scope="row"><a class="no-url" href="${esc(o.url)}">${esc(o.bank)}</a>${o.bank === s.best.bank ? ' <span class="tag tag--best">First choice</span>' : ''}</th>`
    + `<td data-label="Where">${esc(o.lpa)}<br><span class="muted">${esc(o.nca)}</span></td>`
    + `<td data-label="Offers">${esc(o.offered)}${o.tradeUp ? ' <span class="tag tag--up">Trade up: ecologist to confirm</span>' : ''}<br><span class="muted">${esc(o.trading)}${o.alsoOffers && o.alsoOffers.length ? `. Also lists ${esc(o.alsoOffers.join(', '))}` : ''}</span></td>`
    + `<td data-label="Spatial risk"><span class="mult mult--${o.spatial.tier}">×${fmt(o.spatial.multiplier)}</span> <span class="muted">${esc(TIER[o.spatial.tier])}</span></td>`
    + `<td data-label="Units to buy" class="num">${fmt(o.unitsToSource)}</td>`
    + `<td data-label="Counts towards the target" class="num">${fmt(o.countsAs)}</td></tr>`).join('');
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Shortlist for ${esc(habitatName(s.deficit.label))}"><table class="shortlist"><thead><tr><th scope="col">Habitat bank</th><th scope="col">Where</th><th scope="col">Offers, and why it satisfies the rule</th><th scope="col">Spatial risk</th><th scope="col" class="num">Units to buy, before spatial risk</th><th scope="col" class="num">Counts towards the target</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + (s.more ? `<p class="more">And ${s.more} more live ${s.more === 1 ? 'bank lists' : 'banks list'} a habitat that satisfies the rule, lower in the ranking or beyond the neighbours (×0.5). Within a spatial risk band the order is not distance: the public listing has no coordinates.</p>` : '');
}

// The first choice in words, beside the rings.
function pick(s) {
  if (!s.best) return `<div class="pick"><p><strong>No live bank lists a habitat that satisfies the rule.</strong> This goes to the ecology team.</p></div>`;
  const o = s.best;
  if (s.deficit.band === 'V.High') return `<div class="pick pick--stop"><p class="pick__stop">Stop: bespoke compensation</p><p>A very high distinctiveness loss goes to the ecology team, not a standard quote. <a class="no-url" href="${esc(o.url)}">${esc(o.bank)}</a> lists the same habitat. ${esc(o.spatial.reason)}. That is for their information; they decide.</p></div>`;
  const extra = o.spatial.multiplier < 1
    ? ` The trading rules are checked before spatial risk, so these units meet the rule in full; at ×${fmt(o.spatial.multiplier)} they count as ${fmt(o.countsAs)} towards the target. The rest of the gap is shown below the losses.`
    : ' Counted in full: no spatial risk deduction.';
  const up = o.tradeUp ? ' No bank lists this habitat or its broad habitat close by, so this is a trade up to a higher distinctiveness habitat: likely dearer, and the ecology team confirms it.' : '';
  return `<div class="pick"><p class="muted">First choice</p><p class="pick__units">${fmt(o.unitsToSource)} <span class="pick__label">units to buy, before spatial risk</span></p><p><a class="no-url" href="${esc(o.url)}">${esc(o.bank)}</a>, offering ${esc(o.offered)}. ${esc(o.spatial.reason)}.${extra}${up}</p></div>`;
}

export function checksList(checks) {
  const name = { stop: 'Stop', check: 'Check', info: 'Note' };
  return `<ul class="checks">${checks.map((c) => `<li class="checks__item checks__item--${c.level}"><span class="checks__level">${name[c.level]}</span> ${esc(c.text)}</li>`).join('')}</ul>`;
}

export function deskOutput(out, metric, meta) {
  const req = out.requirement;
  const deficits = out.shortlist.map((s, i) => `<article class="deficit">`
    + `<header class="deficit__head"><span class="band band--${s.deficit.band.replace('.', '').toLowerCase()}">${BAND_NAME[s.deficit.band]} distinctiveness</span><h4>${esc(habitatName(s.deficit.label))}</h4><p class="deficit__units"><b>${fmt(s.deficit.units)}</b> units lost</p></header>`
    + `<div class="deficit__body">${rings(s, i)}${pick(s)}${shortlistTable(s)}</div></article>`).join('');
  const any = req.types.Habitat && req.types.Habitat.anyHabitat > 0
    ? `<p class="remainder">Then <b>${fmt(req.types.Habitat.anyHabitat)}</b> more area habitat units of any habitat are needed after spatial risk${req.topUpBank ? `: from ${esc(req.topUpBank.bank)} at ×${fmt(req.topUpBank.multiplier)} that is <b>${fmt(req.topUpBank.units)}</b> units to buy` : ''}. The trading rules apply up to no net loss; after that any habitat counts.</p>` : '';
  return stamp(metric, meta)
    + `<h3>What the development still needs</h3>${unitTiles(req)}`
    + `<p class="rule2">The three unit types stay apart: the metric's Rule 2 says they are never summed, traded or converted, and the 10% gain applies to each.</p>`
    + `<h3>Losses the trading rules say must be replaced</h3>`
    + (deficits || '<p class="none">The trading summary shows no losses that need like-for-like replacement.</p>')
    + any
    + `<h3>Checks before anything goes to the developer</h3>${checksList(out.checks)}`
    + `<details class="brief"><summary>Draft brief for the account manager</summary><pre id="brief-text">${esc(out.brief)}</pre><button type="button" class="btn btn--ghost js-only" data-copy="brief-text">Copy the brief</button></details>`;
}

export function sitePicker(scenarios, selected) {
  return scenarios.map((s, i) => `<label class="site${s.file === selected ? ' is-on' : ''}"><input type="radio" name="site" value="${esc(s.file)}"${s.file === selected ? ' checked' : ''}><span class="site__name">${esc(s.name.replace(/ \(synthetic\)$/, ''))}</span><span class="site__lpa">${esc(s.lpa)}</span><span class="site__shows">${esc(s.shows || '')}</span></label>`).join('');
}
