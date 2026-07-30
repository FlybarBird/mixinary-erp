
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$(tr -d '[:space:]' < "$ROOT/PLANE_VERSION")"
TAG="${COMPANY_TAG:-erp-pm-1.0.0-plane-$PIN}"
REGISTRY="${REGISTRY:-ghcr.io/flybarbird}"

"$ROOT/scripts/bootstrap-upstream.sh"

echo "Building company images tagged $TAG (from upstream $PIN + overlays)"
# Placeholder: when company Dockerfiles exist in .upstream after overlays,
# build and push. For now tag upstream images into the company registry namespace.
for pair in frontend backend proxy space admin live; do
  src="makeplane/plane-${pair}:$PIN"
  dst="$REGISTRY/mixinary-pm-${pair}:$TAG"
  echo "docker pull $src && docker tag $src $dst && docker push $dst"
done
echo "SBOM + scans should run in CI before push to production."
