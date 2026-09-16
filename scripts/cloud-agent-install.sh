#!/usr/bin/env bash
# Idempotent Cloud Agent install for Mixinary ERP (local SQLite mode).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

# Prefer local SQLite so agents can run without Supabase secrets.
if [[ ! -f .env.local ]]; then
  cat > .env.local <<'EOF'
NEXT_PUBLIC_MIXINARY_LOCAL_MODE=true
MIXINARY_LOCAL_MODE=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_BRAND_NAME=Mixinary ERP
NEXT_PUBLIC_PM_BASE_PATH=/project-management
EOF
fi

# Ensure local mode flags remain present even if .env.local already exists.
if ! grep -q '^MIXINARY_LOCAL_MODE=true' .env.local 2>/dev/null; then
  printf '\nMIXINARY_LOCAL_MODE=true\nNEXT_PUBLIC_MIXINARY_LOCAL_MODE=true\n' >> .env.local
fi
if ! grep -q '^NEXT_PUBLIC_APP_URL=' .env.local 2>/dev/null; then
  printf '\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n' >> .env.local
fi
if ! grep -q '^NEXT_PUBLIC_PM_BASE_PATH=' .env.local 2>/dev/null; then
  printf '\nNEXT_PUBLIC_PM_BASE_PATH=/project-management\n' >> .env.local
fi
