// ledger-worker.js: runs the ledger off the main thread so the page stays responsive while about two
// thousand bill rows are parsed, allocated and reconciled.
import { computeFromUrls } from './compute.js';

self.onmessage = async (e) => {
  try {
    const t0 = performance.now();
    const vm = await computeFromUrls(e.data.base);
    self.postMessage({ ok: true, vm, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
