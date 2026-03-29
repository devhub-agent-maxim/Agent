# Social Media Monitoring Setup Guide

## Overview

The autonomous agent now monitors 10+ social media platforms for AI/agent/coding intelligence:

1. **YouTube RSS** — raycfu, nateliason
2. **Reddit JSON** — r/ClaudeAI, r/AutonomousAgents, r/LocalLLaMA, r/MachineLearning
3. **GitHub API** — ruvnet/claude-flow, anthropics/claude-code releases
4. **Hacker News RSS** — filtered for AI/agent keywords
5. **Direct RSS** — raycfu.com, openclaw.report
6. **Twitter/X API v2** — @nateliason, @raycfu, @ruvnet + hashtags
7. **TikTok API** — trending videos via RapidAPI
8. **Instagram Graph API** — @raycfu posts/reels
9. **LinkedIn API** — posts from key people/companies
10. **Substack RSS** — Nat Eliason's newsletter

All content is filtered through Claude Sonnet — only items scoring ≥7/10 for relevance to autonomous agent development reach Telegram.

---

## API Setup Instructions

### 1. Twitter/X API v2 (Free Tier)

**Get API credentials:**
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new project and app (Free tier: 500,000 tweets/month)
3. Navigate to "Keys and tokens"
4. Generate Bearer Token

**Add to .env:**
```bash
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAAxxxxxxxxxxxxxxx
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxx  # Optional, for advanced features
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Optional
```

**What it monitors:**
- Recent tweets from @nateliason, @raycfu, @ruvnet, @anthropicai
- Hashtag searches: #ClaudeCode, #OpenClaw, #AgenticAI, #AutonomousAgents
- Max 10 results per handle/hashtag per run

**Rate limits:**
- Free tier: 500,000 tweets/month read
- 15 requests per 15 min window per endpoint

---

### 2. TikTok API (via RapidAPI)

**Get API key:**
1. Go to https://rapidapi.com/
2. Sign up (free tier: 100 requests/month)
3. Subscribe to "TikTok Scraper" or similar API
4. Copy your RapidAPI key from dashboard

**Add to .env:**
```bash
RAPIDAPI_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**What it monitors:**
- Trending videos for hashtags: #AI, #coding, #automation, #developers, #aiagents
- Posts from specific creators (raycfu, nateliason if configured)
- Videos are passed to video-intel-agent.js for transcript + summary

**Rate limits:**
- Free tier: 100 requests/month
- Each hashtag/creator = 1 request

**Configure creators/hashtags in config.js:**
```javascript
social: {
  tiktok: {
    rapidApiKey: process.env.RAPIDAPI_KEY,
    creators: ['raycfu', 'nateliason'],  // Add/remove creators
    hashtags: ['AI', 'coding', 'automation', 'developers', 'aiagents']
  }
}
```

---

### 3. Instagram Graph API (Business/Creator Account Required)

**Get access token:**
1. Create a Facebook Developer account: https://developers.facebook.com/
2. Create an app with Instagram Graph API permissions
3. Convert your Instagram account to Business/Creator
4. Link Instagram to Facebook Page
5. Get User Access Token (with `instagram_basic`, `instagram_content_publish` scopes)
6. Exchange for Long-Lived Token (60 days)

**Add to .env:**
```bash
INSTAGRAM_ACCESS_TOKEN=IGQWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**What it monitors:**
- Recent posts/reels from configured handles (default: @raycfu)
- Caption, media type, permalink, engagement metrics
- Reels are passed to video-intel-agent.js

**Rate limits:**
- 200 requests/hour per user
- Token expires after 60 days (must refresh)

**Note:** Instagram API requires Business/Creator account. Personal accounts won't work.

---

### 4. LinkedIn API (OAuth Required)

**Get access token:**
1. Create LinkedIn app: https://www.linkedin.com/developers/apps
2. Request access to "Sign In with LinkedIn" and "Share on LinkedIn"
3. OAuth flow to get access token (requires user consent)
4. Tokens expire after 60 days

**Add to .env:**
```bash
LINKEDIN_ACCESS_TOKEN=AQXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**What it monitors:**
- Recent posts from authenticated user's feed
- Company pages (if configured)
- Hashtag searches (limited to network)

**Rate limits:**
- Varies by API endpoint
- Typically 100 requests/day for free tier

**Note:** LinkedIn API is restrictive. Consider RSS alternatives if available.

---

### 5. Substack RSS (No API Key Required)

**Already configured:**
- Monitors: https://creatoreconomy.so/feed (Nat Eliason's newsletter)

**Add more feeds in config.js:**
```javascript
social: {
  substack: {
    feeds: [
      'https://creatoreconomy.so/feed',
      'https://yourfavorite.substack.com/feed',
      // Add more RSS feeds here
    ]
  }
}
```

---

## Configuration

### Default Handles/Hashtags

Edit `scripts/lib/config.js` to customize:

```javascript
social: {
  twitter: {
    handles: ['nateliason', 'raycfu', 'ruvnet', 'anthropicai'],
    hashtags: ['ClaudeCode', 'OpenClaw', 'AgenticAI', 'AutonomousAgents'],
  },
  tiktok: {
    creators: ['raycfu', 'nateliason'],
    hashtags: ['AI', 'coding', 'automation', 'developers', 'aiagents'],
  },
  instagram: {
    handles: ['raycfu'],
    hashtags: ['aiagents', 'autonomousai', 'claudecode', 'agentic'],
  },
  linkedin: {
    profiles: [],  // Add profile URNs here
    companies: ['anthropic', 'openai'],
    hashtags: ['AgenticAI', 'LLM', 'AIEngineering'],
  },
}
```

---

## Telegram Commands

```bash
/monitor              # Run all platforms (daily at 8 AM automatically)
/monitor-all          # Alias for /monitor
/monitor-twitter      # Twitter only
/monitor-tiktok       # TikTok trends only
/monitor-instagram    # Instagram only
/monitor-linkedin     # LinkedIn only
/intel [platform]     # Show recent intel (filter by platform name)
```

**Examples:**
```bash
/monitor              # Full scan (60-90 seconds)
/monitor-twitter      # Quick Twitter check (~10 seconds)
/intel tiktok         # Show all TikTok intel from memory/areas/social-intel.md
/intel                # Show all recent intel
```

---

## Scheduled Monitoring

Configured in `scripts/agent.js`:

```javascript
// Daily full scan
scheduler.scheduleDaily('intel-scraper', 8, 0, () => {
  socialMonitor.run(notifyIntel);
});

// Additional schedules (add these if desired):
scheduler.scheduleInterval('twitter-check', 2 * 60 * 60 * 1000, () => {
  socialMonitor.scrapeTwitter(loadLastSeen());
});

scheduler.scheduleInterval('tiktok-trends', 6 * 60 * 60 * 1000, () => {
  socialMonitor.scrapeTikTok(loadLastSeen());
});
```

---

## Data Storage

All intel is saved to:
```
memory/areas/social-intel.md
```

**Format:**
```markdown
<!-- last_seen: {"twitter_raycfu":"1234567890","tiktok_AI":"2024-01-01T12:00:00Z"} -->

# Social Intelligence Feed

## 2024-01-29

- **[Twitter/@raycfu]** [Check out this Claude Code workflow](https://twitter.com/raycfu/status/123)
  - Build autonomous agents faster with OpenClaw patterns
  - Score: 9/10
  > _Direct implementation of agent delegation using Claude CLI — immediately actionable_

- **[TikTok/#AI]** [How I built an AI coding assistant](https://tiktok.com/@user/video/456)
  - Tutorial on agent memory patterns
  - Score: 8/10
  > _Shows practical multi-agent coordination setup_
```

---

## Sonnet Filtering

All items are scored 1-10 by Claude Sonnet before reaching Telegram:

**Scoring rules:**
- **9-10**: Direct implementation technique, immediately actionable
- **7-8**: Useful context for agent development
- **5-6**: General AI/ML news, interesting but not actionable
- **1-4**: Unrelated noise

**Only items ≥7 are saved and sent to Telegram.**

High-value items (≥8) are sent as interactive "idea cards" to the New Project Telegram topic with buttons:
- ✅ Add as Task
- 🎯 Add as Goal
- 🧠 Save to Memory
- ❌ Skip

---

## Graceful Degradation

All scrapers handle missing API keys gracefully:

```javascript
// Twitter example
if (!bearerToken) {
  log('Twitter: no bearer token — skipping');
  return [];
}
```

**The agent will continue to monitor other platforms even if some APIs are not configured.**

---

## Testing

Run comprehensive test suite:

```bash
cd scripts/agents
node social-monitor-agent.test.js
```

**Tests cover:**
- API credential handling
- Rate limit errors
- Data validation
- Deduplication
- Last-seen tracking
- Integration with existing scrapers

---

## Troubleshooting

### Twitter 401 Errors
- **Cause**: Invalid or expired Bearer Token
- **Fix**: Regenerate token at https://developer.twitter.com/en/portal/dashboard

### TikTok 429 Errors
- **Cause**: RapidAPI rate limit exceeded
- **Fix**: Upgrade RapidAPI plan or wait for reset (monthly)

### Instagram 401 Errors
- **Cause**: Token expired (60-day limit) or wrong account type
- **Fix**: Refresh Long-Lived Token or convert to Business/Creator account

### LinkedIn 401 Errors
- **Cause**: Token expired or insufficient permissions
- **Fix**: Re-authenticate with OAuth flow

### No results from scraper
- **Check**: `memory/areas/social-intel.md` for `last_seen` timestamps
- **Reset**: Delete `last_seen` comment to force full re-scan from 7 days ago

---

## Rate Limit Summary

| Platform | Free Tier | Limit | Reset |
|----------|-----------|-------|-------|
| Twitter | 500K tweets/month | 15 req/15min per endpoint | Rolling |
| TikTok (RapidAPI) | 100 req/month | - | Monthly |
| Instagram | 200 req/hour | - | Hourly |
| LinkedIn | 100 req/day | - | Daily |
| YouTube RSS | Unlimited | - | - |
| Reddit JSON | Unlimited | - | - |
| GitHub API | 60 req/hour (unauth) | - | Hourly |
| Hacker News RSS | Unlimited | - | - |
| Substack RSS | Unlimited | - | - |

---

## Future Enhancements

- [ ] Discord monitoring (server scraping)
- [ ] Slack workspace monitoring
- [ ] Mastodon/Fediverse RSS
- [ ] Podcast transcription (Spotify/Apple)
- [ ] Newsletter aggregation (morning.so)
- [ ] Twitter Spaces transcription
- [ ] GitHub Discussions scraping
- [ ] Dev.to / Hashnode RSS

---

## Support

Questions? Check:
- Main documentation: `CLAUDE.md`
- Test suite: `scripts/agents/social-monitor-agent.test.js`
- Example config: `.env.example`
- Agent code: `scripts/agents/social-monitor-agent.js`

For API-specific issues, consult official docs:
- Twitter: https://developer.twitter.com/en/docs/twitter-api
- TikTok: https://rapidapi.com/
- Instagram: https://developers.facebook.com/docs/instagram-api
- LinkedIn: https://docs.microsoft.com/en-us/linkedin/
