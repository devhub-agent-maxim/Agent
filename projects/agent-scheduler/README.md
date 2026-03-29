# Agent Scheduler

A cron-like task scheduler built with TypeScript and Express, featuring SQLite persistence and node-cron background workers.

## Features

- ✅ **RESTful API** for managing scheduled tasks (Create, Read, Delete, Toggle)
- ✅ **SQLite Database** with sql.js for cross-platform compatibility
- ✅ **Background Worker** using node-cron to execute tasks on schedule
- ✅ **Cron Expression Validation** with support for 5-field and 6-field expressions
- ✅ **Graceful Shutdown** handling for clean resource cleanup
- ✅ **Comprehensive Tests** - 51 passing tests covering all functionality

## Installation

```bash
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## API Endpoints

### POST /schedules

Create a new scheduled task.

**Request Body:**
```json
{
  "name": "Daily Backup",
  "cron_expression": "0 2 * * *",
  "command": "node scripts/backup.js",
  "enabled": true
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Daily Backup",
  "cron_expression": "0 2 * * *",
  "command": "node scripts/backup.js",
  "enabled": 1,
  "last_run": null,
  "next_run": 1711670400,
  "created_at": 1711584000
}
```

### GET /schedules

List all scheduled tasks.

**Response (200):**
```json
{
  "schedules": [
    {
      "id": 1,
      "name": "Daily Backup",
      "cron_expression": "0 2 * * *",
      "command": "node scripts/backup.js",
      "enabled": 1,
      "last_run": null,
      "next_run": 1711670400,
      "created_at": 1711584000
    }
  ],
  "count": 1
}
```

### GET /schedules/:id

Get a specific scheduled task.

**Response (200):**
```json
{
  "id": 1,
  "name": "Daily Backup",
  "cron_expression": "0 2 * * *",
  "command": "node scripts/backup.js",
  "enabled": 1,
  "last_run": null,
  "next_run": 1711670400,
  "created_at": 1711584000
}
```

### DELETE /schedules/:id

Delete a scheduled task.

**Response:** 204 No Content

### PATCH /schedules/:id/toggle

Enable or disable a scheduled task.

**Request Body:**
```json
{
  "enabled": false
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Daily Backup",
  "cron_expression": "0 2 * * *",
  "command": "node scripts/backup.js",
  "enabled": 0,
  "last_run": null,
  "next_run": 1711670400,
  "created_at": 1711584000
}
```

## Cron Expression Format

The scheduler supports standard cron expressions with 5 or 6 fields:

**5-field format:**
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of Week (0-7) (0 and 7 both represent Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of Month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**6-field format:**
```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─ Day of Week (0-7)
│ │ │ │ └─── Month (1-12)
│ │ │ └───── Day of Month (1-31)
│ │ └─────── Hour (0-23)
│ └───────── Minute (0-59)
└─────────── Second (0-59)
```

**Examples:**
- `0 * * * *` - Every hour at minute 0
- `*/15 * * * *` - Every 15 minutes
- `0 2 * * *` - Daily at 2:00 AM
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 0 1 * *` - Monthly on the 1st at midnight

## Environment Variables

Create a `.env` file (see `.env.example`):

```env
PORT=3002
DATABASE_PATH=./data/scheduler.db
CORS_ALLOWED_ORIGINS=https://app.example.com,https://scheduler.example.com
```

### CORS Configuration

The API includes CORS (Cross-Origin Resource Sharing) middleware to control which origins can access the endpoints.

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
CORS_ALLOWED_ORIGINS=https://app.example.com,https://scheduler.example.com
```

**CORS features:**
- ✅ Credentials support (cookies and authorization headers)
- ✅ Preflight request caching (24 hours)
- ✅ Allowed methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- ✅ Allowed headers: Content-Type, Authorization, X-Requested-With, Accept, Origin
- ✅ Exposed headers: X-Request-Id

**Example CORS request:**

```bash
curl -X GET http://localhost:3002/schedules \
  -H "Origin: http://localhost:3000" \
  -H "Authorization: Bearer your-token"
```

## Database Schema

**scheduled_tasks table:**
- `id` - INTEGER PRIMARY KEY AUTOINCREMENT
- `name` - TEXT NOT NULL
- `cron_expression` - TEXT NOT NULL
- `command` - TEXT NOT NULL
- `enabled` - INTEGER NOT NULL DEFAULT 1
- `last_run` - INTEGER (Unix timestamp)
- `next_run` - INTEGER (Unix timestamp)
- `created_at` - INTEGER NOT NULL (Unix timestamp)

## Architecture

- **src/db/database.ts** - SQLite database initialization and management
- **src/db/schedules-repository.ts** - Data access layer for scheduled tasks
- **src/routes/schedules.ts** - Express routes for REST API
- **src/workers/scheduler-worker.ts** - Background cron worker
- **src/index.ts** - Main application entry point

## Testing

The project includes comprehensive tests covering:
- Database operations (14 tests)
- API endpoints (27 tests)
- Background worker (10 tests)

All tests use isolated in-memory databases to ensure independence.

## License

MIT
