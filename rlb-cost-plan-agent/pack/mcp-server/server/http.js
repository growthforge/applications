#!/usr/bin/env node
// @ts-check
/**
 * Streamable HTTP entry point (the transport Copilot Studio uses). One endpoint, POST /mcp,
 * stateless: a fresh server instance per request, so it scales out without sticky sessions.
 * Serves MCP 2026-07-28 and, from the same factory, 2025-era clients that start with initialize.
 *
 * Order of checks on every /mcp request, cheapest first, before the body is read:
 *   Host allowlist (DNS rebinding) -> Origin allowlist (browsers) -> bearer token -> rate limit
 *   per authenticated principal -> body size limit -> MCP handler.
 * The rate limit runs after authentication, so an unauthenticated request is refused without
 * using anyone's allowance, and it is keyed on the principal (a hash of the token), not on the
 * client address. Client addresses, and X-Forwarded-For behind Container Apps ingress, are not
 * used: if an address-based limit is ever added behind ingress, read X-Forwarded-For only when
 * a trusted-proxy setting says the last hop is the platform's own proxy.
 *
 * Environment:
 *   PORT                   default 3000 (0 picks a free port)
 *   HOST                   default 127.0.0.1 (0.0.0.0 inside a container)
 *   MCP_BEARER_TOKEN       required unless MCP_ALLOW_NO_AUTH=1 on a loopback HOST; at least 32 characters.
 *                          Several tokens may be given, comma separated (one per test client); each is
 *                          its own principal for the rate limit
 *   MCP_ALLOW_NO_AUTH      1 to run without a token, loopback only (for the Inspector on a laptop)
 *   API_KEY_HEADER         header that may carry the same token instead of Authorization (default x-api-key),
 *                          for Copilot Studio's "API key, header" connection option
 *   ALLOWED_HOSTS          extra Host names, comma separated (for example the Container Apps FQDN)
 *   ALLOWED_ORIGINS        browser Origin host names allowed to call, comma separated (default none)
 *   MAX_BODY_BYTES         default 262144
 *   RATE_LIMIT_PER_MINUTE  per authenticated principal, default 120
 *   DATA_DIR               another data folder with the same layout (see server/load.js)
 * Logs one line per request (method, path, MCP method and tool name, status, duration).
 * Arguments and results are never logged.
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createMcpHandler, verifyBearerToken, bearerAuthChallengeResponse,
  validateHostHeader, validateOriginHeader, localhostAllowedHostnames,
} from '@modelcontextprotocol/server';
import { toWebRequest } from '@modelcontextprotocol/node';
import { loadToolkit } from './load.js';
import { createServerFactory } from './mcp.js';
import { staticTokenVerifier, DEMO_SCOPE, MIN_TOKEN_LENGTH } from './auth.js';

export const MCP_PATH = '/mcp';

/** @param {string | undefined} v */
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * @param {Record<string, string | undefined>} env
 */
export function configFromEnv(env) {
  const host = env.HOST || '127.0.0.1';
  const tokens = list(env.MCP_BEARER_TOKEN);
  const noAuth = env.MCP_ALLOW_NO_AUTH === '1';
  if (!tokens.length && !(noAuth && LOOPBACK.has(host))) {
    throw new Error('Refusing to start: set MCP_BEARER_TOKEN (32+ characters), or MCP_ALLOW_NO_AUTH=1 with a loopback HOST for local testing.');
  }
  if (tokens.some((t) => t.length < MIN_TOKEN_LENGTH)) {
    throw new Error(`Refusing to start: every MCP_BEARER_TOKEN value must be at least ${MIN_TOKEN_LENGTH} characters.`);
  }
  return {
    port: env.PORT === undefined ? 3000 : Number(env.PORT),
    host,
    tokens,
    allowedHosts: [...localhostAllowedHostnames(), ...list(env.ALLOWED_HOSTS)],
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    maxBody: Number(env.MAX_BODY_BYTES || 262144),
    ratePerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 120),
    dataDir: env.DATA_DIR,
    apiKeyHeader: (env.API_KEY_HEADER || 'x-api-key').toLowerCase(),
  };
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

/**
 * @param {http.ServerResponse} res
 * @param {Response} response
 */
async function sendWeb(res, response) {
  /** @type {Record<string, string>} */
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  headers['cache-control'] = headers['cache-control'] || 'no-store';
  res.writeHead(response.status, headers);
  if (response.body) {
    for await (const chunk of /** @type {any} */ (response.body)) res.write(chunk);
  }
  res.end();
}

/**
 * Start the HTTP server. Resolves once it is listening.
 * @param {ReturnType<typeof configFromEnv>} cfg
 */
export async function startHttpServer(cfg) {
  const toolkit = loadToolkit(cfg.dataDir);
  const handler = createMcpHandler(createServerFactory(toolkit), { maxRequestBodySize: cfg.maxBody });
  const verifier = cfg.tokens.length ? staticTokenVerifier(cfg.tokens) : null;
  /** @type {Map<string, { start: number, count: number }>} */
  const windows = new Map();

  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    const url = new URL(req.url || '/', 'http://localhost');
    let status = 0;
    const done = (/** @type {number} */ s) => { status = s; };
    try {
      if (url.pathname === '/healthz' && req.method === 'GET') {
        done(200); return sendJson(res, 200, { status: 'ok', name: toolkit.name, version: toolkit.version });
      }
      if (url.pathname !== MCP_PATH) { done(404); return sendJson(res, 404, { error: 'not_found' }); }

      const hostCheck = validateHostHeader(req.headers.host, cfg.allowedHosts);
      if (!hostCheck.ok) { done(403); return sendJson(res, 403, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Host not allowed' } }); }
      const originCheck = validateOriginHeader(/** @type {string | undefined} */ (req.headers.origin), cfg.allowedOrigins);
      if (!originCheck.ok) { done(403); return sendJson(res, 403, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Origin not allowed' } }); }

      /** @type {any} */
      let authInfo;
      if (verifier) {
        try {
          // Copilot Studio's API key option sends the key in a named header; accept it as the bearer token.
          const apiKey = req.headers[cfg.apiKeyHeader];
          const header = req.headers.authorization || (typeof apiKey === 'string' && apiKey ? `Bearer ${apiKey}` : undefined);
          authInfo = await verifyBearerToken(header, { verifier, requiredScopes: [DEMO_SCOPE] });
        } catch (e) {
          const r = bearerAuthChallengeResponse(e, { requiredScopes: [DEMO_SCOPE] });
          done(r.status); return await sendWeb(res, r);
        }
      }

      // Rate limit per authenticated principal (a hash of the token, never the token itself).
      const who = authInfo ? createHash('sha256').update(authInfo.token).digest('hex').slice(0, 16) : 'unauthenticated-loopback';
      const now = Date.now();
      const w = windows.get(who);
      if (!w || now - w.start >= 60000) windows.set(who, { start: now, count: 1 });
      else if (++w.count > cfg.ratePerMinute) {
        done(429); return sendJson(res, 429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit exceeded' } }, { 'retry-after': String(Math.ceil((60000 - (now - w.start)) / 1000)) });
      }

      let request;
      try {
        request = await toWebRequest(req, undefined, { maxRequestBodySize: cfg.maxBody });
      } catch (e) {
        const tooBig = /** @type {any} */ (e).status === 413;
        done(tooBig ? 413 : 400);
        return sendJson(res, tooBig ? 413 : 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: tooBig ? 'Request body too large' : 'Unreadable request body' } });
      }
      const response = await handler.fetch(request, { authInfo });
      done(response.status);
      return await sendWeb(res, response);
    } catch (e) {
      done(500);
      if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
      else res.end();
      console.error(`error ${/** @type {Error} */ (e).message}`);
    } finally {
      const line = {
        t: new Date().toISOString(), method: req.method, path: url.pathname, status,
        mcp: req.headers['mcp-method'] || undefined, name: req.headers['mcp-name'] || undefined, ms: Date.now() - t0,
      };
      if (process.env.LOG_REQUESTS !== '0') console.log(JSON.stringify(line));
    }
  });

  await new Promise((resolve) => server.listen(cfg.port, cfg.host, () => resolve(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
  const shownHost = cfg.host.includes(':') ? `[${cfg.host}]` : cfg.host;
  return {
    url: `http://${shownHost}:${addr.port}${MCP_PATH}`,
    port: addr.port,
    toolkit,
    close: async () => { await handler.close(); await new Promise((r) => server.close(() => r(undefined))); },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let cfg;
  try { cfg = configFromEnv(process.env); } catch (e) { console.error(/** @type {Error} */ (e).message); process.exit(2); }
  const s = await startHttpServer(cfg);
  console.log(`cost-plan-check ${s.toolkit.version} listening on ${s.url} (${cfg.tokens.length ? 'bearer token required' : 'no auth, loopback only'})`);
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
