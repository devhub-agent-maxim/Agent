# Agent Tools API

A TypeScript + Express REST API for productivity tools with SQLite persistence and API key authentication.

## Features

- ✅ CRUD operations for TODO items
- ✅ SQLite database persistence with better-sqlite3
- ✅ Comprehensive input validation with Joi
- ✅ Bearer token authentication
- ✅ Rate limiting (100 requests per 15 minutes per IP)
- ✅ CORS with configurable allowed origins
- ✅ Security headers with helmet (CSP, HSTS, XSS protection)
- ✅ Structured logging with Winston
- ✅ Request tracking with unique request IDs
- ✅ Centralized error handling
- ✅ OpenAPI/Swagger documentation
- ✅ Comprehensive test coverage (125+ tests)
- ✅ TypeScript with strict type checking

## Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Required: Comma-separated list of valid API keys for authentication
API_KEYS=your-secret-key-1,your-secret-key-2,your-secret-key-3

# Optional: Server port (default: 3000)
PORT=3000

# Optional: Log level - error, warn, info, debug (default: info)
LOG_LEVEL=info

# Optional: Comma-separated list of allowed CORS origins (default: localhost variants in dev)
CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
```

**Important**: Never commit your `.env` file to version control. API keys are sensitive credentials.

### Running the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## API Documentation

Interactive API documentation is available at `/api-docs` when the server is running.

Visit: `http://localhost:3000/api-docs`

## API Endpoints

### Health Check

**Public endpoint** - No authentication required

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "uptime": 123.456
}
```

### TODO Operations

**Protected endpoints** - Require Bearer token authentication

#### Input Validation Rules

All TODO endpoints use Joi validation with strict type checking:

**Title** (required for creation, optional for updates):
- Type: `string`
- Minimum length: 1 character (after trimming)
- Maximum length: 200 characters
- Whitespace is automatically trimmed
- Error messages:
  - Missing: "Title is required"
  - Empty string: "Title cannot be empty"
  - Too long: "Title cannot exceed 200 characters"
  - Wrong type: "Title must be a string"

**Description** (optional):
- Type: `string`
- Maximum length: 1000 characters
- Whitespace is automatically trimmed
- Empty strings are allowed
- Error messages:
  - Too long: "Description cannot exceed 1000 characters"
  - Wrong type: "Description must be a string"

**Completed** (optional):
- Type: `boolean` (strict - no type coercion)
- Must be `true` or `false`, not "true" or 1/0
- Error message:
  - Wrong type: "Completed must be a boolean"

**Update validation**:
- At least one field must be provided when updating
- Error message: "At least one field must be provided for update"

**Unknown fields** are silently stripped from requests.

#### Create a TODO

```bash
POST /todos
Authorization: Bearer your-api-key-here
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread"
}
```

#### List All TODOs

```bash
GET /todos
Authorization: Bearer your-api-key-here
```

#### Get a Specific TODO

```bash
GET /todos/:id
Authorization: Bearer your-api-key-here
```

#### Update a TODO

```bash
PUT /todos/:id
Authorization: Bearer your-api-key-here
Content-Type: application/json

{
  "title": "Updated title",
  "completed": true
}
```

#### Delete a TODO

```bash
DELETE /todos/:id
Authorization: Bearer your-api-key-here
```

## Security

### Authentication

All `/todos/*` endpoints require Bearer token authentication.

**Request Header:**
```
Authorization: Bearer your-api-key-here
```

**Responses:**
- `401 Unauthorized` - Missing or malformed authorization header
- `403 Forbidden` - Invalid API key
- `500 Internal Server Error` - API_KEYS not configured

### Rate Limiting

All `/todos/*` endpoints are protected by rate limiting to prevent abuse and ensure fair usage.

**Default Limits:**
- **100 requests per 15 minutes** per IP address
- Rate limit information is included in response headers:
  - `RateLimit-Limit`: Maximum requests allowed in the window
  - `RateLimit-Remaining`: Number of requests remaining
  - `RateLimit-Reset`: Timestamp when the rate limit resets

**Rate Limit Exceeded Response:**
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

**Status Code:** `429 Too Many Requests`

**Best Practices:**
- Monitor the `RateLimit-Remaining` header to track your usage
- Implement exponential backoff when receiving 429 responses
- Cache responses when possible to reduce API calls
- Distribute requests evenly throughout the time window

### CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured to allow secure browser-based access from trusted origins.

**Default Allowed Origins (Development):**
- `http://localhost:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:3001`

**Production Configuration:**

For production deployments, specify allowed origins via the `CORS_ALLOWED_ORIGINS` environment variable:

```env
CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com,https://admin.example.com
```

**CORS Features:**
- ✅ Credentials support (cookies, authorization headers)
- ✅ Preflight caching (24 hours)
- ✅ Standard HTTP methods (GET, POST, PUT, DELETE, OPTIONS)
- ✅ Common request headers (Content-Type, Authorization, etc.)
- ✅ Exposed custom headers (X-Request-Id)
- ✅ Requests without origin allowed (mobile apps, curl, Postman)

**CORS Error Response:**

When a request is made from a non-allowed origin, the browser will block the response:

```
Access to fetch at 'http://localhost:3000/todos' from origin 'https://evil.example.com'
has been blocked by CORS policy: Origin not allowed by CORS policy
```

**Security Best Practices:**
- Never use wildcard (`*`) origins in production
- Always specify exact origin URLs including protocol and port
- Keep the allowed origins list minimal - only include trusted domains
- Regularly audit and remove unused origins
- Use HTTPS origins in production

### Security Headers

The API uses **helmet** middleware to set comprehensive security headers that protect against common web vulnerabilities.

**Headers Applied:**

| Header | Value | Protection |
|--------|-------|------------|
| `Content-Security-Policy` | Strict CSP with `'self'` directives | Prevents XSS and data injection attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS connections for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `X-DNS-Prefetch-Control` | `off` | Disables DNS prefetching for privacy |
| `X-Download-Options` | `noopen` | Prevents IE from executing downloads in site context |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer information leakage |
| `X-Permitted-Cross-Domain-Policies` | `none` | Restricts Adobe Flash/PDF cross-domain access |

**Additional Protections:**
- ✅ `X-Powered-By` header removed (server fingerprinting prevention)
- ✅ CSP includes `frame-ancestors 'none'` (clickjacking protection)
- ✅ CSP includes `upgrade-insecure-requests` (automatic HTTPS upgrade)
- ✅ HSTS preload flag enabled (browser HSTS preload list inclusion)

**Security Headers for REST APIs:**

This configuration is optimized for REST API services:
- Strict Content-Security-Policy prevents script execution
- Frame blocking prevents UI redressing attacks
- HSTS ensures encrypted transport layer
- No script sources allowed (API responses should be JSON, not HTML/JS)

**Note:** These headers are applied to all routes automatically, including health checks, API documentation, and TODO endpoints.

## Logging

The application uses **Winston** for structured logging with configurable log levels and request tracking.

### Log Levels

Configure logging verbosity via the `LOG_LEVEL` environment variable:

| Level   | Priority | Description |
|---------|----------|-------------|
| `error` | 0 (highest) | Critical errors that need immediate attention |
| `warn`  | 1        | Warning messages for potential issues |
| `info`  | 2 (default) | General informational messages |
| `debug` | 3        | Detailed debugging information |

**Example:**
```env
LOG_LEVEL=debug  # Show all logs including debug
LOG_LEVEL=warn   # Show only warnings and errors
```

### Request Tracking

Every incoming request is automatically assigned a **unique request ID** (UUID v4) that appears in all related logs. This enables easy tracing of requests through the system.

**Request Log Format:**
```json
{
  "timestamp": "2026-03-29 02:15:00",
  "level": "info",
  "message": "Incoming request",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "/todos",
  "query": {},
  "ip": "::1"
}
```

**Completion Log Format:**
```json
{
  "timestamp": "2026-03-29 02:15:00",
  "level": "info",
  "message": "Request completed",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "/todos",
  "statusCode": 200,
  "duration": "45ms"
}
```

### Error Logging

Errors are automatically logged with full context:

- **Operational errors** (4xx status codes): Logged at `warn` level
- **System errors** (5xx status codes): Logged at `error` level with stack traces

**Error Log Example:**
```json
{
  "timestamp": "2026-03-29 02:15:00",
  "level": "error",
  "message": "Error occurred",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "statusCode": 500,
  "path": "/todos/123",
  "method": "GET",
  "stack": "Error: Database connection failed\n    at ..."
}
```

### Log Output Formats

- **Development**: Human-readable colorized console output
- **Production**: Structured JSON for log aggregation services

### Using Logger in Code

```typescript
import { logger, createLogger } from './utils/logger';

// Basic logging
logger.info('User action completed');
logger.error('Failed to process request', { userId: '123' });

// Child logger with context
const dbLogger = createLogger('Database');
dbLogger.debug('Query executed', { query: 'SELECT * FROM todos' });
```

## Graceful Shutdown

The application implements graceful shutdown handling to ensure clean termination of resources when the process receives shutdown signals.

### Shutdown Signals

The server listens for standard termination signals:

- **SIGTERM** - Standard termination signal (e.g., from Docker, Kubernetes, systemd)
- **SIGINT** - Interrupt signal (e.g., Ctrl+C in terminal)

### Shutdown Process

When a shutdown signal is received, the application performs these steps in order:

1. **Log the signal** - Records which signal triggered the shutdown
2. **Start timeout timer** - Sets a 10-second timeout to prevent hanging
3. **Stop accepting new requests** - Closes the HTTP server gracefully
4. **Wait for active requests** - Allows in-flight requests to complete
5. **Close database connection** - Cleanly closes the SQLite connection
6. **Log completion** - Records successful shutdown
7. **Exit process** - Terminates with appropriate exit code

### Shutdown Timeout

A **10-second timeout** is enforced to prevent the shutdown process from hanging indefinitely. If the shutdown doesn't complete within this window:

- The timeout handler logs an error
- The process is forcefully terminated with exit code 1
- This prevents resource leaks in containerized environments

### Shutdown Logging

All shutdown events are logged with Winston for observability:

```json
{
  "level": "info",
  "message": "SIGTERM received, starting graceful shutdown..."
}
```

```json
{
  "level": "info",
  "message": "Database connection closed"
}
```

```json
{
  "level": "info",
  "message": "Graceful shutdown complete"
}
```

### Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| `0` | Clean shutdown - all resources closed successfully |
| `1` | Error during shutdown - server close failed, database close failed, or timeout exceeded |

### Production Deployment

**Container Orchestration (Docker/Kubernetes):**
```yaml
# Example Kubernetes deployment
spec:
  containers:
  - name: agent-tools
    terminationGracePeriodSeconds: 15  # Allow more than 10s timeout
```

**Process Managers (PM2, systemd):**
```bash
# PM2 will send SIGINT on stop
pm2 start dist/index.js --name agent-tools

# systemd sends SIGTERM by default
systemctl stop agent-tools
```

### Testing Shutdown

**Manual Testing:**
```bash
# Start the server
npm start

# In another terminal, send SIGTERM
kill -SIGTERM $(pgrep -f "node.*index.js")

# Or use Ctrl+C to send SIGINT
```

**Automated Tests:**

The application includes comprehensive shutdown tests in `tests/shutdown.test.ts` that verify:
- Signal handling and logging
- Database connection closure
- Timeout enforcement (10 seconds)
- Error handling during shutdown
- Exit code correctness

## Database

The application uses SQLite for persistence. The database file is stored at `data/agent-tools.db` and is automatically created on first run.

### Database Schema

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  completed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Project Structure

```
agent-tools/
├── src/
│   ├── db/
│   │   ├── database.ts          # Database initialization
│   │   └── todos-repository.ts  # Repository pattern for TODOs
│   ├── middleware/
│   │   ├── auth.ts              # Bearer token authentication
│   │   ├── error-handler.ts     # Centralized error handling
│   │   ├── rate-limiter.ts      # Rate limiting
│   │   └── request-logger.ts    # Request logging & tracking
│   ├── models/
│   │   └── todo.ts              # TypeScript interfaces
│   ├── routes/
│   │   └── todos.ts             # TODO API routes
│   ├── utils/
│   │   └── logger.ts            # Winston logger configuration
│   ├── index.ts                 # Express app setup
│   └── swagger.ts               # OpenAPI specification
├── tests/
│   ├── auth.test.ts             # Authentication tests
│   ├── error-handler.test.ts    # Error handling tests
│   ├── health.test.ts           # Health check tests
│   ├── logger.test.ts           # Logger configuration tests
│   ├── rate-limiter.test.ts     # Rate limiting tests
│   ├── request-logger.test.ts   # Request logging tests
│   ├── todos.test.ts            # TODO CRUD tests
│   └── todos-persistence.test.ts # Database persistence tests
├── data/                         # SQLite database (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Write tests for all new features
- Keep functions small and focused

### Testing Strategy

- Unit tests for business logic
- Integration tests for API endpoints
- Database tests for persistence
- Authentication tests for security

### Building

```bash
npm run build
```

Outputs to `dist/` directory.

## License

MIT
