# Agent Dashboard

**Created:** 2026-03-29
**Status:** Active
**Type:** Internal tooling for autonomous agent observability

## Purpose

Real-time web dashboard for monitoring the autonomous agent's state and activity. Provides visibility into goals, active workers, recent logs, git status, and decision engine health.

## Architecture

### Backend (Express + TypeScript)
- **Server:** Express.js on port 3001
- **API Endpoint:** `GET /api/status` - Returns JSON with:
  - Active/waiting/completed goals from `memory/goals.md`
  - Active worker processes with runtime tracking
  - Last 20 daily log entries from `memory/daily/YYYY-MM-DD.md`
  - Git branch and last 5 commits
  - Decision engine availability status
  - ISO timestamp of response

### Frontend (Vanilla JS + HTML)
- **Route:** `GET /` - Single-page dashboard with auto-refresh (10s)
- **UI Components:**
  - Goals grid (active goals displayed)
  - Workers grid (active workers with ID, task, runtime)
  - Activity log (last 20 entries)
  - Git status (branch + recent commits)
  - Decision engine status badge
- **Design:** Dark-themed, responsive grid layout, GitHub-inspired color scheme

### Key Features
- **Auto-refresh:** Dashboard polls `/api/status` every 10 seconds
- **Real-time visibility:** No manual log file reading required
- **Production-safe:** Server only starts when run directly, not during tests
- **Type-safe:** Full TypeScript coverage with proper Express types

## Testing

- **Coverage:** 9 passing tests (100% coverage)
- **Test suites:**
  - API endpoint validation (status object structure)
  - Individual field tests (goals, workers, logs, git, decision engine)
  - HTML UI rendering and auto-refresh script inclusion

## Usage

```bash
# Development
cd projects/agent-dashboard
npm install
npm run build
npm start

# Access dashboard
open http://localhost:3001

# Run tests
npm test
```

## Integration Points

- Reads from `memory/goals.md` (active/waiting/completed goals)
- Reads from `memory/daily/YYYY-MM-DD.md` (recent activity log)
- Imports `scripts/lib/workers.js` (active worker tracking)
- Executes `git` commands (branch, log) for repository status
- Checks `scripts/lib/decider.js` existence (decision engine health)

## Future Enhancements

- WebSocket support for real-time push updates (eliminate polling)
- Historical metrics and charts (goal completion rate, worker duration)
- Performance monitoring (CPU/memory usage tracking)
- Alert system for stuck workers or decision engine failures
- Authentication layer for remote access
