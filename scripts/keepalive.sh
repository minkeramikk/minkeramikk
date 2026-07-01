#!/usr/bin/env bash
# On-demand call to the production keep-alive + usage endpoint.
#
# Sends CRON_ACCESS (read from .env.local — must equal the prod CRON_SECRET) as
# the Bearer token. Only that one key is read from .env.local (no `source`, so
# values with spaces/< like ORDER_EMAIL_FROM can't break it).
#
# URL resolution: CLI arg > KEEPALIVE_URL (.env.local) > NEXT_PUBLIC_SITE_URL +
# /api/keepalive > https://minkeramikk.no/api/keepalive.
#
# Usage:
#   ./scripts/keepalive.sh
#   ./scripts/keepalive.sh https://design.minkeramikk.no/api/keepalive
#   npm run keepalive:prod
set -u

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$DIR/.env.local"

read_env() {
  [ -f "$ENV_FILE" ] || return 0
  local v
  v="$(grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

TOKEN="$(read_env CRON_ACCESS)"
if [ -z "$TOKEN" ]; then
  echo "✗ CRON_ACCESS mancante in .env.local (deve valere quanto il CRON_SECRET di produzione)" >&2
  exit 1
fi

URL="${1:-$(read_env KEEPALIVE_URL)}"
if [ -z "$URL" ]; then
  BASE="$(read_env NEXT_PUBLIC_SITE_URL)"
  URL="${BASE:-https://design.minkeramikk.no}/api/keepalive"
fi

tmp="$(mktemp)"
code="$(curl -sS -o "$tmp" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$URL")"
echo "→ HTTP $code  $URL" >&2
if [ "${code:0:1}" = "3" ]; then
  loc="$(curl -sSI -H "Authorization: Bearer $TOKEN" "$URL" | awk 'tolower($1)=="location:"{print $2}' | tr -d "\r")"
  echo "↪ Redirect verso: ${loc:-<vedi header Location>}" >&2
  echo "  Imposta KEEPALIVE_URL a quell'host (l'auth non passa i redirect cross-host)." >&2
fi
if command -v jq >/dev/null 2>&1; then
  jq . <"$tmp" 2>/dev/null || cat "$tmp"
else
  cat "$tmp"
fi
echo
rm -f "$tmp"
[ "$code" = "200" ]
