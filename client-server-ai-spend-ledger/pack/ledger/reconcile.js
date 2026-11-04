// reconcile.js: the list-price estimate against the bill, line by line, with the gap explained.
//
// The estimate is metered tokens times published list prices. It is never the number we allocate;
// it is the check that the gateway sees what the invoice charges for. For each billed AI line:
//   gap = billed - estimate = (unmetered usage at list price) - (negotiated discount) + residual
// unmetered usage is billed tokens the gateway never saw, priced class by class from the bill's
// quantities; the discount is ListCost - BilledCost; the residual is what is left, and it is only
// non-zero when the bill's unit price disagrees with the price sheet (a stale price row).
// The Claude CCU line carries no token counts, so its whole gap shows as unmetered or rate difference.
// Coverage is the share of token-billed AI cost explained by gateway metering (coverageOfAllAi
// restates it over all AI spend, including the AI Search tier, which is not token-billed); a bypass is a billed line
// with no metered calls at all.
import { tokenClassOf, priceOn } from './normalise.js';

const BYPASS_FLOOR = 1;          // dollars: ignore rounding-size lines
const PARTIAL_BELOW = 0.98;      // coverage below this is flagged as partial

export function reconcile(billed, gw, prices, org, month) {
  const lines = billed.filter((r) => r.x_Month === month && r.ServiceCategory === 'AI and Machine Learning'
    && (r.ConsumedUnit === 'Tokens' || org.gateway.ccuLines[r.ResourceId]));
  const groups = {};
  const priceMismatches = [];
  for (const r of lines) {
    const ccu = org.gateway.ccuLines[r.ResourceId];
    const key = ccu ? r.ResourceId : r.x_Deployment;
    const g = groups[key] ??= { key, label: ccu ? 'Claude (CCU line)' : r.x_Deployment, kind: ccu ? 'ccu' : 'tokens', subscription: r.SubAccountId,
      models: new Set(), billed: 0, list: 0, billedQty: {}, unitPrice: {} };
    g.billed += r.BilledCost;
    g.list += r.ListCost;
    if (!ccu) {
      g.models.add(r.x_ModelId);
      const cls = tokenClassOf(r.x_TokenDirection, r.x_TokenCacheAction);
      const k = r.x_Date + '|' + cls;
      g.billedQty[k] = (g.billedQty[k] || 0) + r.ConsumedQuantity;
      g.unitPrice[k] = r.ListUnitPrice;
      const p = priceOn(prices, r.x_ModelId, cls, r.x_Date);
      if (p && Math.abs(p.usdPerMTok - r.ListUnitPrice) > 1e-9) priceMismatches.push({ date: r.x_Date, deployment: r.x_Deployment, model: r.x_ModelId, cls, bill: r.ListUnitPrice, sheet: p.usdPerMTok });
    }
  }
  const gwMonth = gw.filter((g) => g.x_Month === month);
  const out = [];
  for (const g of Object.values(groups)) {
    let metered = [];
    if (g.kind === 'ccu') {
      const models = org.gateway.ccuLines[g.key].models;
      metered = gwMonth.filter((x) => models.includes(x.x_ModelId));
    } else {
      metered = gwMonth.filter((x) => x.x_Deployment === g.key);
    }
    const meteredQty = {};
    for (const x of metered) { const k = x.x_Date + '|' + x.x_TokenClass; meteredQty[k] = (meteredQty[k] || 0) + x.ConsumedQuantity; }
    const priced = metered.every((x) => x.ListCost !== null);
    const estimate = metered.length && priced ? metered.reduce((s, x) => s + x.ListCost, 0) : (metered.length ? null : 0);
    const discount = g.list - g.billed;
    let unmetered = 0;
    let residual = 0;
    let coverage;
    if (g.kind === 'ccu') {
      unmetered = g.billed - (estimate || 0);
      coverage = g.billed ? Math.min(1, (estimate || 0) / g.billed) : 0;
    } else {
      let billedTok = 0;
      let meteredTok = 0;
      for (const [k, q] of Object.entries(g.billedQty)) {
        const m = meteredQty[k] || 0;
        billedTok += q;
        meteredTok += Math.min(m, q);
        unmetered += ((q - m) / 1e6) * g.unitPrice[k];
      }
      coverage = billedTok ? meteredTok / billedTok : 0;
      residual = estimate === null ? 0 : (g.list - estimate) - unmetered;
    }
    const status = metered.length === 0 && g.billed > BYPASS_FLOOR ? 'bypass' : coverage < PARTIAL_BELOW ? 'partial' : 'covered';
    out.push({ key: g.key, label: g.label, kind: g.kind, subscription: g.subscription, models: [...g.models],
      billed: g.billed, list: g.list, discount, estimate, unmetered, residual, coverage, status });
  }
  out.sort((a, b) => b.billed - a.billed);
  const totBilled = out.reduce((s, x) => s + x.billed, 0);
  const pricedRows = out.filter((x) => x.estimate !== null);
  const totals = {
    billed: totBilled,
    list: out.reduce((s, x) => s + x.list, 0),
    estimate: pricedRows.reduce((s, x) => s + x.estimate, 0),
    discount: pricedRows.reduce((s, x) => s + x.discount, 0),
    unmetered: pricedRows.reduce((s, x) => s + x.unmetered, 0),
    residual: pricedRows.reduce((s, x) => s + x.residual, 0),
    unpricedBilled: out.filter((x) => x.estimate === null).reduce((s, x) => s + x.billed, 0),
    coverage: totBilled ? out.reduce((s, x) => s + x.billed * x.coverage, 0) / totBilled : 0,
  };
  totals.gap = pricedRows.reduce((s, x) => s + x.billed, 0) - totals.estimate;
  const notTokenBilled = billed.filter((r) => r.x_Month === month && r.ServiceCategory === 'AI and Machine Learning' && r.ConsumedUnit !== 'Tokens' && !org.gateway.ccuLines[r.ResourceId]);
  totals.notTokenBilled = notTokenBilled.reduce((s, r) => s + r.BilledCost, 0);
  // The same explained cost as a share of all AI spend, including lines that are not token-billed.
  totals.coverageOfAllAi = (totBilled + totals.notTokenBilled) ? (totals.coverage * totBilled) / (totBilled + totals.notTokenBilled) : 0;
  return { month, lines: out, totals, bypass: out.filter((x) => x.status === 'bypass'), partial: out.filter((x) => x.status === 'partial'), priceMismatches };
}
