---
name: social-monitor
description: Monitors key thought leaders and repos for new content to inform development decisions. Tracks Nat Eliason (OpenClaw/Felix), raycfu (OpenClaw course), and ruvnet (Claude agent repos). Use when asked to "check what's new", "any updates from Nat", "what's ruvnet building", "monitor feeds", or "upgrade my knowledge from their latest posts".
triggers:
  - /monitor
  - /check-feeds
  - /sync-knowledge
  - /what-new
tools:
  - WebSearch
  - WebFetch
  - mcp__memory__search_nodes
  - mcp__memory__create_entities
  - mcp__memory__add_observations
  - Write
  - Read
---

## Overview

Monitors 3 intelligence sources and extracts actionable patterns to adopt in your own development workflow:

| Source | Platform | What to Extract |
|--------|----------|-----------------|
| Nat Eliason (@nateliason) | X/Twitter, Substack | Felix workflow updates, new automation patterns, architecture decisions |
| raycfu (@raycfu) | Website, Instagram, YouTube | Course updates, new skill patterns, business automation techniques |
| ruvnet | GitHub (ruflo, agentic-flow, claude-flow) | New skills, agent orchestration patterns, SKILL.md formats |

## Commands

### /monitor [source?]
Check all sources (or a specific one) for new content.

**Steps:**

1. **Nat Eliason check:**
   - WebSearch: `nateliason site:x.com 2026` — get latest tweets
   - WebSearch: `nat eliason openclaw felix 2026` — get latest articles
   - WebFetch: `https://creatoreconomy.so` — check for new posts
   - Extract: new workflow patterns, new skills mentioned, architecture changes

2. **raycfu check:**
   - WebFetch: `https://www.raycfu.com` — check for new courses/content
   - WebSearch: `raycfu openclaw 2026` — any new posts or announcements
   - Extract: new automation techniques, pricing insights, skill ideas

3. **ruvnet GitHub check:**
   - WebSearch: `ruvnet ruflo github commits 2026` — recent activity
   - WebSearch: `ruvnet agentic-flow new skills site:github.com` — new skill files
   - WebFetch: `https://github.com/ruvnet/ruflo` — check README for updates
   - Extract: new SKILL.md patterns, new MCP integrations, orchestration updates

4. **For each finding, assess relevance:**
   - Is this a new pattern I can adopt right now?
   - Does this change how I should structure my skills?
   - Does this unlock a capability I don't have yet?
   - Is this relevant to the delivery logistics project?

5. **Save findings to memory:**
   - Call `mcp__memory__search_nodes` for "social_intelligence"
   - Call `mcp__memory__add_observations` with date-stamped findings
   - Write digest to `memory\daily\YYYY-MM-DD.md` under "## Intelligence Update"

6. **Output actionable summary** (see Output section)

### /sync-knowledge
Deep sync — apply a specific technique found in monitoring to your current setup.

**Steps:**
1. Run /monitor to get latest findings
2. Ask user: "I found [X technique]. Do you want me to implement this in your skill system?"
3. If yes: create or update the relevant SKILL.md
4. Update memory with what was adopted and why

## Watched Sources Detail

### Nat Eliason
- **X/Twitter**: https://x.com/nateliason — technical gists, workflow guides (primary source)
- **Felix's X**: https://x.com/FelixCraftAI — Felix posts its own updates and launches
- **Substack**: https://creatoreconomy.so — long-form architecture tutorials
- **Case study tracker**: https://openclaw.report/use-cases/felix-zero-human-company — revenue/milestone updates
- **Bankless podcast**: deep architectural deep-dives (search "Nat Eliason Bankless OpenClaw")
- **Key topics to watch**: Sentry→Codex→PR workflow updates, new Claw Mart products, sub-agent patterns (Iris/Remy/Teagan), memory architecture changes, new gists published

### raycfu
- **Website**: https://www.raycfu.com
- **Key topics to watch**: New course modules, skill templates, automation playbooks, business automation patterns, ClawHub skill ideas

### ruvnet GitHub
- **ruflo**: https://github.com/ruvnet/ruflo
- **agentic-flow**: https://github.com/ruvnet/agentic-flow
- **claude-flow**: https://github.com/ruvnet/claude-flow
- **Key topics to watch**: New SKILL.md files, MCP integrations, orchestration patterns, memory management approaches, scheduled task examples

## What NOT to Extract
- Promotional/marketing content with no technical substance
- Content unrelated to AI automation, Claude, or development workflow
- Repeated content already saved to memory (check before saving)

## Output Format

```
## 📡 Intelligence Report — [DATE]

### Nat Eliason
- [Finding]: [What it is] → [How to apply it]
- No new content / Already captured

### raycfu
- [Finding]: [What it is] → [How to apply it]

### ruvnet
- [Finding]: [What it is] → [How to apply it]

### 🎯 Top Actionable Item
[The single most valuable thing to implement next, with reasoning]

### 💾 Saved to Memory: [entity names updated]
```

## Scheduled Monitoring
This skill can be run on a schedule. Recommended: daily at 9 AM.
To schedule: use `/schedule` and set up a daily cron that runs `/monitor`.
