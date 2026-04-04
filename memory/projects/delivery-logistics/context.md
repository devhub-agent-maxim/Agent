# RouteFlow — v1 BUILT — awaiting deploy secrets

## Status
Build: CLEAN (Next.js 15, 5 routes, 26 tests passing)
Deploy: Needs GitHub Secrets + Vercel project setup

## To Go Live
1. Create Vercel project → root: projects/delivery-logistics
2. Add GitHub Secrets to devhub-agent-maxim/Agent:
   - GOOGLE_MAPS_API_KEY (Google Cloud Console)
   - VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
   - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
3. Push to main → auto-deploys

## What's Built
- Multi-driver route optimization (k-means geographic clustering)
- Dispatcher dashboard (address input, driver settings, color-coded route results)
- Driver mobile view (big Navigate button → Google Maps, tap-to-check stops)
- API: POST /api/routes/optimize (mock when no API key, real when key set)
- GitHub Actions deploy pipeline (.github/workflows/deploy.yml)
- Telegram notification script (scripts/notify-telegram.sh)
