// decision.js: scale, fix or stop for each use case, from AVOIDABLE cost per successful outcome (the
// cost that stops if the use case stops; a fixed shared tier does not) against an illustrative value
// per outcome (data/value.json) and the owner's quality bar.
//   stop   value per outcome is at or below cost per outcome (value / cost <= stopBelowValueToCost)
//   fix    value is under scaleFromValueToCost times cost, or the success rate is below the bar
//   scale  otherwise
// The thresholds live in data/org.json so an owner can change them in one place.

export function valuePerOutcome(v) { return v.minutesSaved * v.loadedCostPerMinute; }

export function decide({ costPerSuccess, valuePerSuccess, successRate, qualityBar }, rules) {
  const reasons = [];
  if (costPerSuccess === null || costPerSuccess === undefined) return { decision: 'fix', ratio: null, reasons: ['no successful outcomes this month'] };
  const ratio = costPerSuccess > 0 ? valuePerSuccess / costPerSuccess : Infinity;
  if (ratio <= rules.stopBelowValueToCost) {
    reasons.push('cost per successful outcome is at or above its value');
    if (successRate < qualityBar) reasons.push('success rate is below the quality bar');
    return { decision: 'stop', ratio, reasons };
  }
  if (successRate < qualityBar) reasons.push('success rate is below the quality bar');
  if (ratio < rules.scaleFromValueToCost) reasons.push('value is less than three times cost');
  if (reasons.length) return { decision: 'fix', ratio, reasons };
  return { decision: 'scale', ratio, reasons: ['value well above cost and quality bar met'] };
}

export function decideAll(ue, values, org) {
  const out = {};
  for (const [uc, u] of Object.entries(ue)) {
    const v = values.useCases[uc];
    const value = valuePerOutcome(v);
    out[uc] = { useCase: uc, valuePerSuccess: value, assumption: v.assumption, qualityBar: v.qualityBar, qualityBarText: v.qualityBarText,
      basis: 'avoidable', avoidableCostPerSuccess: u.avoidableCostPerSuccess, loadedCostPerSuccess: u.costPerSuccess,
      ...decide({ costPerSuccess: u.avoidableCostPerSuccess, valuePerSuccess: value, successRate: u.successRate, qualityBar: v.qualityBar }, org.decision) };
  }
  return out;
}
