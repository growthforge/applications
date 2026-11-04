// @ts-check
/**
 * Reads the bundled data from disk once, at start-up, and builds the toolkit. Tools never
 * touch the file system or the network after this point.
 *
 * DATA_DIR (optional) points at another data folder with the same layout:
 *   series/*.json   index collections (ONS by default; add a firm's own tender price index here)
 *   benchmarks.json the benchmark set
 *   plans/*.json    the plan store (in production this is replaced by a read from SharePoint
 *                   or the cost system with the user's identity; see README)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToolkit } from '../core/toolkit.js';

export const DEFAULT_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

/** @param {string} file */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** @param {string} dir */
function jsonFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

/** @param {string} [dataDir] */
export function loadData(dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR) {
  return {
    seriesCollections: jsonFiles(path.join(dataDir, 'series')).map(readJson),
    benchmarks: readJson(path.join(dataDir, 'benchmarks.json')),
    plans: jsonFiles(path.join(dataDir, 'plans')).map(readJson),
  };
}

/** @param {string} [dataDir] */
export function loadToolkit(dataDir) {
  return createToolkit(loadData(dataDir));
}
