# Scheduling Pattern — Hybrid Agent Task Scheduling

*Created: 2026-03-29*
*Last updated: 2026-03-29*

## Overview

The autonomous agent uses a **hybrid scheduling approach** that combines:

1. **In-process scheduler** (`scripts/lib/scheduler.js`) — Actual task execution
2. **External scheduler service** (`projects/agent-scheduler/`) — Persistence and monitoring

This architecture provides:
- **Reliability**: Tasks execute in-process with access to agent state
- **Persistence**: Schedule configuration survives restarts
- **Visibility**: REST API for monitoring and dashboard integration
- **Resilience**: Automatic fallback if external service unavailable

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  scripts/agent.js (Main Process)                           │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │  scripts/lib/schedule-manager.js             │          │
│  │  (Registration & Fallback Logic)             │          │
│  └──────────────┬────────────────────────┬──────┘          │
│                 │                        │                  │
│                 ▼                        ▼                  │
│  ┌────────────────────────┐  ┌────────────────────────┐   │
│  │  In-Process Scheduler  │  │  External Scheduler    │   │
│  │  (scheduler.js)        │  │  API Client            │   │
│  │  ✓ Executes tasks      │  │  ✓ Registers tasks     │   │
│  │  ✓ Has agent state     │  │  ✓ Monitors status     │   │
│  └────────────────────────┘  └───────────┬────────────┘   │
└──────────────────────────────────────────│─────────────────┘
                                           │
                                           │ HTTP REST API
                                           │
                              ┌────────────▼────────────┐
                              │  agent-scheduler        │
                              │  (Express + SQLite)     │
                              │  Port: 3002             │
                              │                         │
                              │  ✓ Persistent storage   │
                              │  ✓ REST API             │
                              │  ✓ Dashboard data       │
                              └─────────────────────────┘
```

---

## Registered Tasks

| Task | Cron Expression | Frequency | Function |
|------|----------------|-----------|----------|
| **Work Loop** | `*/10 * * * *` | Every 10 minutes | Check goals, spawn workers, process tasks |
| **Nightly Consolidation** | `0 2 * * *` | Daily at 2:00 AM | Run consolidation agent, prepare next day's note |
| **Daily Brief** | `0 7 * * *` | Daily at 7:00 AM | GitHub commits + overnight summary |

---

## Integration Code

### In `scripts/agent.js`:

```javascript
const scheduleManager = require('./lib/schedule-manager');

async function main() {
  // ...

  // Register core agent tasks with schedule manager
  const registrationResult = await scheduleManager.registerAgentTasks({
    workLoopFn: workLoop,
    dailyBriefFn: dailyBrief,
    nightlyConsolidationFn: nightlyConsolidation,
  });

  if (registrationResult.mode === 'hybrid') {
    log('[Scheduler] Mode: hybrid (in-process + external monitoring)');
  } else {
    log('[Scheduler] Mode: in-process only');
  }

  // ...
}
```

### Schedule Manager Behavior:

1. **Always** registers tasks with in-process scheduler (immediate execution)
2. **Attempts** to register with external scheduler (monitoring)
3. **Falls back** gracefully if external service unavailable

---

## External Scheduler Service

### Service Details:
- **Location**: `projects/agent-scheduler/`
- **Port**: 3002
- **Database**: SQLite at `projects/agent-scheduler/data/scheduler.db`
- **API Base**: `http://localhost:3002`

### REST API Endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/schedules` | List all schedules |
| `POST` | `/schedules` | Create new schedule |
| `GET` | `/schedules/:id` | Get specific schedule |
| `DELETE` | `/schedules/:id` | Delete schedule |
| `PATCH` | `/schedules/:id/toggle` | Enable/disable schedule |

### Starting the Service:

```bash
cd projects/agent-scheduler
npm run build
PORT=3002 npm start
```

---

## Fallback Behavior

If `agent-scheduler` service is unavailable:

1. Schedule manager logs warning: `"agent-scheduler unavailable — using in-process only"`
2. Tasks continue to execute via in-process scheduler
3. No external persistence/monitoring available
4. Agent functionality is **NOT affected**

---

## Monitoring Integration

The `agent-dashboard` (port 3001) can query schedules via:

```bash
GET http://localhost:3002/schedules
```

Returns:
```json
{
  "schedules": [
    {
      "id": 1,
      "name": "agent-work-loop",
      "cron_expression": "*/10 * * * *",
      "command": "echo \"Work loop executed by in-process scheduler\"",
      "enabled": 1,
      "last_run": null,
      "next_run": 1774741019,
      "created_at": 1774740954
    }
  ],
  "count": 3
}
```

---

## Key Design Decisions

### Why Hybrid?

1. **In-process execution is required** — tasks need access to agent's in-memory state:
   - Worker registry
   - Conversation history
   - Telegram connection
   - Running timers

2. **External scheduler provides value** for:
   - Persistence across restarts
   - REST API for monitoring
   - Dashboard integration
   - Audit trail of scheduled tasks

### Why Not Pure External?

External scheduler spawns separate processes (`node scripts/agent.js --work-loop`), which would:
- Lose access to agent state
- Require complex IPC
- Duplicate resources (multiple Telegram connections, etc.)

### Hybrid = Best of Both

- **In-process**: Fast, stateful, reliable execution
- **External**: Persistent, queryable, monitorable

---

## Future Enhancements

1. **HTTP Callback Trigger**: External scheduler could POST to agent endpoint when tasks should run
2. **Distributed Tasks**: Use external scheduler for tasks that don't need agent state
3. **Scheduling UI**: Web interface for schedule management
4. **Health Monitoring**: Track execution success/failure rates

---

## Troubleshooting

### Schedules not persisting?

Check if `agent-scheduler` service is running:
```bash
curl http://localhost:3002/health
```

Should return: `{"status":"ok","service":"agent-scheduler"}`

### Tasks not executing?

In-process scheduler runs independently. Check `scripts/agent.js` logs for:
```
[Scheduler] Work loop registered (in-process) — every 10 min
[Scheduler] Nightly consolidation registered (in-process) — daily at 02:00
[Scheduler] Daily brief registered (in-process) — daily at 07:00
```

### External registration failed?

Agent continues to work. External scheduler is **optional** for monitoring only.

---

## Related Files

- `scripts/lib/schedule-manager.js` — Integration logic
- `scripts/lib/scheduler.js` — In-process scheduler implementation
- `projects/agent-scheduler/` — External scheduler service
- `scripts/agent.js` — Main agent process
