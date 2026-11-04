// Small hand-built inputs for the unit tests. Every expected value in the tests is worked out by
// hand in a comment next to the assertion.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const prices = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'data', 'prices.json'), 'utf8'));

export const D = '2026-10-05';
export const CCU_ID = '/sub/x/ccu';

export const org = {
  owners: { 'customer-ops': 'Customer Operations', fincrime: 'Financial Crime', 'fraud-analytics': 'Fraud Analytics', engineering: 'Engineering', unallocated: 'Unallocated' },
  useCases: {
    'support-assistant': { name: 'Support assistant', owner: 'customer-ops', outcomeNoun: 'accepted draft' },
    'kyc-review': { name: 'KYC document review', owner: 'fincrime', outcomeNoun: 'approved summary' },
    'knowledge-assistant': { name: 'Internal knowledge assistant', owner: 'engineering', outcomeNoun: 'useful answer' },
  },
  gateway: { ccuLines: { [CCU_ID]: { models: ['claude-sonnet-5.5'] } }, retrievalDeployment: 'embed' },
  allocation: {
    ownerTag: 'owner', poolTag: 'cost-pool', pools: { 'shared-ai-platform': { method: 'retrieval-call-share' } },
    resourceGroupTags: { 'rg-platform': { owner: 'engineering' }, 'rg-obs': {}, 'rg-ai': {} },
    subscriptionTags: { 'sub-a': {} },
    targets: { crawl: 0.70, walk: 0.85, run: 0.90 },
  },
  decision: { stopBelowValueToCost: 1, scaleFromValueToCost: 3 },
};

// A billed row in the normalised (FOCUS 1.4) shape.
export function bill(o) {
  return {
    x_Date: o.date || D, x_Month: (o.date || D).slice(0, 7), ServiceCategory: o.category || 'AI and Machine Learning',
    ServiceName: o.service || 'Azure OpenAI', SubAccountId: o.sub || 'sub-a', x_ResourceGroupName: o.rg || 'rg-ai',
    ResourceId: o.id || '/sub/x/' + (o.dep || o.name), ResourceName: o.name || o.dep, x_Deployment: o.dep || null,
    x_ModelId: o.model || null, x_TokenDirection: o.dir || null, x_TokenCacheAction: o.cache || (o.dir ? 'Uncached' : null),
    ConsumedQuantity: o.qty || 0, ConsumedUnit: o.unit || (o.dir ? 'Tokens' : 'Hours'), ListUnitPrice: o.unitPrice ?? null,
    ListCost: o.list ?? o.cost, BilledCost: o.cost, EffectiveCost: o.cost, Tags: o.tags || {},
  };
}

// A gateway estimate row in the shape normalise.gatewayRows() produces.
export function gwRow(o) {
  const date = o.date || D;
  return {
    x_Date: date, x_Month: date.slice(0, 7), ServiceCategory: 'AI and Machine Learning', ConsumedQuantity: o.qty, ConsumedUnit: 'Tokens',
    x_TokenDirection: o.cls === 'output' ? 'Output' : 'Input', x_TokenCacheAction: o.cls === 'cachedInput' ? 'Read' : o.cls === 'cacheWrite' ? 'Write' : 'Uncached',
    x_TokenClass: o.cls, x_ModelId: o.model, x_Deployment: o.dep, x_Team: o.team, x_UseCase: o.uc, x_Environment: 'prod',
    ListUnitPrice: o.unit ?? null, ListCost: o.list ?? null,
  };
}
