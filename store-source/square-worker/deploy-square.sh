#!/usr/bin/env bash
set -euo pipefail

: "${SQUARE_ACCESS_TOKEN:?Set SQUARE_ACCESS_TOKEN first}"
: "${SQUARE_LOCATION_ID:?Set SQUARE_LOCATION_ID first}"

npm install
printf '%s' "$SQUARE_ACCESS_TOKEN" | npx wrangler secret put SQUARE_ACCESS_TOKEN
printf '%s' "$SQUARE_LOCATION_ID" | npx wrangler secret put SQUARE_LOCATION_ID

if [[ -n "${SQUARE_WEBHOOK_SIGNATURE_KEY:-}" ]]; then
  printf '%s' "$SQUARE_WEBHOOK_SIGNATURE_KEY" | npx wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY
fi
if [[ -n "${SQUARE_WEBHOOK_URL:-}" ]]; then
  printf '%s' "$SQUARE_WEBHOOK_URL" | npx wrangler secret put SQUARE_WEBHOOK_URL
fi

npx wrangler deploy
