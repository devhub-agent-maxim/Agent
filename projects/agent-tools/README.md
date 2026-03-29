# Agent Tools API

[![Agent Tools CI](https://github.com/devhub-agent-maxim/Agent/actions/workflows/agent-tools-test.yml/badge.svg)](https://github.com/devhub-agent-maxim/Agent/actions/workflows/agent-tools-test.yml)

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
- ✅ Comprehensive test coverage (147+ tests including 14 rate limiting tests)
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

All `/todos/*` endpoints are protected by rate limiting to prevent abuse and ensure fair usage. The `/health` endpoint is **not rate limited** to allow continuous monitoring.

**Default Limits:**
- **100 requests per 15 minutes** per IP address
- Applies to: All `/todos/*` endpoints (POST, GET, PUT, DELETE)
- Exempt endpoints: `/health`, `/api-docs`

**Rate Limit Headers**

Every successful request includes rate limit information in the response headers:

| Header | Description | Example |
|--------|-------------|---------|
| `RateLimit-Limit` | Maximum requests allowed in the current window | `100` |
| `RateLimit-Remaining` | Number of requests remaining in the current window | `87` |
| `RateLimit-Reset` | Seconds until the rate limit window resets | `847` |

**When Rate Limit is Exceeded:**

When you exceed the rate limit, you'll receive a `429 Too Many Requests` response with additional headers:

| Header | Description | Example |
|--------|-------------|---------|
| `Retry-After` | Seconds to wait before making another request | `123` |
| `RateLimit-Remaining` | Always `0` when rate limited | `0` |

**Example Rate Limit Exceeded Response:**
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": "15 minutes"
}
```

**Status Code:** `429 Too Many Requests`

**Best Practices:**
- **Monitor headers:** Check `RateLimit-Remaining` to track your usage
- **Respect `Retry-After`:** Wait the specified seconds before retrying
- **Implement backoff:** Use exponential backoff when receiving 429 responses
- **Cache responses:** Reduce API calls by caching data when possible
- **Distribute requests:** Spread requests evenly throughout the time window
- **Plan for limits:** In high-traffic scenarios, implement request queuing

**Example Usage:**
```bash
# First request - check rate limit headers
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/todos \
  -v 2>&1 | grep -i ratelimit

# Response headers:
# RateLimit-Limit: 100
# RateLimit-Remaining: 99
# RateLimit-Reset: 897

# After 100 requests in 15 minutes:
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/todos

# 429 Too Many Requests
# Retry-After: 123
# RateLimit-Remaining: 0
```

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

## Docker

The application is fully containerized with Docker for easy deployment and consistent environments across development and production.

### Quick Start with Docker

```bash
# Build the Docker image
docker build -t agent-tools .

# Run with docker-compose (recommended)
docker-compose up -d

# Or run directly
docker run -d \
  -p 3000:3000 \
  -e API_KEY=your-secret-key \
  -e LOG_LEVEL=info \
  -v $(pwd)/data:/app/data \
  --name agent-tools-api \
  agent-tools
```

### Docker Configuration

#### Multi-Stage Build

The Dockerfile uses a multi-stage build for optimal image size and security:

**Build Stage:**
- Uses `node:18-alpine` base image
- Installs build dependencies for native modules (better-sqlite3)
- Compiles TypeScript to JavaScript
- Image size: ~500MB (not shipped)

**Production Stage:**
- Uses `node:18-alpine` base image
- Installs only production dependencies
- Copies pre-built files from build stage
- Runs as non-root user (`nodejs:1001`)
- Final image size: ~150MB

#### Environment Variables

Configure the container using environment variables in `.env` or `docker-compose.yml`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode (development, production) |
| `PORT` | No | `3000` | Server port (always 3000 inside container) |
| `API_KEY` | **Yes** | - | API authentication key (use strong random value) |
| `CORS_ALLOWED_ORIGINS` | No | localhost variants | Comma-separated list of allowed CORS origins |
| `LOG_LEVEL` | No | `info` | Logging verbosity (error, warn, info, debug) |

**Example `.env` file:**
```env
NODE_ENV=production
API_KEY=super-secret-key-change-this-in-production
CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
LOG_LEVEL=info
```

#### Volume Mounts

The docker-compose configuration includes persistent volumes:

| Mount | Purpose | Path (Host) | Path (Container) |
|-------|---------|-------------|------------------|
| Database | Persist SQLite database across container restarts | `./data` | `/app/data` |
| Logs | Optional log file persistence | `./logs` | `/app/logs` |

**Important:** Ensure the `data/` directory has proper permissions for the container user (UID 1001).

#### Health Check

The container includes a built-in health check that verifies the application is responsive:

- **Endpoint:** `GET /health`
- **Interval:** 30 seconds
- **Timeout:** 3 seconds
- **Start Period:** 5 seconds (grace period during startup)
- **Retries:** 3 attempts before marking unhealthy

**Check health status:**
```bash
docker inspect --format='{{.State.Health.Status}}' agent-tools-api
```

### Docker Commands

**Build the image:**
```bash
docker build -t agent-tools:latest .
```

**Run the container:**
```bash
docker run -d \
  -p 3000:3000 \
  -e API_KEY=your-secret-key \
  -v $(pwd)/data:/app/data \
  --name agent-tools-api \
  agent-tools:latest
```

**Using docker-compose:**
```bash
# Start services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

**View container logs:**
```bash
docker logs -f agent-tools-api
```

**Execute commands inside container:**
```bash
# Open shell
docker exec -it agent-tools-api sh

# Check database
docker exec -it agent-tools-api ls -la /app/data
```

**Stop and remove container:**
```bash
docker stop agent-tools-api
docker rm agent-tools-api
```

### Production Deployment

**Security Best Practices:**

1. **Use secrets management** - Never hardcode API keys in docker-compose.yml
   ```bash
   docker secret create api_key ./api_key.txt
   ```

2. **Read-only filesystem** - Add security constraints
   ```yaml
   security_opt:
     - no-new-privileges:true
   read_only: true
   tmpfs:
     - /tmp
   ```

3. **Resource limits** - Prevent resource exhaustion
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1'
         memory: 512M
       reservations:
         cpus: '0.5'
         memory: 256M
   ```

4. **Network isolation** - Use custom networks
   ```yaml
   networks:
     agent-tools-network:
       driver: bridge
       internal: false
   ```

**Container Orchestration:**

The application is designed for container orchestration platforms:

- **Kubernetes**: Use the Dockerfile with a Deployment manifest
- **Docker Swarm**: Use docker-compose.yml with swarm mode
- **Amazon ECS/Fargate**: Compatible with ECS task definitions
- **Google Cloud Run**: Works with Cloud Run deployments

**Example Kubernetes Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-tools
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-tools
  template:
    metadata:
      labels:
        app: agent-tools
    spec:
      containers:
      - name: agent-tools
        image: agent-tools:latest
        ports:
        - containerPort: 3000
        env:
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: agent-tools-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
```

### Troubleshooting

**Container won't start:**
```bash
# Check container logs
docker logs agent-tools-api

# Check health status
docker inspect agent-tools-api | grep Health -A 10
```

**Permission errors on data directory:**
```bash
# Fix permissions for container user (UID 1001)
sudo chown -R 1001:1001 ./data
```

**Database locked errors:**
```bash
# Ensure only one container is accessing the database
docker ps | grep agent-tools

# Stop all containers using the database
docker stop $(docker ps -q --filter name=agent-tools)
```

**Port already in use:**
```bash
# Change the host port in docker-compose.yml or use different port
docker run -p 3001:3000 ... agent-tools
```

## Deployment

The Agent Tools API supports multiple deployment options for different hosting platforms and infrastructure setups.

### Option 1: Vercel Deployment

Vercel provides serverless deployment with automatic HTTPS, global CDN, and zero-configuration scaling.

#### Prerequisites

- Vercel account ([vercel.com](https://vercel.com))
- Vercel CLI: `npm install -g vercel`

#### Setup

1. **Configure environment variables in Vercel:**

```bash
# Using Vercel CLI
vercel secrets add agent-tools-api-key "your-secure-api-key-here"
vercel secrets add agent-tools-cors-origins "https://app.example.com,https://dashboard.example.com"
```

Or via Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `API_KEY` | Your secure API key | Authentication key (use strong random value) |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | Logging verbosity (error, warn, info, debug) |

2. **Deploy:**

```bash
# Production deployment
vercel --prod

# Preview deployment
vercel
```

The `vercel.json` configuration includes:
- **Node.js 18** runtime
- **1024MB** memory allocation
- **10 second** max function duration
- **iad1** region (US East)
- Automatic builds from `package.json`

#### Health Check Verification

```bash
curl https://your-app.vercel.app/health
# Expected: {"status":"ok","uptime":123.456}
```

#### Limitations

- **Serverless SQLite**: Database resets on each deployment (use external database for persistence)
- **10 second timeout**: Long-running requests will be terminated
- **Cold starts**: First request after idle may be slower

### Option 2: Railway Deployment

Railway provides container-based deployment with persistent volumes, databases, and automatic HTTPS.

#### Prerequisites

- Railway account ([railway.app](https://railway.app))
- Railway CLI: `npm install -g @railway/cli`

#### Setup

1. **Login to Railway:**

```bash
railway login
```

2. **Create new project:**

```bash
railway init
```

3. **Configure environment variables:**

Via Railway Dashboard → Variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Server port |
| `API_KEY` | Your secure API key | Authentication key |
| `CORS_ALLOWED_ORIGINS` | `https://app.example.com` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | Logging verbosity |

4. **Deploy:**

```bash
# Deploy to Railway
railway up
```

The `railway.json` configuration includes:
- **Dockerfile-based** deployment
- **Single replica** (scale via dashboard)
- **Auto-restart** on failure (max 10 retries)
- **Health check** at `/health` endpoint (30 second interval)

#### Persistent Storage

Railway provides persistent volumes for SQLite database:

1. Go to your project → Service → Variables
2. Add mount: `/app/data` → Creates persistent volume
3. Database persists across deployments

#### Health Check Verification

```bash
curl https://your-app.railway.app/health
# Expected: {"status":"ok","uptime":123.456}
```

#### Monitoring

View logs and metrics in Railway Dashboard:
- Real-time logs
- CPU/Memory usage
- Request metrics
- Health check status

### Option 3: PM2 Process Management

PM2 provides production process management for Node.js with clustering, auto-restart, and log rotation.

#### Prerequisites

- PM2 installed: `npm install -g pm2`
- Node.js 18+ installed on server

#### Setup

1. **Build the application:**

```bash
npm install
npm run build
```

2. **Configure environment variables:**

Create `.env` file in project root:

```env
NODE_ENV=production
PORT=3000
API_KEY=your-secure-api-key-here
CORS_ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
LOG_LEVEL=info
```

3. **Start with PM2:**

```bash
# Start in production mode
pm2 start ecosystem.config.js --env production

# Or start directly
pm2 start dist/index.js --name agent-tools-api
```

The `ecosystem.config.js` configuration includes:
- **Cluster mode**: Scales across all CPU cores in production
- **Auto-restart**: Restarts on crashes
- **Memory limit**: Restarts if exceeds 500MB
- **Log rotation**: Keeps last 5 log files (10MB each, compressed)
- **Graceful shutdown**: 10 second timeout
- **Daily restart**: Automatic restart at 3am (configurable)

#### PM2 Commands

```bash
# View running processes
pm2 list

# View logs
pm2 logs agent-tools-api

# Monitor CPU/Memory
pm2 monit

# Restart application
pm2 restart agent-tools-api

# Stop application
pm2 stop agent-tools-api

# View detailed info
pm2 show agent-tools-api

# Save PM2 configuration (survive reboots)
pm2 save
pm2 startup
```

#### Health Check Verification

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","uptime":123.456}
```

#### Production Best Practices

1. **Enable startup script** (auto-start on server reboot):
```bash
pm2 startup
pm2 save
```

2. **Set up log rotation** (prevent disk space issues):
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
```

3. **Monitor with PM2 Plus** (optional, advanced monitoring):
```bash
pm2 link <public-key> <secret-key>
```

4. **Configure reverse proxy** (nginx recommended):
```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Deployment Comparison

| Feature | Vercel | Railway | PM2 |
|---------|--------|---------|-----|
| **Deployment Type** | Serverless | Container | Traditional VPS |
| **Persistent Database** | ❌ No | ✅ Yes | ✅ Yes |
| **Auto-scaling** | ✅ Automatic | ⚙️ Manual | ⚙️ Cluster mode |
| **HTTPS** | ✅ Automatic | ✅ Automatic | ⚙️ Manual (nginx) |
| **Zero-downtime deploys** | ✅ Yes | ✅ Yes | ⚙️ With reload |
| **Cold starts** | ⚠️ Yes | ❌ No | ❌ No |
| **Cost** | Free tier available | Free tier available | Server costs only |
| **Best For** | Stateless APIs, dev/staging | Full-stack apps with DB | Long-running, control, cost optimization |

### Post-Deployment Checklist

After deploying to any platform, verify:

1. **Health endpoint responds:**
```bash
curl https://your-domain.com/health
# Expected: {"status":"ok","uptime":123.456}
```

2. **Authentication works:**
```bash
curl -H "Authorization: Bearer your-api-key" \
     https://your-domain.com/todos
# Expected: [] (empty array or existing TODOs)
```

3. **CORS is configured:**
```bash
curl -H "Origin: https://your-allowed-origin.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://your-domain.com/todos
# Expected: CORS headers in response
```

4. **Rate limiting active:**
```bash
# Send 101 requests rapidly
for i in {1..101}; do
  curl https://your-domain.com/health
done
# Expected: 429 Too Many Requests after 100 requests
```

5. **Logs are being written:**
- Vercel: Check Vercel Dashboard → Logs
- Railway: Check Railway Dashboard → Logs
- PM2: Run `pm2 logs agent-tools-api`

6. **Database persistence (Railway/PM2 only):**
```bash
# Create a TODO
curl -X POST https://your-domain.com/todos \
     -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test TODO"}'

# Restart service

# Verify TODO still exists
curl https://your-domain.com/todos \
     -H "Authorization: Bearer your-api-key"
# Expected: TODO from previous request still present
```

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
