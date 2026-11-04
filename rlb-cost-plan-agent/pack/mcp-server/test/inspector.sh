#!/usr/bin/env bash
# The MCP Inspector CLI (a client independent of this repository's tests) against the server,
# over Streamable HTTP and over stdio. Needs Node 22.19 or later for the Inspector.
# Usage (from mcp-server/): bash test/inspector.sh [output-dir]
# INSPECTOR overrides the command (default: npx -y @modelcontextprotocol/inspector@2.13.0).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-}"
INSPECTOR="${INSPECTOR:-npx -y @modelcontextprotocol/inspector@2.13.0}"
export MCP_CATALOG_PATH="$(mktemp -t inspector-catalog.XXXXXX).json"   # keep the Inspector's catalog out of $HOME
TOKEN="inspector-demo-token-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
LOG="$(mktemp -t costplan-insp.XXXXXX)"
PORT=0 MCP_BEARER_TOKEN="$TOKEN" LOG_REQUESTS=0 node server/http.js >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true; rm -f "$LOG" "$MCP_CATALOG_PATH"' EXIT
for _ in $(seq 1 50); do grep -q "listening on" "$LOG" && break; sleep 0.1; done
URL="$(grep -o 'http://[^ ]*' "$LOG" | head -1)"
H=(--transport http --header "Authorization: Bearer $TOKEN")
save() { if [ -n "$OUT" ]; then tee "$OUT/$1"; else cat; fi; }

echo "## Inspector $($INSPECTOR --cli --version 2>/dev/null || echo '(version not printed)') against $URL"
echo; echo "## tools/list --strict (schema portability check), Streamable HTTP"
$INSPECTOR --cli "$URL" "${H[@]}" --method tools/list --strict | save inspector-tools-list.json
echo; echo "## tools/call rebase_rate, Streamable HTTP"
$INSPECTOR --cli "$URL" "${H[@]}" --method tools/call --tool-name rebase_rate \
  --tool-arg rate=2000 from_month=2021-12 to_month=2026-06 series=all_new_work from_location_factor=1 to_location_factor=1 | save inspector-rebase-rate.json
echo; echo "## tools/call check_cost_plan PLAN-OFF-01, Streamable HTTP"
$INSPECTOR --cli "$URL" "${H[@]}" --method tools/call --tool-name check_cost_plan --tool-arg plan_id=PLAN-OFF-01 | save inspector-check-cost-plan.json
echo; echo "## resources/read nrm1://group-elements, Streamable HTTP"
$INSPECTOR --cli "$URL" "${H[@]}" --method resources/read --uri nrm1://group-elements | save inspector-resource.json
echo; echo "## tools/list over stdio"
$INSPECTOR --cli node server/stdio.js --method tools/list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(JSON.stringify(j.tools.map(t=>t.name)))})' | save inspector-stdio-tools.json
