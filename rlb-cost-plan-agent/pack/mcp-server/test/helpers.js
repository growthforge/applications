// Test helpers: start the real server as a child process and wait for its address.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKEN = 'test-token-only-for-the-local-test-run-0123456789';

/**
 * Spawn `node server/http.js` on a free port and resolve with its MCP URL.
 * @param {Record<string, string>} env extra environment
 */
export function startServerProcess(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server/http.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: '0', MCP_BEARER_TOKEN: TOKEN, LOG_REQUESTS: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`server did not start: ${out}`)); }, 15000);
    const onData = (d) => {
      out += d;
      const m = /listening on (http:\/\/\S+)/.exec(out);
      if (m) { clearTimeout(timer); resolve({ url: m[1], child, stop: () => new Promise((r) => { child.once('exit', r); child.kill('SIGTERM'); }) }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); if (!/listening on/.test(out)) reject(new Error(`server exited ${code}: ${out}`)); });
  });
}

/** Walk a JSON Schema and report anything Copilot Studio's MCP connector is known to mishandle. */
export function schemaProblems(schema, where = '$', isInput = true) {
  const out = [];
  const FORBIDDEN = ['$ref', '$defs', 'definitions', 'exclusiveMinimum', 'exclusiveMaximum', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else', 'patternProperties', 'dependentSchemas', 'prefixItems'];
  if (!schema || typeof schema !== 'object') return [`${where}: not an object`];
  for (const k of FORBIDDEN) if (k in schema) out.push(`${where}: uses ${k}`);
  if (Array.isArray(schema.type)) out.push(`${where}: type is an array (${schema.type.join(', ')})`);
  if (typeof schema.type !== 'string') out.push(`${where}: has no single type`);
  if (schema.type === 'null') out.push(`${where}: null type`);
  if ('enum' in schema) {
    if (schema.type !== 'string') out.push(`${where}: enum on a ${schema.type}`);
    if (!Array.isArray(schema.enum) || !schema.enum.every((v) => typeof v === 'string')) out.push(`${where}: enum values must be strings`);
  }
  if (schema.type === 'object') {
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (isInput && !sub.description) out.push(`${where}.${k}: no description`);
      out.push(...schemaProblems(sub, `${where}.${k}`, isInput));
    }
  }
  if (schema.type === 'array') {
    if (!schema.items) out.push(`${where}: array without items`);
    else out.push(...schemaProblems(schema.items, `${where}[]`, isInput));
  }
  return out;
}
