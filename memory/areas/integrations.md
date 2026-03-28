# Integrations

<!-- AGENT INSTRUCTIONS
This file tracks the configuration state of all external service integrations.
- Agents read this to check whether a service is configured before attempting API calls
- Update the status column when you successfully connect or disconnect a service
- NEVER store actual credentials here — only describe where they are set (env vars)
- Status values: ✅ active | ⚠️ partial | ❌ not configured | 🔒 requires setup

For each integration, list:
  - Required env vars
  - Optional env vars
  - How to obtain credentials (URL)
  - Which agents use it
-->

## Integration Status

| Service | Status | Env Vars Set | Used By |
|---------|--------|-------------|---------|
| GitHub | ❌ not configured | — | deploy-agent |
| Vercel | ❌ not configured | — | deploy-agent |
| Telegram | ❌ not configured | — | all agents |
| Linear | ❌ not configured | — | jira-sync-agent |
| Jira | ❌ not configured | — | jira-sync-agent |

---

## GitHub

- **Status**: ❌ not configured
- **Required env vars**:
  - `GITHUB_TOKEN` — Personal Access Token with `repo` scope
- **How to obtain**: https://github.com/settings/tokens → New classic token → repo scope
- **Used by**: deploy-agent.js (git push step)
- **Notes**: Without this, deploy-agent skips the git push step gracefully.

---

## Vercel

- **Status**: ❌ not configured
- **Required env vars**:
  - `VERCEL_TOKEN` — Vercel API token
- **How to obtain**: https://vercel.com/account/tokens → Create token
- **Used by**: deploy-agent.js (Vercel deployment step)
- **Notes**: Without this, deploy-agent skips Vercel deploy gracefully.

---

## Telegram

- **Status**: ❌ not configured
- **Required env vars**:
  - `TELEGRAM_BOT_TOKEN` — Bot token from @BotFather
  - `TELEGRAM_CHAT_ID` — Your chat or group ID
- **How to obtain**:
  1. Message @BotFather on Telegram → /newbot
  2. Get your chat ID: message @userinfobot
- **Used by**: all agents (notifications)
- **Notes**: All agents skip gracefully if not configured.

---

## Linear

- **Status**: ❌ not configured
- **Required env vars**:
  - `LINEAR_API_KEY` — Linear personal API key
- **How to obtain**: https://linear.app/settings/api → Create personal API key
- **Used by**: jira-sync-agent.js
- **Notes**: Takes priority over Jira when both are configured.

---

## Jira

- **Status**: ❌ not configured
- **Required env vars**:
  - `JIRA_BASE_URL` — e.g. `https://yourorg.atlassian.net`
  - `JIRA_USER_EMAIL` — Your Atlassian account email
  - `JIRA_API_TOKEN` — API token (not your password)
  - `JIRA_PROJECT_KEY` — e.g. `DEV`
- **How to obtain**: https://id.atlassian.com/manage-profile/security/api-tokens
- **Used by**: jira-sync-agent.js
- **Notes**: Used only if LINEAR_API_KEY is not set.
