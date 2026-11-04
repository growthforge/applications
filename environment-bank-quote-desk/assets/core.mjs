// BNG quote-prep rules. Shared by the MCP server (mcp/server.mjs) and the page, so both run the same code.
// Rules and multipliers come from the Statutory Biodiversity Metric 1.1.0 (data/metric-lookups.json,
// Open Government Licence v3.0). The tool prepares a draft for an account manager: it never prices,
// reserves or allocates units, and every output says so.

export const BAND_ORDER = { 'V.Low': 0, Low: 1, Medium: 2, High: 3, 'V.High': 4 };
export const NET_GAIN = 0.1;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Find a habitat in the official list by its "Broad - Habitat" label or by its habitat name alone.
export function findHabitat(lookups, name) {
  const n = norm(name);
  return lookups.habitats.find((h) => norm(h.label) === n) || lookups.habitats.find((h) => norm(h.habitat) === n) || null;
}

// The metric's trading rules (G-1, "Distinctiveness categories"):
//   Very high and high: same habitat. Medium: same broad habitat or a higher distinctiveness habitat.
//   Low: same distinctiveness or better habitat.
export function tradingCheck(lookups, deficitLabel, offeredLabel) {
  const need = findHabitat(lookups, deficitLabel);
  const offer = findHabitat(lookups, offeredLabel);
  if (!need) return { ok: false, rule: null, reason: `"${deficitLabel}" is not in the metric's habitat list` };
  if (!offer) return { ok: false, rule: null, reason: `"${offeredLabel}" is not in the metric's habitat list` };
  const rule = need.tradingRule;
  const nb = BAND_ORDER[need.distinctiveness];
  const ob = BAND_ORDER[offer.distinctiveness];
  if (need.distinctiveness === 'V.High' || need.distinctiveness === 'High') {
    const ok = need.label === offer.label;
    return { ok, rule, reason: ok ? 'Same habitat' : `${need.distinctiveness} distinctiveness needs the same habitat (${need.habitat})` };
  }
  if (need.distinctiveness === 'Medium') {
    // The rule carries "(≥)": within the same broad habitat the offer must be at least Medium; any broad
    // habitat is acceptable above Medium. Trading down is never allowed.
    const sameBroad = need.broad === offer.broad && ob >= nb;
    const ok = sameBroad || ob > nb;
    return { ok, rule, reason: ok ? (need.label === offer.label ? 'Same habitat' : sameBroad ? `Same broad habitat (${need.broad}), at least Medium` : `Higher distinctiveness (${offer.distinctiveness})`) : (need.broad === offer.broad ? `Same broad habitat but lower distinctiveness (${offer.distinctiveness}): trading down is not allowed` : `Needs ${need.broad} at Medium or above, or any habitat above Medium`) };
  }
  if (need.distinctiveness === 'Low') {
    const ok = ob >= nb;
    return { ok, rule, reason: ok ? `Same or better distinctiveness (${offer.distinctiveness})` : 'Needs Low distinctiveness or better' };
  }
  return { ok: true, rule, reason: 'No compensation required for very low distinctiveness' };
}

// Spatial risk (G-3): inside the impact site's LPA or NCA = 1; neighbouring LPA or NCA = 0.75; beyond = 0.5.
// Each habitat bank's public page lists the LPAs and NCAs it neighbours ("adjacent coverage"), so 0.75 is
// read from that list. Where a bank has no list, the tool prices at 0.5 and asks for a boundary check.
export function spatialRisk(site, bank) {
  const same = (a, b) => a && b && norm(a) === norm(b);
  if (same(site.lpa, bank.lpa)) return { multiplier: 1, tier: 'inside', reason: `Same LPA (${bank.lpa})` };
  if (same(site.nca, bank.nca)) return { multiplier: 1, tier: 'inside', reason: `Same NCA (${bank.nca})` };
  const nl = (bank.neighbouringLpas || []).find((x) => same(x, site.lpa));
  if (nl) return { multiplier: 0.75, tier: 'neighbouring', reason: `Neighbouring LPA (${nl}), listed on the bank's page` };
  const nn = (bank.neighbouringNcas || []).find((x) => same(x, site.nca));
  if (nn) return { multiplier: 0.75, tier: 'neighbouring', reason: `Neighbouring NCA (${nn}), listed on the bank's page` };
  const listed = (bank.neighbouringLpas || []).length || (bank.neighbouringNcas || []).length;
  return listed
    ? { multiplier: 0.5, tier: 'beyond', reason: "Outside the bank's LPA, NCA and the neighbours its page lists" }
    : { multiplier: 0.5, tier: 'unconfirmed', reason: 'The bank page lists no neighbours: priced at 0.5 until a boundary check (could be 0.75)' };
}

const round2 = (x) => Math.round(x * 100) / 100;
const nice = (label) => { const [broad, ...rest] = String(label).split(' - '); return rest.length ? `${broad}: ${rest.join(' - ')}` : String(label); };

// What the development still needs, from the metric's headline results and trading summary.
export function requirement(metric) {
  const types = {};
  const gain = metric.site && Number.isFinite(metric.site.target) ? metric.site.target : NET_GAIN;
  for (const [type, h] of Object.entries(metric.headline || {})) {
    const target = h.baseline * (1 + gain);
    types[type] = { baseline: h.baseline, post: h.post, target: round2(target), shortfall: round2(Math.max(0, target - h.post)) };
  }
  const deficits = (metric.deficits || []).filter((d) => d.units < 0).map((d) => ({ ...d, units: round2(-d.units) }));
  return { site: metric.site, types, deficits };
}

// A shortlist of habitat banks for each deficit: trading rule first, then spatial risk.
export function shortlist(lookups, req, banks) {
  return req.deficits.map((d) => {
    const options = [];
    const need = findHabitat(lookups, d.label);
    for (const b of banks) {
      if (b.status && b.status !== 'live') continue;
      // One row per bank: the habitat it lists that fits best, and the others that also satisfy the rule.
      const fits = [];
      for (const offered of b.habitats || []) {
        const t = tradingCheck(lookups, d.label, offered);
        if (!t.ok) continue;
        const off = findHabitat(lookups, offered);
        const fit = need && off ? (need.label === off.label ? 2 : need.broad === off.broad ? 1 : 0) : 0; // like for like first
        fits.push({ offered, fit, trading: t.reason });
      }
      if (!fits.length) continue;
      // Like for like first; among the rest, the lowest distinctiveness that still satisfies the rule.
      const band = (h) => BAND_ORDER[(findHabitat(lookups, h) || {}).distinctiveness] ?? 9;
      fits.sort((x, y) => y.fit - x.fit || band(x.offered) - band(y.offered) || x.offered.localeCompare(y.offered));
      const s = spatialRisk(req.site, b);
      const sameLpa = norm(b.lpa) === norm(req.site.lpa) ? 1 : 0; // the planning authority's own area first
      // A different broad habitat in a higher band: allowed by the rules, but likely dearer and an ecologist's call.
      const tradeUp = fits[0].fit === 0 && band(fits[0].offered) > (BAND_ORDER[need && need.distinctiveness] ?? 0);
      options.push({ tradeUp, bank: b.name, url: b.url, county: b.county, lpa: b.lpa, nca: b.nca, register: b.register || null, offered: fits[0].offered, fit: fits[0].fit, trading: fits[0].trading, alsoOffers: fits.slice(1).map((f) => f.offered), sameLpa, spatial: s,
        // The trading rules are applied before spatial risk (user guide, Figure 14): the loss is bought like for
        // like at face value, and the multiplier then counts it for less towards the net gain target.
        unitsToSource: d.units, countsAs: round2(d.units * s.multiplier), topUp: round2(d.units - d.units * s.multiplier) });
    }
    // Like for like (or the same broad habitat) before trading up to a dearer habitat; then lowest spatial risk;
    // then the site's own LPA over one that only shares the NCA. Within a band the order is not distance: the
    // public listing has no coordinates.
    options.sort((a, b) => a.tradeUp - b.tradeUp || b.spatial.multiplier - a.spatial.multiplier || b.fit - a.fit || b.sameLpa - a.sameLpa || a.bank.localeCompare(b.bank));
    const best = options[0];
    // Banks beyond the neighbours (×0.5) are only listed when nothing closer satisfies the rule.
    const anyClose = options.some((o) => o.spatial.multiplier >= 0.75);
    const shown = anyClose ? options.filter((o) => o.spatial.multiplier >= 0.75 || o === best) : options;
    return { deficit: d, options: shown.slice(0, 5), more: Math.max(0, options.length - Math.min(5, shown.length)), best };
  });
}

// Checks an account manager should see before anything goes to the developer.
export function checks(req, list) {
  const out = [];
  for (const [type, t] of Object.entries(req.types)) {
    if (t.shortfall > 0) out.push({ level: 'info', text: `${type} units: ${t.shortfall} more needed to reach the net gain target (baseline ${t.baseline}, post-development ${t.post}).` });
  }
  for (const s of list) {
    if (!s.best) out.push({ level: 'stop', text: `No listed bank offers a habitat that satisfies the trading rule for ${nice(s.deficit.label)}, ${s.deficit.band} distinctiveness. Ask the ecology team; statutory credits are the last resort.` });
    else if (s.best.spatial.multiplier < 1) out.push({ level: 'check', text: `${nice(s.deficit.label)}: no listed bank in the site's LPA${req.site.nca ? ' or NCA' : ' (site NCA not given, so not checked)'}. The first choice, ${s.best.bank}, is at ×${s.best.spatial.multiplier}: buy ${s.best.unitsToSource} units like for like, which count as ${s.best.countsAs} towards the target. Confirm the boundary with GIS before quoting.` });
    if (s.best && s.best.tradeUp) out.push({ level: 'check', text: `${nice(s.deficit.label)}: the first choice offers ${s.best.offered}, a higher distinctiveness habitat than the loss. The rules allow it, but it is likely dearer and scarcer: the ecology team confirms before it is quoted.` });
  }
  if (req.site.irreplaceable) out.push({ level: 'stop', text: 'The metric records irreplaceable habitat at baseline: bespoke compensation outside the metric, so this goes to the ecology team.' });
  if (!req.site.nca) out.push({ level: 'info', text: 'Site NCA not given: only the planning authority was checked. A bank in the same NCA would count at ×1, so add the NCA from GIS. If the site spans more than one LPA or NCA, any of them counts as within.' });
  if (req.deficits.some((d) => d.band === 'V.High')) out.push({ level: 'stop', text: 'A very high distinctiveness loss needs bespoke compensation: route to the ecology team, not a standard quote.' });
  for (const type of ['Hedgerow', 'Watercourse']) {
    if (req.types[type] && req.types[type].shortfall > 0) out.push({ level: 'check', text: `${type} units are a separate unit type that cannot be traded with habitat units. This version does not shortlist ${type.toLowerCase()} units: source them separately.` });
  }
  if (/nsip|nationally significant/i.test(req.site.applicationType || '')) out.push({ level: 'check', text: 'Nationally significant infrastructure project: confirm the application date and the rules that apply to NSIPs before quoting.' });
  if (req.site.hasOffsite) out.push({ level: 'check', text: 'This metric already includes off-site habitat. The shortfall here uses the on-site headline results only: check the metric\'s final results before quoting.' });
  out.push({ level: 'info', text: 'Draft only: prices, availability and allocation are confirmed by the account manager, not by this tool.' });
  const order = { stop: 0, check: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export function brief(req, list, ck) {
  const lines = [];
  lines.push(`# Draft quote brief: ${req.site.name || 'development site'}`, '');
  lines.push(`Site: ${req.site.lpa} (LPA)${req.site.nca ? ', ' + req.site.nca + ' (NCA)' : ', NCA not given'}${req.site.applicationType ? '. Application type: ' + req.site.applicationType : ''}.`, '');
  if (ck.some((c) => c.level === 'stop')) { lines.push('## Stop first'); for (const c of ck.filter((x) => x.level === 'stop')) lines.push(`- ${c.text}`); lines.push(''); }
  lines.push('## What the metric says is needed');
  for (const [type, t] of Object.entries(req.types)) lines.push(`- ${type}: baseline ${t.baseline}, post-development ${t.post}, target ${t.target}, shortfall ${t.shortfall}`);
  for (const d of req.deficits) lines.push(`- Trading deficit: ${d.units} units of ${d.label} (${d.band})`);
  if (req.types.Habitat && req.types.Habitat.anyHabitat > 0) lines.push(`- Then any area habitat: ${req.types.Habitat.anyHabitat} units after spatial risk${req.topUpBank ? `; from ${req.topUpBank.bank} at ×${req.topUpBank.multiplier} that is ${req.topUpBank.units} units to buy` : ''}`);
  lines.push('', '## Shortlist');
  for (const s of list) {
    lines.push(`### ${s.deficit.label} (${s.deficit.units} units)`);
    if (!s.options.length) lines.push('- No listed bank satisfies the trading rule.');
    for (const o of s.options) lines.push(`- ${o.bank} (${o.lpa}; ${o.nca}): offers ${o.offered}. ${o.trading}. Spatial: ${o.spatial.reason}. Like for like: ${o.unitsToSource} units, counting as ${o.countsAs}.`);
    if (s.more) lines.push(`- and ${s.more} more.`);
  }
  lines.push('', '## Checks before anything goes to the developer');
  for (const c of ck) lines.push(`- [${c.level}] ${c.text}`);
  return lines.join('\n') + '\n';
}

export function prepare(lookups, metric, banks) {
  const req = requirement(metric);
  const list = shortlist(lookups, req, banks);
  // Trading applies up to no net loss; after that any area habitat counts. Once each deficit is bought like for
  // like from its first choice (counted after spatial risk), this much more of any area habitat reaches the target.
  if (req.types.Habitat) req.types.Habitat.anyHabitat = round2(Math.max(0, req.types.Habitat.shortfall - list.reduce((a, x) => a + (x.best ? x.best.countsAs : x.deficit.units), 0)));
  // The rest, bought from the first deficit's first choice, grossed up by that bank's multiplier.
  const first = list.find((x) => x.best);
  if (req.types.Habitat && req.types.Habitat.anyHabitat > 0 && first) req.topUpBank = { bank: first.best.bank, multiplier: first.best.spatial.multiplier, units: round2(req.types.Habitat.anyHabitat / first.best.spatial.multiplier) };
  const ck = checks(req, list);
  return { requirement: req, shortlist: list, checks: ck, brief: brief(req, list, ck) };
}
