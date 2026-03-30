# Agent Dashboard

## What This Is
Real-time observability web dashboard for Maxim's autonomous agent system.
Displays live sprint status, active workers, GitHub Issues board, metrics, and memory.
This is the "cockpit" — shows everything happening across the agent team at a glance.

## Stack
- Language: TypeScript (strict mode)
- Framework: Express 4 (serves HTML + JSON API)
- Tests: Jest + Supertest
- Port: 3001
- Docker: yes (Dockerfile present)
- Auto-refresh: every 5 seconds via frontend polling

## Current Sprint Goal
Add a live sprint board that shows GitHub Issues in Kanban columns
(Backlog / In Progress / Done), plus real-time worker activity feed.

## Definition of Done
- [ ] All tests passing (npm test — currently 81 tests)
- [ ] Build succeeds (npm run build)
- [ ] Sprint board visible at http://localhost:3001
- [ ] WebSocket or polling for live updates without full page reload

## Backlog
- [ ] Add GitHub Issues Kanban board to dashboard UI (backlog/in-progress/done columns)
- [ ] Add live worker activity feed (auto-updates without refresh)
- [ ] Add sprint progress bar showing tasks done vs total
- [ ] Add Telegram message preview (last 5 messages received)
- [ ] Add project health indicators (test pass rate per project)
- [ ] Add dark/light mode toggle
- [ ] Add mobile-responsive layout

## Architecture
Express server that reads agent state from filesystem:
- src/index.ts — main server, all API endpoints
- src/lib/analytics.ts — parses daily logs for metrics
- src/middleware/ — cors, security-headers
- tests/ — Jest + Supertest
- The HTML UI is inline in index.ts (served at GET /)

## Constraints
- Keep the inline HTML under 300 lines (extract to static file if needed)
- All data reads must be non-blocking (no sync fs calls in request handlers)
- Dashboard must work with no external internet connection

## Links
- Live: http://localhost:3001
- GitHub Issues: https://github.com/devhub-agent-maxim/Agent/issues?q=label%3Aagent-task
