# Agent Goals
*This file drives autonomous decisions.*
*The agent reads this before every work cycle to decide what to do next.*
*Updated: 2026-03-29*

---

## Active Goals

### Goal 2: Intel Pipeline — Daily Digest Quality
**Priority:** HIGH
**Description:** Improve the morning intel scraper so it produces concise, high-signal digests.
Each item should include: title, URL, score, and a 1-sentence reason why it matters.
The digest should never send more than 10 items. Items with score <7 should be silently dropped.
Verify the scraper actually finds fresh content (not same items repeatedly due to stale last_seen).
**Next action:** Review scripts/agents/social-monitor-agent.js — check that last_seen timestamps are being saved and loaded correctly, and that the Sonnet filter prompt is tight enough to filter noise.
**Done when:**
- /monitor returns only ≥7 scored items with clear reasons
- Items don't repeat across runs
- Digest lands in Social Monitor thread (4) with proper formatting

---

### Goal 3: Agent Self-Improvement — Continuous Enhancement
**Priority:** MEDIUM
**Description:** Every work cycle, the agent should look at its own performance and find ONE small improvement to make.
Read memory/daily/ notes, find any recurring "waiting" entries or failures, and fix them.
Look at scripts/ for anything that can be made more robust.
Write improvements directly to code with proper tests.
**Next action:** Read the last 3 daily notes (memory/daily/2026-03-28.md etc), identify the most common failure pattern, and write a targeted fix.
**Done when:**
- No repeated error messages in daily log
- Work loop finds real work to do each cycle
- Agent handles edge cases gracefully

---

### Goal 4: Project Scaffolding — New Project Ready
**Priority:** MEDIUM
**Description:** Scaffold a real project in projects/ that the agent can actively develop.
Use projects/_template/ as base. Create a TypeScript + Express API for a simple productivity tool.
The project should have: src/, tests/, config/, package.json with proper deps, tsconfig.json, jest config.
**Next action:** Copy projects/_template/ to projects/agent-tools/, install deps, write a basic health-check endpoint with test, verify npm test passes.
**Done when:**
- projects/agent-tools/ exists with full structure
- npm install && npm test both pass
- At least one endpoint implemented with passing test

---

## Waiting Goals
*(Goals defined but not yet started)*

---

## Completed Goals
*(Moved here when done — keeps a record)*

### Goal 1: Autonomous Agent Foundation — Online ✅
**Completed:** 2026-03-28 (8:51 PM)
**Priority:** CRITICAL
**Description:** Get the autonomous agent infrastructure fully running.
`scripts/agent.js` should start, stay running 24/7, respond to Telegram,
run the internal work loop every 10 minutes, and be able to spawn background workers.
**Done when:**
- `node scripts/agent.js` runs without stopping ✅
- Telegram commands (/status, /tasks, /goals, /workers) all respond correctly ✅
- A test task can be queued and a worker spawned for it ✅
- Daily notes are being written automatically ✅
**Final Status:** All criteria met — verified end-to-end
