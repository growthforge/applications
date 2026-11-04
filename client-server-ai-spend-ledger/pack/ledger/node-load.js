// node-load.js: read the committed data files from disk for Node (tests and the prerender).
// The browser loads the same files with fetch (assets/app.js); the engine itself never does IO.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function loadData(dir = DATA_DIR) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  return {
    focus: read('focus_export.csv'),
    tokens: read('token_metrics.csv'),
    outcomes: read('outcomes.csv'),
    vm: read('vm_utilisation.csv'),
    prices: JSON.parse(read('prices.json')),
    org: JSON.parse(read('org.json')),
    values: JSON.parse(read('value.json')),
    levers: JSON.parse(read('levers.json')),
  };
}
