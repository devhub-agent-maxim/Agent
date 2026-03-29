# Agent Dashboard

Real-time observability dashboard for the autonomous agent system.

## Features

- **Service Health Monitoring**: Real-time health checks for agent-tools, agent-scheduler, and agent-dashboard with color-coded status indicators (green=healthy <500ms, yellow=slow 500-2000ms, red=down/timeout)
- **Weekly Metrics**: Performance analytics with task completion, success rate, and timing data
- **Active Goals**: Shows current goals from `memory/goals.md`
- **Tasks**: Displays in-progress, pending, and completed tasks from `memory/TASKS.md`
- **Active Workers**: Displays running Claude CLI workers with their tasks and runtime
- **Scheduled Tasks**: Shows cron-scheduled tasks from agent-scheduler service
- **Memory Structure**: Hierarchical view of memory/ directory with frontmatter parsing and file counts by type
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

### GET /api/memory

Returns hierarchical structure of the memory/ directory with frontmatter parsing and statistics. Recursively walks all subdirectories and parses YAML frontmatter from .md files.

**Response:**
```json
{
  "structure": {
    "name": "memory",
    "path": "memory",
    "files": [
      {
        "name": "goals.md",
        "path": "memory/goals.md",
        "type": "unknown",
        "description": null,
        "frontmatter": null
      }
    ],
    "subdirectories": [
      {
        "name": "patterns",
        "path": "memory/patterns",
        "files": [
          {
            "name": "stack-default.md",
            "path": "memory/patterns/stack-default.md",
            "type": "pattern",
            "description": "Default tech stack preferences",
            "frontmatter": {
              "name": "stack-default",
              "description": "Default tech stack preferences",
              "type": "pattern"
            }
          }
        ],
        "subdirectories": []
      },
      {
        "name": "user",
        "path": "memory/user",
        "files": [
          {
            "name": "preferences.md",
            "path": "memory/user/preferences.md",
            "type": "user",
            "description": "User preferences and expertise",
            "frontmatter": {
              "name": "preferences",
              "description": "User preferences and expertise",
              "type": "user"
            }
          }
        ],
        "subdirectories": []
      }
    ]
  },
  "statistics": {
    "totalFiles": 8,
    "byType": {
      "unknown": 2,
      "pattern": 2,
      "user": 1,
      "feedback": 1,
      "project": 2
    }
  },
  "timestamp": "2026-03-29T07:50:00.000Z"
}
```

**Frontmatter Format:**

Memory files can include YAML frontmatter with the following fields:
```yaml
---
name: memory-name
description: One-line description for filtering and search
type: user | feedback | project | reference | pattern
---
```

**Memory Types:**
- `user`: User role, preferences, and expertise context
- `feedback`: Learned behaviors and guidance from user interactions
- `project`: Project-specific context and decisions
- `reference`: Pointers to external resources
- `pattern`: Reusable patterns and approaches
- `unknown`: Files without frontmatter or unrecognized type

**Examples:**
```bash
# Get full memory structure
curl http://localhost:3001/api/memory

# Get total file count
curl http://localhost:3001/api/memory | jq '.statistics.totalFiles'

# Get breakdown by type
curl http://localhost:3001/api/memory | jq '.statistics.byType'

# List all user memories
curl http://localhost:3001/api/memory | jq '.structure.subdirectories[] | select(.name == "user") | .files[]'

# Find all pattern files
curl http://localhost:3001/api/memory | jq '.. | select(.type? == "pattern")'

# Count files in each subdirectory
curl http://localhost:3001/api/memory | jq '.structure.subdirectories[] | {name, fileCount: .files | length}'

# Get all descriptions from memory files
curl http://localhost:3001/api/memory | jq '.. | .description? // empty | select(. != null)'
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

### GET /api/services

Returns health status of all agent services with response times and availability indicators.

**Response:**
```json
{
  "services": [
    {
      "name": "Agent Tools",
      "url": "http://localhost:3000/health",
      "status": "healthy",
      "responseTimeMs": 45,
      "timestamp": "2026-03-29T15:53:00.000Z"
    },
    {
      "name": "Agent Dashboard",
      "url": "http://localhost:3001/health",
      "status": "healthy",
      "responseTimeMs": 12,
      "timestamp": "2026-03-29T15:53:00.000Z"
    },
    {
      "name": "Agent Scheduler",
      "url": "http://localhost:3002/health",
      "status": "down",
      "responseTimeMs": null,
      "timestamp": "2026-03-29T15:53:00.000Z",
      "error": "Connection refused - service may be down"
    }
  ],
  "summary": {
    "total": 3,
    "healthy": 2,
    "slow": 0,
    "down": 1
  },
  "timestamp": "2026-03-29T15:53:00.000Z"
}
```

**Service Status Codes:**
- `healthy`: Response time < 500ms (green indicator)
- `slow`: Response time 500-2000ms (yellow indicator)
- `down`: Response time > 2000ms, timeout, or error (red indicator)

**Examples:**
```bash
# Get all services health status
curl http://localhost:3001/api/services

# Get summary statistics
curl http://localhost:3001/api/services | jq '.summary'

# List only down services
curl http://localhost:3001/api/services | jq '.services[] | select(.status == "down")'

# Get healthy service count
curl http://localhost:3001/api/services | jq '.summary.healthy'

# Check specific service
curl http://localhost:3001/api/services | jq '.services[] | select(.name == "Agent Tools")'

# Get response times
curl http://localhost:3001/api/services | jq '.services[] | {name, responseTimeMs}'

# Check if all services are healthy
curl http://localhost:3001/api/services | jq 'if .summary.down == 0 then "All services healthy" else "Some services down" end'
```

### GET /health

Returns health status of the agent-dashboard service itself.

**Response:**
```json
{
  "status": "healthy",
  "service": "agent-dashboard",
  "timestamp": "2026-03-29T15:53:00.000Z"
}
```

**Examples:**
```bash
# Check dashboard health
curl http://localhost:3001/health

# Validate health status
curl http://localhost:3001/health | jq '.status'
```

## Environment Variables

Create a `.env` file:

```env
PORT=3001
CORS_ALLOWED_ORIGINS=https://dashboard.example.com,https://app.example.com
```

### CORS Configuration

The API includes CORS (Cross-Origin Resource Sharing) middleware to control which origins can access the dashboard endpoints.

**Default allowed origins (development):**
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost:3002`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3001`
- `http://127.0.0.1:3002`

**Production configuration:**

Set the `CORS_ALLOWED_ORIGINS` environment variable with a comma-separated list of allowed origins:

```bash
CORS_ALLOWED_ORIGINS=https://dashboard.example.com,https://app.example.com
```

**CORS features:**
- ✅ Credentials support (cookies and authorization headers)
- ✅ Preflight request caching (24 hours)
- ✅ Allowed methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- ✅ Allowed headers: Content-Type, Authorization, X-Requested-With, Accept, Origin
- ✅ Exposed headers: X-Request-Id

**Example CORS request:**

```bash
curl -X GET http://localhost:3001/api/status \
  -H "Origin: http://localhost:3000"
```

## Security

The dashboard uses **helmet** middleware to set comprehensive security headers that protect against common web vulnerabilities.

### Security Headers

All endpoints include the following security headers:

| Header | Value | Protection |
|--------|-------|------------|
| `Content-Security-Policy` | Dashboard-optimized CSP with inline script/style support | Prevents XSS and data injection attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS connections for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `X-DNS-Prefetch-Control` | `off` | Disables DNS prefetching for privacy |
| `X-Download-Options` | `noopen` | Prevents IE from executing downloads in site context |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| `X-Permitted-Cross-Domain-Policies` | `none` | Restricts Adobe Flash/PDF cross-domain access |

**Additional Protections:**
- ✅ `X-Powered-By` header removed (server fingerprinting prevention)
- ✅ CSP allows inline scripts/styles for dashboard functionality
- ✅ CSP includes `frame-ancestors 'none'` (clickjacking protection)
- ✅ HSTS preload flag enabled (browser HSTS preload list inclusion)

**Verify Security Headers:**
```bash
# Check all security headers
curl -I http://localhost:3001/api/status | grep -E "(Content-Security|Strict-Transport|X-Frame|X-Content-Type|X-DNS|Referrer|X-Permitted)"

# Expected output includes:
# content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'...
# strict-transport-security: max-age=31536000; includeSubDomains; preload
# x-frame-options: DENY
# x-content-type-options: nosniff
# x-dns-prefetch-control: off
# referrer-policy: strict-origin-when-cross-origin
# x-permitted-cross-domain-policies: none
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
