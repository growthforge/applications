#!/usr/bin/env bash
# Raw JSON-RPC with curl against a locally started server: no SDK involved.
# Starts the server on a free port with a throwaway token, runs the calls, stops the server.
# Usage (from mcp-server/): bash test/curl.sh
set -euo pipefail
cd "$(dirname "$0")/.."
TOKEN="curl-demo-token-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
LOG="$(mktemp -t costplan-curl.XXXXXX)"
PORT=0 MCP_BEARER_TOKEN="$TOKEN" LOG_REQUESTS=0 node server/http.js >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -f "$LOG"' EXIT
for _ in $(seq 1 50); do grep -q "listening on" "$LOG" && break; sleep 0.1; done
URL="$(grep -o 'http://[^ ]*' "$LOG" | head -1)"
echo "server: $URL"
META='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"8"},"io.modelcontextprotocol/clientCapabilities":{}}'
CT=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
AUTH=(-H "authorization: Bearer $TOKEN")
MODERN=(-H 'mcp-protocol-version: 2026-07-28')
STATUS=(-w '\n< HTTP %{http_code}\n')
# Prints only the parts of a tools/call result a reader needs: figure, status, basis.
brief() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=s.lastIndexOf("\n< ");const j=JSON.parse(s.slice(0,i));const r=j.result;console.log(JSON.stringify(r.isError?{isError:true,text:r.content[0].text}:{figure:r.structuredContent.figure,status:r.structuredContent.status,basis:r.structuredContent.basis},null,1));console.log(s.slice(i+1).trim())})'; }

echo; echo "### GET /healthz"
curl -sS "${URL%/mcp}/healthz" "${STATUS[@]}"

echo; echo "### tools/list without a token: refused with a Bearer challenge"
curl -sS -i -X POST "$URL" "${CT[@]}" "${MODERN[@]}" -H 'mcp-method: tools/list' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{$META}}" | grep -i '^HTTP\|^www-authenticate'

echo; echo "### server/discover (2026-07-28)"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" "${MODERN[@]}" -H 'mcp-method: server/discover' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"server/discover\",\"params\":{$META}}" "${STATUS[@]}" | cut -c1-500

echo; echo "### tools/call rebase_rate (2026-07-28): the worked ONS example"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" "${MODERN[@]}" -H 'mcp-method: tools/call' -H 'mcp-name: rebase_rate' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"rebase_rate\",\"arguments\":{\"rate\":2000,\"from_month\":\"2021-12\",\"to_month\":\"2026-06\",\"series\":\"all_new_work\",\"from_location_factor\":1,\"to_location_factor\":1},$META}}" \
  "${STATUS[@]}" | brief

echo; echo "### tools/call rebase_rate with a percentage: refused as a tool error"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" "${MODERN[@]}" -H 'mcp-method: tools/call' -H 'mcp-name: rebase_rate' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"rebase_rate\",\"arguments\":{\"rate\":14,\"unit\":\"percent\",\"from_month\":\"2021-12\",\"to_month\":\"2026-06\",\"from_location_factor\":1,\"to_location_factor\":1},$META}}" \
  "${STATUS[@]}" | brief

echo; echo "### Legacy era: initialize (2025-11-25)"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl-legacy","version":"8"}}}' \
  "${STATUS[@]}" | cut -c1-300

echo; echo "### Legacy era: a stateless tools/call check_cost_plan PLAN-SCH-02 (summary only)"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -H 'mcp-protocol-version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_cost_plan","arguments":{"plan_id":"PLAN-SCH-02"}}}' \
  "${STATUS[@]}" | grep -o '"summary":{[^}]*}\|< HTTP [0-9]*'

echo; echo "### A request from a web page origin: refused"
curl -sS -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -H 'origin: https://evil.example' -d '{}' "${STATUS[@]}"
