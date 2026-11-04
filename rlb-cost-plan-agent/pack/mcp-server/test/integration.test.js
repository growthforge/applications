// Integration tests: the real server process over Streamable HTTP (and stdio), called by
//   1. the TypeScript SDK v2 client negotiating the current protocol (2026-07-28),
//   2. the same client in its legacy mode (2025-11-25 initialize handshake),
//   3. the v1 SDK client (@modelcontextprotocol/sdk 1.32.2), a genuine 2025-era client,
//   4. raw JSON-RPC over fetch, both eras,
//   5. the SDK v2 client over stdio,
// plus the HTTP security boundary (token, Host, Origin, methods, body size, rate limit).
// Every structured result over the wire must equal the shared core's own result.
// Run: node --test test/integration.test.js   (EMIT_DIR=<dir> saves a per-client summary)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client as ClientV2, StreamableHTTPClientTransport as HttpV2 } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client as ClientV1 } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as HttpV1 } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadToolkit } from '../server/load.js';
import { startServerProcess, TOKEN, ROOT } from './helpers.js';

const tk = loadToolkit();
const AUTH = { authorization: `Bearer ${TOKEN}` };
const CALLS = [
  ['rebase_rate', { rate: 2000, from_month: '2021-12', to_month: '2026-06', series: 'all_new_work', from_location_factor: 1, to_location_factor: 1 }],
  ['check_cost_plan', { plan_id: 'PLAN-OFF-01' }],
  ['get_benchmark', { building_type: 'office', nrm1_group: 2, location_factor: 1, to_month: '2026-06' }],
];
const summary = [];
let srv;

test.before(async () => { srv = await startServerProcess(); });
test.after(async () => {
  await srv.stop();
  if (process.env.EMIT_DIR) fs.writeFileSync(path.join(process.env.EMIT_DIR, 'integration-clients.json'), JSON.stringify(summary, null, 2) + '\n');
});

/** Shared assertions for any connected client (v1 and v2 share this surface). */
async function exercise(client, label, protocol) {
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), ['check_cost_plan', 'get_benchmark', 'rebase_rate']);
  const resources = await client.listResources();
  assert.equal(resources.resources[0].uri, 'nrm1://group-elements');
  const res = await client.readResource({ uri: 'nrm1://group-elements' });
  assert.equal(JSON.parse(res.contents[0].text).groups.length, 15);
  const calls = [];
  for (const [name, args] of CALLS) {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${label} ${name}: ${JSON.stringify(r.content).slice(0, 300)}`);
    const core = tk.call(name, args);
    assert.deepEqual(r.structuredContent, core.structured, `${label} ${name}: wire result equals core result`);
    assert.equal(r.content[0].text, core.text, `${label} ${name}: text content equals core text`);
    assert.match(r.content[0].text, /Basis: /);
    assert.match(r.content[0].text, /Status: /);
    assert.deepEqual(JSON.parse(r.content[1].text), core.structured, `${label} ${name}: JSON text block equals structured content`);
    calls.push(name);
  }
  // A refusal comes back as a tool error the model can read, not a protocol error.
  const refusal = await client.callTool({ name: 'rebase_rate', arguments: { rate: 14, from_month: '2021-12', to_month: '2026-06', from_location_factor: 1, to_location_factor: 1, unit: 'percent' } });
  assert.equal(refusal.isError, true);
  assert.match(refusal.content[0].text, /^Refused \(percentage_addition\)/);
  // Arguments that break the schema are stopped by the SDK before the tool runs.
  const invalid = await client.callTool({ name: 'rebase_rate', arguments: { rate: 2000, from_month: '2021-12', to_month: '2026-06' } });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /from_location_factor/);
  summary.push({ client: label, protocol, tools: tools.tools.length, resources: resources.resources.length, calls, refusal: 'isError', invalid_arguments: 'isError' });
}

test('SDK v2 client, current protocol (auto negotiation)', async () => {
  const c = new ClientV2({ name: 'it-v2-auto', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await c.connect(new HttpV2(new URL(srv.url), { requestInit: { headers: AUTH } }));
  assert.equal(c.getNegotiatedProtocolVersion(), '2026-07-28');
  await exercise(c, '@modelcontextprotocol/client 2.4.0 (auto)', c.getNegotiatedProtocolVersion());
  await c.close();
});

test('SDK v2 client, legacy mode (2025-11-25 initialize)', async () => {
  const c = new ClientV2({ name: 'it-v2-legacy', version: '1.0.0' }, { versionNegotiation: { mode: 'legacy' } });
  await c.connect(new HttpV2(new URL(srv.url), { requestInit: { headers: AUTH } }));
  assert.equal(c.getNegotiatedProtocolVersion(), '2025-11-25');
  await exercise(c, '@modelcontextprotocol/client 2.4.0 (legacy)', c.getNegotiatedProtocolVersion());
  await c.close();
});

test('SDK v1 client (@modelcontextprotocol/sdk 1.32.2)', async () => {
  const c = new ClientV1({ name: 'it-v1', version: '1.0.0' });
  const transport = new HttpV1(new URL(srv.url), { requestInit: { headers: AUTH } });
  await c.connect(transport);
  assert.equal(c.getServerVersion().name, 'cost-plan-check');
  const protocol = transport.protocolVersion || 'initialize handshake (v1)';
  await exercise(c, '@modelcontextprotocol/sdk 1.32.2', protocol);
  await c.close();
});

test('SDK v2 client over stdio', async () => {
  const c = new ClientV2({ name: 'it-stdio', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'server/stdio.js')], cwd: ROOT, stderr: 'pipe' }));
  await exercise(c, '@modelcontextprotocol/client 2.4.0 over stdio', c.getNegotiatedProtocolVersion());
  await c.close();
});

/** Read a JSON-RPC response body that may be JSON or a one-event SSE stream. */
async function rpcBody(res) {
  const text = await res.text();
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'raw-fetch', version: '1.0.0' }, 'io.modelcontextprotocol/clientCapabilities': {} };
const modernHeaders = (method, name) => ({ ...AUTH, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(name ? { 'mcp-name': name } : {}) });

test('raw JSON-RPC over fetch, current protocol (no handshake, one POST per request)', async () => {
  const list = await fetch(srv.url, { method: 'POST', headers: modernHeaders('tools/list'), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META } }) });
  assert.equal(list.status, 200);
  const l = await rpcBody(list);
  assert.equal(l.result.tools.length, 3);
  const args = CALLS[0][1];
  const callRes = await fetch(srv.url, { method: 'POST', headers: modernHeaders('tools/call', 'rebase_rate'), body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'rebase_rate', arguments: args, _meta: META } }) });
  const c = await rpcBody(callRes);
  assert.deepEqual(c.result.structuredContent, tk.call('rebase_rate', args).structured);
  assert.equal(c.result.structuredContent.figure.value, 2479.87);
  summary.push({ client: 'raw fetch JSON-RPC', protocol: '2026-07-28', tools: l.result.tools.length, calls: ['rebase_rate'] });
});

test('raw JSON-RPC over fetch, legacy era (initialize, then a stateless tools/call)', async () => {
  const headers = { ...AUTH, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const init = await fetch(srv.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'raw-legacy', version: '1.0.0' } } }) });
  const i = await rpcBody(init);
  assert.equal(i.result.protocolVersion, '2025-11-25');
  assert.equal(i.result.serverInfo.name, 'cost-plan-check');
  const call = await fetch(srv.url, { method: 'POST', headers: { ...headers, 'mcp-protocol-version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'check_cost_plan', arguments: { plan_id: 'PLAN-SCH-02' } } }) });
  const c = await rpcBody(call);
  assert.equal(c.result.structuredContent.summary.items_for_review, 3);
  summary.push({ client: 'raw fetch JSON-RPC', protocol: '2025-11-25', calls: ['initialize', 'check_cost_plan'] });
});

test('HTTP boundary: token, Host, Origin, methods, paths and body size', async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META } });
  const base = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' };
  const noToken = await fetch(srv.url, { method: 'POST', headers: base, body });
  assert.equal(noToken.status, 401);
  assert.match(noToken.headers.get('www-authenticate') || '', /^Bearer /);
  const wrong = await fetch(srv.url, { method: 'POST', headers: { ...base, authorization: 'Bearer not-the-token' }, body });
  assert.equal(wrong.status, 401);
  const apiKey = await fetch(srv.url, { method: 'POST', headers: { ...base, 'x-api-key': TOKEN }, body });
  assert.equal(apiKey.status, 200, 'the token is also accepted in the x-api-key header (Copilot Studio API key option)');
  const wrongKey = await fetch(srv.url, { method: 'POST', headers: { ...base, 'x-api-key': 'nope' }, body });
  assert.equal(wrongKey.status, 401);
  const origin = await fetch(srv.url, { method: 'POST', headers: { ...base, ...AUTH, origin: 'https://evil.example' }, body });
  assert.equal(origin.status, 403);
  const { request } = await import('node:http');
  const hostStatus = await new Promise((resolve, reject) => {
    const u = new URL(srv.url);
    const req = request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { ...base, ...AUTH, host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(body);
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(srv.url, { method: 'GET', headers: { ...AUTH, accept: 'text/event-stream' } })).status, 405);
  assert.equal((await fetch(srv.url, { method: 'DELETE', headers: AUTH })).status, 405);
  assert.equal((await fetch(srv.url.replace('/mcp', '/admin'), { headers: AUTH })).status, 404);
  const health = await fetch(srv.url.replace('/mcp', '/healthz'));
  assert.equal(health.status, 200);
  const big = 'x'.repeat(300 * 1024);
  const tooBig = await fetch(srv.url, { method: 'POST', headers: { ...base, ...AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META, pad: big } }) });
  assert.equal(tooBig.status, 413);
  summary.push({ client: 'HTTP boundary', checks: ['401 without token', '401 wrong token', '200 token in x-api-key', '401 wrong x-api-key', '403 Origin', '403 Host', '405 GET', '405 DELETE', '404 path', '200 healthz', '413 body over 256 KiB'] });
});

test('HTTP boundary: rate limit per authenticated principal, after authentication', async () => {
  const TOKEN2 = 'second-test-token-for-another-client-0123456789';
  const limited = await startServerProcess({ RATE_LIMIT_PER_MINUTE: '3', MCP_BEARER_TOKEN: `${TOKEN},${TOKEN2}` });
  const send = async (token, i) => {
    const h = { ...modernHeaders('tools/list'), authorization: `Bearer ${token}` };
    const r = await fetch(limited.url, { method: 'POST', headers: h, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/list', params: { _meta: META } }) });
    await r.arrayBuffer();
    return r.status;
  };
  try {
    // Unauthenticated requests are refused before the limiter, so they use no allowance.
    const bad = [await send('not-a-valid-token', 1), await send('not-a-valid-token', 2), await send('not-a-valid-token', 3), await send('not-a-valid-token', 4)];
    assert.deepEqual(bad, [401, 401, 401, 401]);
    // The first principal gets three calls a minute, then 429.
    const first = [];
    for (let i = 0; i < 4; i++) first.push(await send(TOKEN, 10 + i));
    assert.deepEqual(first, [200, 200, 200, 429]);
    // A second principal from the same address has its own allowance: the key is the token, not the address.
    assert.equal(await send(TOKEN2, 20), 200);
    summary.push({ client: 'HTTP boundary', checks: ['401s use no allowance', '429 after the per-minute limit for one principal', '200 for a second principal from the same address'] });
  } finally {
    await limited.stop();
  }
});

test('the server refuses to start without a token unless it is loopback-only and told so', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = { ...process.env, PORT: '0', MCP_BEARER_TOKEN: '', HOST: '0.0.0.0' };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server/http.js')], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Refusing to start/);
  const short = spawnSync(process.execPath, [path.join(ROOT, 'server/http.js')], { env: { ...env, MCP_BEARER_TOKEN: 'short' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(short.status, 2);
  assert.match(short.stderr, /at least 32 characters/);
  const oneShort = spawnSync(process.execPath, [path.join(ROOT, 'server/http.js')], { env: { ...env, MCP_BEARER_TOKEN: `${TOKEN},short` }, encoding: 'utf8', timeout: 10000 });
  assert.equal(oneShort.status, 2);
});
