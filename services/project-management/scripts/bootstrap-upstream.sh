#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(tr -d '[:space:]' < "$ROOT/PLANE_VERSION")"
DEST="$ROOT/.upstream"
REPO="${PLANE_UPSTREAM_URL:-https://github.com/makeplane/plane.git}"

echo "Bootstrapping Plane $PIN into $DEST"
rm -rf "$DEST"
git clone --depth 1 --branch "$PIN" "$REPO" "$DEST"

echo "Applying company overlays..."
if [[ -d "$ROOT/overlays" ]]; then
  cp -a "$ROOT/overlays/." "$DEST/"
fi
if [[ -d "$ROOT/company" ]]; then
  mkdir -p "$DEST/apps/mixinary"
  cp -a "$ROOT/company/." "$DEST/apps/mixinary/"
fi

echo "Done. Upstream tree ready at $DEST"
echo "Build company images from $DEST using ci/build-images.sh"
