# Agent Dashboard

Real-time observability dashboard for the autonomous agent system.

## Features

- **Weekly Metrics**: Performance analytics with task completion, success rate, and timing data
- **Active Goals**: Shows current goals from `memory/goals.md`
- **Tasks**: Displays in-progress, pending, and completed tasks from `memory/TASKS.md`
- **Active Workers**: Displays running Claude CLI workers with their tasks and runtime
- **Scheduled Tasks**: Shows cron-scheduled tasks from agent-scheduler service
- **Recent Activity**: Last 20 entries from today's daily log
- **Git Status**: Current branch and recent commits
- **Decision Engine**: Status of the autonomous decision engine
- **Auto-refresh**: Updates every 5 seconds

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

### GET /api/tasks

Returns parsed tasks from memory/TASKS.md with summary counts.

**Response:**
```json
{
  "tasks": {
    "inProgress": [
      "- [ ] Building feature X",
      "- [ ] Refactoring module Y"
    ],
    "pending": [
      "- [ ] Add tests for Z",
      "- [ ] **BLOCKED**: Update GitHub PAT with 'workflow' scope"
    ],
    "completed": [
      "- [x] TASK-004 | Test worker spawning *(done: 28/03/2026, 7:40 pm)*",
      "- [x] TASK-003 | Scan memory/projects/delivery-logistics/ *(done: 27/03/2026)*"
    ]
  },
  "summary": {
    "inProgress": 2,
    "pending": 2,
    "completed": 2
  },
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Examples:**
```bash
# Get all tasks with counts
curl http://localhost:3001/api/tasks

# Parse response with jq
curl http://localhost:3001/api/tasks | jq '.summary'

# Get pending tasks only
curl http://localhost:3001/api/tasks | jq '.tasks.pending'

# Count completed tasks
curl http://localhost:3001/api/tasks | jq '.summary.completed'
```

### GET /api/recent-activity

Returns recent activity log entries from today's daily note (similar to /api/logs but with 'activity' key for consistency).

**Query Parameters:**
- `count` (optional, default: 20): Number of activity entries to return

**Response:**
```json
{
  "activity": [
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
# Get last 20 activity entries (default)
curl http://localhost:3001/api/recent-activity

# Get last 10 activity entries
curl http://localhost:3001/api/recent-activity?count=10
```

### GET /api/workers

Returns currently active Claude CLI workers with their tasks and runtime.

**Response:**
```json
{
  "workers": [
    {
      "id": "AUTO-1774728463698",
      "task": "Integrate agent-dashboard with real data sources",
      "runningMs": 45230
    },
    {
      "id": "AUTO-1774728500000",
      "task": "Add TODO API tests",
      "runningMs": 12100
    }
  ],
  "count": 2,
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Examples:**
```bash
# Get active workers
curl http://localhost:3001/api/workers

# Count active workers
curl http://localhost:3001/api/workers | jq '.count'

# Get worker IDs
curl http://localhost:3001/api/workers | jq '.workers[].id'
```

### GET /api/schedules

Returns scheduled tasks from the agent-scheduler service (http://localhost:3002). Gracefully handles scheduler service unavailability.

**Response (when scheduler available):**
```json
{
  "schedules": [
    {
      "id": 1,
      "name": "Daily Backup",
      "cron_expression": "0 2 * * *",
      "command": "npm run backup",
      "enabled": 1,
      "last_run": 1774738800000,
      "next_run": 1774825200000,
      "created_at": 1774728800000
    }
  ],
  "count": 1,
  "available": true,
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Response (when scheduler unavailable):**
```json
{
  "schedules": [],
  "count": 0,
  "available": false,
  "error": "Scheduler service not available",
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Examples:**
```bash
# Get all scheduled tasks
curl http://localhost:3001/api/schedules

# Count scheduled tasks
curl http://localhost:3001/api/schedules | jq '.count'

# Get enabled schedules only
curl http://localhost:3001/api/schedules | jq '.schedules[] | select(.enabled == 1)'

# Check scheduler availability
curl http://localhost:3001/api/schedules | jq '.available'
```

### GET /api/metrics

Returns performance metrics for the last N days by parsing daily log files. Provides insights into task completion, worker success rates, and timing data.

**Query Parameters:**
- `days` (optional, default: 7): Number of days to analyze

**Response:**
```json
{
  "metrics": {
    "days": [
      {
        "date": "2026-03-22",
        "tasksCompleted": 3,
        "workerSpawned": 5,
        "workerSuccess": 4,
        "workerFailure": 1,
        "decisionEngineAvailable": true,
        "workLoopTicks": 144,
        "avgTaskDurationMs": 125000,
        "totalTaskDurationMs": 375000,
        "commits": 8,
        "avgTaskDurationFormatted": "2m 5s"
      }
    ],
    "summary": {
      "totalTasks": 42,
      "totalWorkers": 48,
      "successRate": 95.8,
      "avgCompletionTimeMs": 185000,
      "avgTasksPerDay": 6.0,
      "commits": 52,
      "avgCompletionTimeFormatted": "3m 5s"
    }
  },
  "period": {
    "days": 7,
    "start": "2026-03-22",
    "end": "2026-03-28"
  },
  "timestamp": "2026-03-29T04:07:00.000Z"
}
```

**Metrics Explained:**
- `tasksCompleted`: Number of worker tasks completed successfully
- `workerSpawned`: Total workers spawned (may exceed completed due to in-progress work)
- `workerSuccess`: Workers that completed successfully
- `workerFailure`: Workers that failed or were blocked
- `decisionEngineAvailable`: Whether decision engine was operational (false if any "unavailable" entries found)
- `workLoopTicks`: Number of work loop cycles (runs every 10 minutes)
- `avgTaskDurationMs`: Average time to complete a task (spawn to done)
- `totalTaskDurationMs`: Total time spent on all tasks
- `commits`: Git commits made during the period
- `successRate`: (workerSuccess / totalWorkers) × 100

**Examples:**
```bash
# Get last 7 days of metrics (default)
curl http://localhost:3001/api/metrics

# Get last 30 days of metrics
curl http://localhost:3001/api/metrics?days=30

# Get yesterday's metrics only
curl http://localhost:3001/api/metrics?days=1

# Get summary statistics
curl http://localhost:3001/api/metrics | jq '.metrics.summary'

# Get success rate
curl http://localhost:3001/api/metrics | jq '.metrics.summary.successRate'

# Get average completion time
curl http://localhost:3001/api/metrics | jq '.metrics.summary.avgCompletionTimeFormatted'

# Get daily breakdown
curl http://localhost:3001/api/metrics | jq '.metrics.days[] | {date, tasksCompleted, successRate: (.workerSuccess / .workerSpawned * 100)}'

# Find days with high task count
curl http://localhost:3001/api/metrics | jq '.metrics.days[] | select(.tasksCompleted > 5)'

# Calculate total commits this week
curl http://localhost:3001/api/metrics | jq '.metrics.summary.commits'
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
│   ├── index.ts           # Express server + UI
│   └── lib/
│       └── analytics.ts   # Metrics parsing and aggregation
├── tests/
│   ├── api.test.ts        # API endpoint tests
│   └── analytics.test.ts  # Analytics module tests
├── package.json
├── tsconfig.json
└── README.md
```
