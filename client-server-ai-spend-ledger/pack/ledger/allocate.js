// allocate.js: give every billed dollar an owner, or leave it visibly unallocated.
//
// The invoice is the source of truth: only BilledCost and EffectiveCost from the cost export are
// allocated. Gateway metrics never add cost; they only decide each team's share of a billed line.
// Rules, first match wins, each recorded in AllocatedMethodId (a FOCUS 1.3+ column):
//   gateway-token-share   an Azure OpenAI line the gateway metered that day: split by tokens of the
//                         same deployment and token class
//   gateway-cost-share    the aggregated Claude CCU line: split by each team's list-price estimate,
//                         because one CCU line mixes input, cache and output tokens
//   retrieval-call-share  the shared AI platform pool (AI Search): split by retrieval calls
//   resource-tag          the resource's own owner tag
//   inherited-tag         the resource group's or subscription's owner tag (resource tag wins, as
//                         in Azure tag inheritance by default)
//   unallocated           no rule applies; kept as its own line, never spread
import { tokenClassOf } from './normalise.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

function indexGateway(gw) {
  const byLine = {};    // date|deployment|class -> { team|useCase: qty }
  const byModel = {};   // date|model -> { team|useCase: list cost }
  for (const g of gw) {
    const k = g.x_Date + '|' + g.x_Deployment + '|' + g.x_TokenClass;
    byLine[k] ??= {};
    const who = g.x_Team + '|' + g.x_UseCase;
    byLine[k][who] = (byLine[k][who] || 0) + g.ConsumedQuantity;
    const mk = g.x_Date + '|' + g.x_ModelId;
    byModel[mk] ??= {};
    byModel[mk][who] = (byModel[mk][who] || 0) + (g.ListCost || 0);
  }
  return { byLine, byModel };
}

export function ownerFromTags(row, org) {
  const key = org.allocation.ownerTag;
  if (row.Tags && row.Tags[key]) return { owner: row.Tags[key], method: 'resource-tag' };
  const rg = org.allocation.resourceGroupTags[row.x_ResourceGroupName] || {};
  if (rg[key]) return { owner: rg[key], method: 'inherited-tag' };
  const sub = org.allocation.subscriptionTags[row.SubAccountId] || {};
  if (sub[key]) return { owner: sub[key], method: 'inherited-tag' };
  return { owner: 'unallocated', method: 'unallocated' };
}

function weightsFor(row, ctx) {
  const { org, gw, requests } = ctx;
  if (row.x_TokenDirection && row.x_Deployment) {
    const cls = tokenClassOf(row.x_TokenDirection, row.x_TokenCacheAction);
    const w = gw.byLine[row.x_Date + '|' + row.x_Deployment + '|' + cls];
    if (w && sum(Object.values(w)) > 0) return { method: 'gateway-token-share', weights: w };
  }
  const ccu = org.gateway.ccuLines[row.ResourceId];
  if (ccu) {
    const w = {};
    for (const model of ccu.models) {
      for (const [who, v] of Object.entries(gw.byModel[row.x_Date + '|' + model] || {})) w[who] = (w[who] || 0) + v;
    }
    if (sum(Object.values(w)) > 0) return { method: 'gateway-cost-share', weights: w };
  }
  const pool = row.Tags && row.Tags[org.allocation.poolTag];
  if (pool && org.allocation.pools[pool]) {
    const calls = requests[row.x_Date + '|' + org.gateway.retrievalDeployment] || {};
    const w = {};
    for (const [uc, n] of Object.entries(calls)) w[org.useCases[uc].owner + '|' + uc] = n;
    if (sum(Object.values(w)) > 0) return { method: 'retrieval-call-share', weights: w };
  }
  return null;
}

export function allocate(billed, gatewayRowsList, requests, org) {
  const ctx = { org, gw: indexGateway(gatewayRowsList), requests };
  const rows = [];
  billed.forEach((row, i) => {
    const base = {
      x_Date: row.x_Date, x_Month: row.x_Month, ServiceCategory: row.ServiceCategory, ServiceName: row.ServiceName,
      SubAccountId: row.SubAccountId, x_ResourceGroupName: row.x_ResourceGroupName, ResourceId: row.ResourceId,
      ResourceName: row.ResourceName, x_Deployment: row.x_Deployment, x_ModelId: row.x_ModelId || null,
      x_TokenDirection: row.x_TokenDirection || null, x_TokenCacheAction: row.x_TokenCacheAction || null,
      ConsumedUnit: row.ConsumedUnit, AllocatedResourceId: row.ResourceId, x_SourceRow: i,
    };
    const split = weightsFor(row, ctx);
    if (split) {
      const total = sum(Object.values(split.weights));
      for (const [who, w] of Object.entries(split.weights)) {
        const share = w / total;
        const [owner, useCase] = who.split('|');
        rows.push({ ...base, x_Owner: owner, x_UseCase: useCase, AllocatedMethodId: split.method, AllocatedTags: { owner, 'use-case': useCase },
          x_Share: share, ConsumedQuantity: row.ConsumedQuantity * share, ListCost: row.ListCost * share,
          BilledCost: row.BilledCost * share, EffectiveCost: row.EffectiveCost * share });
      }
    } else {
      const t = ownerFromTags(row, org);
      rows.push({ ...base, x_Owner: t.owner, x_UseCase: (row.Tags && row.Tags['use-case']) || null, AllocatedMethodId: t.method,
        AllocatedTags: { owner: t.owner }, x_Share: 1, ConsumedQuantity: row.ConsumedQuantity, ListCost: row.ListCost,
        BilledCost: row.BilledCost, EffectiveCost: row.EffectiveCost });
    }
  });
  return rows;
}

// Month summary: total, by owner, by method, share with a named owner against Crawl, Walk, Run.
export function allocationSummary(allocated, billed, month, org) {
  const inMonth = allocated.filter((r) => r.x_Month === month);
  const billedTotal = sum(billed.filter((r) => r.x_Month === month).map((r) => r.EffectiveCost));
  const byOwner = {};
  const byMethod = {};
  for (const r of inMonth) {
    byOwner[r.x_Owner] = (byOwner[r.x_Owner] || 0) + r.EffectiveCost;
    byMethod[r.AllocatedMethodId] = (byMethod[r.AllocatedMethodId] || 0) + r.EffectiveCost;
  }
  const allocatedTotal = sum(Object.values(byOwner));
  const unallocated = byOwner.unallocated || 0;
  const owned = allocatedTotal - unallocated;
  const pct = allocatedTotal ? owned / allocatedTotal : 0;
  const t = org.allocation.targets;
  const stage = pct > t.run ? 'Run' : pct >= t.walk ? 'Walk' : pct >= t.crawl ? 'Crawl' : 'below Crawl';
  const unallocatedGroups = {};
  for (const r of inMonth.filter((x) => x.x_Owner === 'unallocated')) unallocatedGroups[r.x_ResourceGroupName] = (unallocatedGroups[r.x_ResourceGroupName] || 0) + r.EffectiveCost;
  return { month, billedTotal, allocatedTotal, byOwner, byMethod, unallocated, owned, ownedPct: pct, stage, targets: t, unallocatedGroups };
}
