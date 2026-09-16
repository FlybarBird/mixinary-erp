#!/usr/bin/env bash
# Smoke-check that OpenProject login is reachable under the suite path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env"
  set +a
fi

BIND_HOST="${HTTP_BIND:-127.0.0.1}"
# When bound to 127.0.0.1, curl localhost.
CURL_HOST="$BIND_HOST"
if [[ "$CURL_HOST" == "0.0.0.0" ]]; then
  CURL_HOST="127.0.0.1"
fi
PORT="${LISTEN_HTTP_PORT:-8087}"
BASE_PATH="${APP_BASE_PATH:-/project-management}"
BASE_PATH="${BASE_PATH%/}"
LOGIN_URL="http://${CURL_HOST}:${PORT}${BASE_PATH}/login"

echo "Checking OpenProject login: $LOGIN_URL"
code="$(curl -sS -o /tmp/op-login-smoke.html -w '%{http_code}' --max-time 30 "$LOGIN_URL" || true)"
echo "HTTP $code"

if [[ "$code" != "200" && "$code" != "302" ]]; then
  echo "FAIL: expected 200/302 from login page" >&2
  head -c 500 /tmp/op-login-smoke.html >&2 || true
  exit 1
fi

if grep -qiE 'px-captcha|application error|routing error' /tmp/op-login-smoke.html; then
  echo "FAIL: login HTML looks like an error page" >&2
  exit 1
fi

# Relative-root installs should mention OpenProject / username field in body.
if ! grep -qiE 'username|login|openproject|password' /tmp/op-login-smoke.html; then
  echo "WARN: login HTML did not contain expected keywords (may still be OK during boot)"
fi

echo "OK: login endpoint reachable"
exit 0
