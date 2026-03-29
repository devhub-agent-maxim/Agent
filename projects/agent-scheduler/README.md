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
# Optional: Server port (default: 3002)
PORT=3002

# Optional: SQLite database file path (default: data/scheduler.db)
DATABASE_PATH=./data/scheduler.db

# Optional: Comma-separated list of allowed CORS origins
CORS_ALLOWED_ORIGINS=https://app.example.com,https://scheduler.example.com
```

### Environment Variable Validation

The application validates environment variables at startup before the server starts. If validation fails, the application will exit with code 1 and display clear error messages.

**All variables are optional** - the scheduler will use sensible defaults if not provided.

**Optional variables with validation:**
- `PORT` - Must be a valid number between 1 and 65535 (default: 3002)
- `DATABASE_PATH` - Must be a valid file path (default: data/scheduler.db)
- `CORS_ALLOWED_ORIGINS` - Must be valid HTTP/HTTPS URLs (comma-separated)

**Example validation errors:**
```
Environment validation failed:
  - PORT must be between 1 and 65535, got: 99999
  - CORS_ALLOWED_ORIGINS contains invalid URL: not-a-url
  - DATABASE_PATH contains invalid null character

Please set the required environment variables and try again.
See README.md for configuration details.
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

## Security

The API uses **helmet** middleware to set comprehensive security headers that protect against common web vulnerabilities.

### Security Headers

All endpoints include the following security headers:

| Header | Value | Protection |
|--------|-------|------------|
| `Content-Security-Policy` | Strict CSP for API (no inline scripts) | Prevents XSS and data injection attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS connections for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `X-DNS-Prefetch-Control` | `off` | Disables DNS prefetching for privacy |
| `X-Download-Options` | `noopen` | Prevents IE from executing downloads in site context |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| `X-Permitted-Cross-Domain-Policies` | `none` | Restricts Adobe Flash/PDF cross-domain access |

**Additional Protections:**
- ✅ `X-Powered-By` header removed (server fingerprinting prevention)
- ✅ CSP blocks all inline scripts/styles (strict API security)
- ✅ CSP includes `frame-ancestors 'none'` (clickjacking protection)
- ✅ HSTS preload flag enabled (browser HSTS preload list inclusion)

**Verify Security Headers:**
```bash
# Check all security headers
curl -I http://localhost:3002/health | grep -E "(Content-Security|Strict-Transport|X-Frame|X-Content-Type|X-DNS|Referrer|X-Permitted)"

# Expected output includes:
# content-security-policy: default-src 'self'; script-src 'self'...
# strict-transport-security: max-age=31536000; includeSubDomains; preload
# x-frame-options: DENY
# x-content-type-options: nosniff
# x-dns-prefetch-control: off
# referrer-policy: strict-origin-when-cross-origin
# x-permitted-cross-domain-policies: none
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
