# Agent Goals
*This file drives autonomous decisions.*
*The agent reads this before every work cycle to decide what to do next.*
*Updated: 2026-03-28*

---

## Active Goals

### Goal 1: Autonomous Agent Foundation — Online
**Priority:** CRITICAL
**Description:** Get the autonomous agent infrastructure fully running.
`scripts/agent.js` should start, stay running 24/7, respond to Telegram,
run the internal work loop every 10 minutes, and be able to spawn background workers.
**Done when:**
- `node scripts/agent.js` runs without stopping
- Telegram commands (/status, /tasks, /goals, /workers) all respond correctly
- A test task can be queued and a worker spawned for it
- Daily notes are being written automatically
**Status:** Agent is running — Telegram connection being established
**Next action:** none — wait for Telegram to confirm online

---

## Waiting Goals
*(Goals defined but not yet started)*

---

## Completed Goals
*(Moved here when done — keeps a record)*
