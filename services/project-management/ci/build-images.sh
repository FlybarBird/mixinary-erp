
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(tr -d '[:space:]' < "$ROOT/HULY_VERSION")"
TAG="${COMPANY_TAG:-erp-pm-1.0.0-huly-$PIN}"
echo "Company deploy tag: $TAG (upstream $PIN)"
echo "Pull hardcoreeng/*:$PIN images; retag to company registry; scan + SBOM before prod."
"$ROOT/scripts/bootstrap-upstream.sh"
