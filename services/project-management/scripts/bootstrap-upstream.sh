#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(tr -d '[:space:]' < "$ROOT/HULY_VERSION")"
DEST="$ROOT/.upstream"
REPO="${HULY_UPSTREAM_URL:-https://github.com/hcengineering/platform.git}"
SELFHOST="${HULY_SELFHOST_URL:-https://github.com/hcengineering/huly-selfhost.git}"

echo "Bootstrapping Huly platform $PIN into $DEST"
rm -rf "$DEST"
git clone --depth 1 --branch "$PIN" "$REPO" "$DEST"

echo "Fetching huly-selfhost recipes..."
rm -rf "$ROOT/.selfhost-upstream"
git clone --depth 1 "$SELFHOST" "$ROOT/.selfhost-upstream"

if [[ -d "$ROOT/overlays" ]]; then
  cp -a "$ROOT/overlays/." "$DEST/" || true
fi
if [[ -d "$ROOT/company" ]]; then
  mkdir -p "$DEST/apps/mixinary"
  cp -a "$ROOT/company/." "$DEST/apps/mixinary/"
fi

# Ensure nginx template exists for compose
if [[ ! -f "$ROOT/.huly.nginx" && -f "$ROOT/.selfhost-upstream/.huly.nginx" ]]; then
  cp "$ROOT/.selfhost-upstream/.huly.nginx" "$ROOT/.huly.nginx"
elif [[ ! -f "$ROOT/.huly.nginx" && -f "$ROOT/.selfhost-upstream/.template.nginx.conf" ]]; then
  cp "$ROOT/.selfhost-upstream/.template.nginx.conf" "$ROOT/.huly.nginx"
fi

echo "Done. Platform at $DEST ; selfhost recipes at $ROOT/.selfhost-upstream"
