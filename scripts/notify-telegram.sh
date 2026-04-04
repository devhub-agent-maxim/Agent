#!/bin/bash
# Usage: ./scripts/notify-telegram.sh "Your message here"
# Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars

MESSAGE="${1:-RouteFlow: milestone complete}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_ID}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
  echo "⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification"
  exit 0
fi

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="${MESSAGE}" \
  -d parse_mode="Markdown" \
  > /dev/null

echo "✅ Telegram notification sent: ${MESSAGE}"
