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

## API Endpoint

**GET /api/status** - Returns JSON with all dashboard data:

```json
{
  "goals": {
    "active": [],
    "waiting": [],
    "completed": []
  },
  "workers": [],
  "recentLogs": [],
  "git": {
    "branch": "main",
    "commits": []
  },
  "decisionEngine": {
    "available": true,
    "message": "Decision engine ready"
  },
  "timestamp": "2026-03-29T03:40:00.000Z"
}
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
