# Agent Dashboard

Real-time observability dashboard for the autonomous agent system.

## Features

- **Active Goals**: Shows current goals from `memory/goals.md`
- **Active Workers**: Displays running Claude CLI workers with their tasks and runtime
- **Recent Activity**: Last 20 entries from today's daily log
- **Git Status**: Current branch and recent commits
- **Decision Engine**: Status of the autonomous decision engine
- **Auto-refresh**: Updates every 10 seconds

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Start server
npm start

# Development mode with auto-reload
npm run dev
```

The dashboard will be available at http://localhost:3001

## API Endpoints

### GET /api/status

Returns comprehensive dashboard data including goals, workers, logs, git status, and decision engine status.

**Response:**
```json
{
  "goals": {
    "active": ["Goal 1", "Goal 2"],
    "waiting": [],
    "completed": ["Goal 3", "Goal 4"]
  },
  "workers": [
    {
      "id": "AUTO-1234567890",
      "task": "Task description",
      "runningMs": 15000
    }
  ],
  "recentLogs": [
    "- 4:07:43 am — Spawning worker: AUTO-1774728463698",
    "- 4:06:58 am — Work loop tick — 0 workers running"
  ],
  "git": {
    "branch": "claude/serene-lamarr",
    "commits": [
      "d92ee48 docs: log agent-dashboard completion in daily notes",
      "daaee1e feat: add observability dashboard"
    ]
  },
  "decisionEngine": {
    "available": true,
    "message": "Decision engine ready"
  },
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

### GET /api/logs

Returns recent log entries from today's daily note.

**Query Parameters:**
- `count` (optional, default: 20): Number of log entries to return

**Response:**
```json
{
  "logs": [
    "- 4:07:43 am — Spawning worker: AUTO-1774728463698",
    "- 4:06:58 am — Work loop tick — 0 workers running",
    "- 3:59:36 am — Work loop tick — 1 workers running"
  ],
  "count": 3,
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Examples:**
```bash
# Get last 20 logs (default)
curl http://localhost:3001/api/logs

# Get last 50 logs
curl http://localhost:3001/api/logs?count=50

# Get last 5 logs
curl http://localhost:3001/api/logs?count=5
```

### GET /api/goals

Returns parsed goals from memory/goals.md with summary counts.

**Response:**
```json
{
  "goals": {
    "active": [
      "Goal 1: Active Task — Description",
      "Goal 2: Another Active Task"
    ],
    "waiting": [
      "Goal 3: Waiting Task — Description"
    ],
    "completed": [
      "Goal 4: Completed Task ✅",
      "Goal 5: Another Completed Task ✅"
    ]
  },
  "summary": {
    "active": 2,
    "waiting": 1,
    "completed": 2
  },
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Examples:**
```bash
# Get all goals with counts
curl http://localhost:3001/api/goals

# Parse response with jq
curl http://localhost:3001/api/goals | jq '.summary'
```

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Architecture

- **Express Server**: Lightweight HTTP server on port 3001
- **Single-file UI**: HTML with embedded CSS and JavaScript
- **No external dependencies**: Pure vanilla JS, no frameworks
- **Auto-refresh**: Fetch-based polling every 10 seconds
- **TypeScript**: Full type safety throughout

## File Structure

```
agent-dashboard/
├── src/
│   └── index.ts       # Express server + UI (< 500 lines)
├── tests/
│   └── api.test.ts    # API endpoint tests
├── package.json
├── tsconfig.json
└── README.md
```
