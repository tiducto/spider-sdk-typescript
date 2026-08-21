#!/usr/bin/env bash
# Regenerate the routing wire types from the wire contract.
#
# Single source of truth for contract codegen — the generate-contract workflow just calls this, so local
# and CI runs produce the same output. The generated interfaces are committed on purpose: the module
# carries the types, not the spec, and there is no codegen step in the SDK's own build.
#
# Types come from spider-codegen (tiducto/spider-codegen) — our own generator — NOT any third-party
# OpenAPI generator. Mirrors spider-sdk-kotlin's scripts/generate-contract.sh.
#
# Usage:
#   scripts/generate-contract.sh                      # fetch main from the contract repo
#   scripts/generate-contract.sh --ref v1.2.0         # a specific ref/tag/branch
#   scripts/generate-contract.sh --spec path/to.json  # a local spec, no fetch
#
# CONTRACT_REPO_TOKEN reads the private contract + codegen repos (CI); locally falls back to ambient `gh` auth.
# CODEGEN_REF pins the spider-codegen ref (default below); CODEGEN_DIR points at a local checkout to skip the clone.
set -euo pipefail

CONTRACT_REPO="${CONTRACT_REPO:-tiducto/spider-contract}"
CONTRACT_REF="main"
CODEGEN_REPO="${CODEGEN_REPO:-tiducto/spider-codegen}"
CODEGEN_REF="${CODEGEN_REF:-master}"
LOCAL_SPEC=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ref) CONTRACT_REF="$2"; shift 2 ;;
        --spec) LOCAL_SPEC="$2"; shift 2 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTING_DIR="$REPO_ROOT/src/contract/routing"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [[ -n "$LOCAL_SPEC" ]]; then
    echo "==> Using local spec: $LOCAL_SPEC"
    cp "$LOCAL_SPEC" "$WORK_DIR/openapi.json"
else
    echo "==> Fetching dist/routing-openapi.json from $CONTRACT_REPO@$CONTRACT_REF"
    GH_TOKEN="${CONTRACT_REPO_TOKEN:-${GH_TOKEN:-}}" \
        gh api "repos/$CONTRACT_REPO/contents/dist/routing-openapi.json?ref=$CONTRACT_REF" --jq '.content' \
        | base64 -d > "$WORK_DIR/openapi.json"
fi

# The wire version the client declares (contractVersion.ts) is the spec's info.version — the exact
# protocol version these generated types speak. The package version is separate: it lives in
# version.properties (contract.patch), which the contract-sync workflow bumps — not this script.
# scripts/stamp-version.mjs applies contract.patch to package.json at publish.
CONTRACT_VERSION="$(node -e "process.stdout.write(String(require('$WORK_DIR/openapi.json').info.version))")"
echo "==> Contract version: $CONTRACT_VERSION"
printf "export const CONTRACT_VERSION = '%s';\n" "$CONTRACT_VERSION" > "$REPO_ROOT/src/contractVersion.ts"

# Persisted-query ids come from the contract too (x-persisted-query-id per routing operation). The
# gateway 403s an id it hasn't registered, so these must never be hand-edited out of step with the spec.
cat > "$WORK_DIR/persisted-queries.js" <<'NODE'
const fs = require('fs');
const [specPath, outPath] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const ops = [];
for (const [route, methods] of Object.entries(spec.paths || {})) {
    for (const op of Object.values(methods)) {
        const id = op && op['x-persisted-query-id'];
        if (!id) continue;
        const path = route.replace(/^\/routing\//, '');
        ops.push({ name: path.toUpperCase().replace(/[^A-Z0-9]/g, '_'), id, path });
    }
}
if (ops.length === 0) {
    console.error('ERROR: no x-persisted-query-id found in the routing spec');
    process.exit(1);
}
ops.sort((a, b) => a.name.localeCompare(b.name));
const entries = ops
    .map((o) => `export const ${o.name}: PersistedOp = { id: '${o.id}', path: '${o.path}' };`)
    .join('\n');
fs.writeFileSync(outPath, `export interface PersistedOp {
  readonly id: string;
  readonly path: string;
}

${entries}
`);
process.stdout.write(String(ops.length));
NODE
PQ_COUNT="$(node "$WORK_DIR/persisted-queries.js" "$WORK_DIR/openapi.json" "$REPO_ROOT/src/persistedQueries.ts")"
echo "==> Persisted-query ids: $PQ_COUNT"

# Obtain + build the generator. Set CODEGEN_DIR to a local checkout to skip the clone (local dev).
if [[ -n "${CODEGEN_DIR:-}" ]]; then
    echo "==> Using local spider-codegen at $CODEGEN_DIR"
    CODEGEN="$CODEGEN_DIR"
else
    echo "==> Cloning $CODEGEN_REPO@$CODEGEN_REF"
    CODEGEN="$WORK_DIR/spider-codegen"
    GH_TOKEN="${CONTRACT_REPO_TOKEN:-${GH_TOKEN:-}}" \
        gh repo clone "$CODEGEN_REPO" "$CODEGEN" -- --depth 1 --branch "$CODEGEN_REF" \
        || { echo "ERROR: could not clone $CODEGEN_REPO@$CODEGEN_REF — CONTRACT_REPO_TOKEN must have read access to $CODEGEN_REPO (a separate private repo from $CONTRACT_REPO)." >&2; exit 1; }
fi

echo "==> Building spider-codegen"
( cd "$CODEGEN" && npm ci --silent && npm run build --silent )

echo "==> Generating types with spider-codegen"
node "$CODEGEN/dist/cli.js" \
    --spec "$WORK_DIR/openapi.json" \
    --lang typescript \
    --out "$WORK_DIR/gen"

if [[ ! -f "$WORK_DIR/gen/index.ts" ]]; then
    echo "ERROR: generator produced no models at $WORK_DIR/gen" >&2
    exit 1
fi

echo "==> Syncing into $ROUTING_DIR (replacing existing)"
rm -rf "$ROUTING_DIR"
mkdir -p "$ROUTING_DIR"
cp "$WORK_DIR"/gen/*.ts "$ROUTING_DIR/"

echo "==> Done. $(find "$ROUTING_DIR" -name '*.ts' | wc -l | tr -d ' ') model files."

# The stops + routes + realtime wire types are hand-written (src/stops.ts + src/routes.ts +
# src/realtime.ts), NOT generated. stops-openapi.json + routes-openapi.json + realtime-openapi.json
# are their published contracts; keep them as test pin fixtures so SDK-type drift from the contract
# fails the build (test/contractPin.test.ts). Repo-sourced only — a --spec local run leaves them.
FIXTURE_DIR="$REPO_ROOT/test/fixtures"
if [[ -z "$LOCAL_SPEC" ]]; then
    mkdir -p "$FIXTURE_DIR"
    for doc in stops-openapi.json routes-openapi.json realtime-openapi.json; do
        echo "==> Fetching dist/$doc → test pin fixture"
        GH_TOKEN="${CONTRACT_REPO_TOKEN:-${GH_TOKEN:-}}" \
            gh api "repos/$CONTRACT_REPO/contents/dist/$doc?ref=$CONTRACT_REF" --jq '.content' \
            | base64 -d > "$FIXTURE_DIR/$doc"
    done
else
    echo "==> Skipping stops/routes/realtime fixture fetch (local --spec run); pin fixtures left unchanged."
fi
