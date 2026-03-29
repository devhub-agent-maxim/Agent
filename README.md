# Agent Stack

[![CI](https://github.com/devhub-agent-maxim/Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/devhub-agent-maxim/Agent/actions/workflows/ci.yml)
[![Docker Build](https://github.com/devhub-agent-maxim/Agent/actions/workflows/docker-build.yml/badge.svg)](https://github.com/devhub-agent-maxim/Agent/actions/workflows/docker-build.yml)
[![Security](https://github.com/devhub-agent-maxim/Agent/actions/workflows/security.yml/badge.svg)](https://github.com/devhub-agent-maxim/Agent/actions/workflows/security.yml)

Autonomous agent infrastructure with three core services orchestrated via Docker Compose.

## Services

### 1. Agent Tools (Port 3000)
Production-grade TODO API with:
- CRUD operations with SQLite persistence
- API key authentication (Bearer token)
- Rate limiting (100 req/15min default)
- Comprehensive error handling
- Structured logging with Winston
- Input validation with Joi
- CORS and security headers (helmet)
- OpenAPI/Swagger documentation at `/api-docs`

**Health Check:** `http://localhost:3000/health`

### 2. Agent Scheduler (Port 3002)
Cron-like task scheduler with:
- SQLite persistence (sql.js)
- REST API for schedule management
- node-cron background worker
- Enable/disable schedules dynamically
- Graceful shutdown handling

**Health Check:** `http://localhost:3002/health`

### 3. Agent Dashboard (Port 3001)
Real-time observability dashboard with:
- Service status monitoring
- Recent activity log (from `memory/daily/`)
- Active workers tracking
- Goals and tasks display
- Scheduled tasks overview
- Weekly metrics/analytics
- Memory browsing
- Auto-refresh every 5 seconds

**Health Check:** `http://localhost:3001/health`

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Git (for cloning the repository)

### 1. Clone and Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env and set your API key
# AGENT_TOOLS_API_KEY=your-secure-api-key-here
```

### 2. Build and Run

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 3. Access Services

- **Agent Tools API:** http://localhost:3000
- **Agent Dashboard:** http://localhost:3001
- **Agent Scheduler:** http://localhost:3002
- **API Documentation:** http://localhost:3000/api-docs

### 4. Test the Stack

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health

# Create a TODO (requires API key)
curl -X POST http://localhost:3000/api/todos \
  -H "Authorization: Bearer your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test TODO","description":"Testing the agent stack"}'

# View dashboard
open http://localhost:3001
```

## Docker Compose Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes (deletes data!)
docker-compose down -v

# Rebuild specific service
docker-compose build agent-tools

# View logs for specific service
docker-compose logs -f agent-dashboard

# Restart specific service
docker-compose restart agent-scheduler

# Execute command in running container
docker-compose exec agent-tools sh

# Scale services (not recommended for this stack)
docker-compose up -d --scale agent-tools=2
```

## Configuration

### Environment Variables

See `.env.example` for all available options. Key configurations:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `AGENT_TOOLS_PORT` | `3000` | Agent Tools port |
| `AGENT_DASHBOARD_PORT` | `3001` | Agent Dashboard port |
| `AGENT_SCHEDULER_PORT` | `3002` | Agent Scheduler port |
| `AGENT_TOOLS_API_KEY` | - | **Required:** API key for agent-tools |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3001` | Allowed CORS origins |
| `LOG_LEVEL` | `info` | Logging level |

### Volumes and Data Persistence

Docker volumes persist data across container restarts:

- `agent-tools-data` - SQLite database for TODOs
- `agent-tools-logs` - Application logs
- `agent-scheduler-data` - SQLite database for schedules
- `agent-scheduler-logs` - Application logs
- `agent-dashboard-logs` - Application logs
- `./memory` - Mounted read-only for dashboard monitoring

### Inter-Service Communication

Services communicate over a Docker bridge network (`agent-network`):

- Agent Dashboard → Agent Tools: `http://agent-tools:3000`
- Agent Dashboard → Agent Scheduler: `http://agent-scheduler:3002`

External access uses published ports (3000, 3001, 3002).

## Health Checks

All services include health checks that run every 30 seconds:

- **Interval:** 30s
- **Timeout:** 3s
- **Retries:** 3
- **Start Period:** 10-15s

Check health status:

```bash
docker-compose ps
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Port conflicts

Edit `.env` to change port mappings:

```env
AGENT_TOOLS_PORT=4000
AGENT_DASHBOARD_PORT=4001
AGENT_SCHEDULER_PORT=4002
```

### Database issues

```bash
# Remove volumes and start fresh
docker-compose down -v
docker-compose up -d
```

### View real-time logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f agent-tools
```

## Security

The agent stack includes comprehensive automated security scanning through GitHub Actions:

### Automated Security Scans

| Scan Type | Trigger | Description |
|-----------|---------|-------------|
| **npm audit** | Every push/PR | Scans dependencies for high/critical vulnerabilities in all projects |
| **CodeQL Analysis** | Push to main, PRs, weekly | Advanced semantic code analysis for JavaScript/TypeScript security issues |
| **Dependency Review** | Pull requests | Analyzes PR dependencies for known vulnerabilities and licensing issues |

### Security Scanning Features

- ✅ **npm audit** runs on every test job with `--audit-level=high` flag
  - Fails CI build if high or critical vulnerabilities detected
  - Scans all three projects: agent-tools, agent-dashboard, agent-scheduler
- ✅ **CodeQL** performs deep semantic analysis
  - Uses `security-extended` query suite for comprehensive coverage
  - Analyzes compiled JavaScript/TypeScript code
  - Runs weekly on schedule to catch newly discovered vulnerabilities
- ✅ **Dependency Review** protects the supply chain
  - Blocks PRs that introduce vulnerable dependencies
  - Posts automated summary comments on PRs
  - Configurable severity threshold (currently: high)

### Viewing Security Results

```bash
# View security workflow runs
gh workflow view security

# Check latest security scan results
gh run list --workflow=security.yml --limit 5

# View CodeQL alerts (requires repo access)
gh api repos/devhub-agent-maxim/Agent/code-scanning/alerts

# Check dependency vulnerabilities
cd projects/agent-tools && npm audit
cd projects/agent-dashboard && npm audit
cd projects/agent-scheduler && npm audit
```

### Security Best Practices

1. **Keep dependencies updated:** Regularly run `npm audit fix` to patch vulnerabilities
2. **Review security alerts:** Check GitHub Security tab for CodeQL findings
3. **Monitor PRs:** Review Dependency Review comments before merging
4. **Rotate credentials:** Change API keys regularly, never commit secrets
5. **Use strong authentication:** Enforce strong API keys in production

### Security Headers

All services implement security headers via helmet middleware:

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options (clickjacking protection)
- X-Content-Type-Options (MIME sniffing protection)
- Referrer-Policy

See individual service READMEs for detailed security configurations.

## Development

### Build Individual Services

```bash
cd projects/agent-tools && npm install && npm run build
cd projects/agent-dashboard && npm install && npm run build
cd projects/agent-scheduler && npm install && npm run build
```

### Run Tests

```bash
cd projects/agent-tools && npm test
cd projects/agent-dashboard && npm test
cd projects/agent-scheduler && npm test
```

### Local Development (without Docker)

```bash
# Terminal 1 - Agent Scheduler
cd projects/agent-scheduler
npm install
npm run dev

# Terminal 2 - Agent Tools
cd projects/agent-tools
npm install
npm run dev

# Terminal 3 - Agent Dashboard
cd projects/agent-dashboard
npm install
npm run dev
```

## Architecture

```
┌─────────────────┐
│ Agent Dashboard │ :3001
│  (Observability)│
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼────┐
│Tools │  │Sched  │
│:3000 │  │:3002  │
└──┬───┘  └───┬───┘
   │          │
   ▼          ▼
[SQLite]   [SQLite]
```

- **Agent Dashboard** monitors both services
- **Agent Tools** provides TODO API with auth/rate-limiting
- **Agent Scheduler** manages cron-like scheduled tasks
- All services use SQLite for persistence
- Services communicate over Docker network
- Dashboard mounts `memory/` read-only

## Deployment Guide

### Local Development Setup

#### Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Git**: Latest version
- **Docker & Docker Compose**: (Optional, for containerized development)

#### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/devhub-agent-maxim/Agent.git
   cd Agent
   ```

2. **Install dependencies for each service:**
   ```bash
   cd projects/agent-tools && npm install && cd ../..
   cd projects/agent-dashboard && npm install && cd ../..
   cd projects/agent-scheduler && npm install && cd ../..
   ```

3. **Configure environment variables:**

   Create `.env` files in each project directory:

   **projects/agent-tools/.env:**
   ```env
   API_KEYS=your-secure-api-key-change-this
   PORT=3000
   LOG_LEVEL=info
   CORS_ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000
   ```

   **projects/agent-dashboard/.env:**
   ```env
   PORT=3001
   LOG_LEVEL=info
   CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002
   ```

   **projects/agent-scheduler/.env:**
   ```env
   PORT=3002
   LOG_LEVEL=info
   CORS_ALLOWED_ORIGINS=http://localhost:3001
   ```

4. **Build all services:**
   ```bash
   cd projects/agent-tools && npm run build && cd ../..
   cd projects/agent-dashboard && npm run build && cd ../..
   cd projects/agent-scheduler && npm run build && cd ../..
   ```

5. **Run tests to verify setup:**
   ```bash
   cd projects/agent-tools && npm test && cd ../..
   cd projects/agent-dashboard && npm test && cd ../..
   cd projects/agent-scheduler && npm test && cd ../..
   ```

6. **Start services in separate terminals:**
   ```bash
   # Terminal 1 - Agent Tools
   cd projects/agent-tools && npm run dev

   # Terminal 2 - Agent Scheduler
   cd projects/agent-scheduler && npm run dev

   # Terminal 3 - Agent Dashboard
   cd projects/agent-dashboard && npm run dev
   ```

7. **Verify services are running:**
   ```bash
   curl http://localhost:3000/health  # Agent Tools
   curl http://localhost:3001/health  # Agent Dashboard
   curl http://localhost:3002/health  # Agent Scheduler
   ```

### Docker Compose Deployment

#### Quick Start

1. **Create environment file:**
   ```bash
   cat > .env << EOF
   NODE_ENV=production
   AGENT_TOOLS_PORT=3000
   AGENT_DASHBOARD_PORT=3001
   AGENT_SCHEDULER_PORT=3002
   AGENT_TOOLS_API_KEY=$(openssl rand -hex 32)
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   CORS_ALLOWED_ORIGINS=http://localhost:3001
   LOG_LEVEL=info
   EOF
   ```

2. **Build and start all services:**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

4. **Access services:**
   - **Agent Tools:** http://localhost:3000
   - **Agent Dashboard:** http://localhost:3001 (web UI)
   - **Agent Scheduler:** http://localhost:3002
   - **API Docs:** http://localhost:3000/api-docs

#### Docker Compose Commands Reference

```bash
# Start services in background
docker-compose up -d

# Start with rebuild
docker-compose up -d --build

# View service status
docker-compose ps

# View logs (all services)
docker-compose logs -f

# View logs (specific service)
docker-compose logs -f agent-tools

# Stop services (keep volumes)
docker-compose down

# Stop services and remove volumes (⚠️ deletes data!)
docker-compose down -v

# Restart specific service
docker-compose restart agent-dashboard

# Execute command in container
docker-compose exec agent-tools sh

# Scale specific service (not recommended for this stack)
docker-compose up -d --scale agent-scheduler=2
```

### Production Deployment Options

#### Option 1: Railway

**Best for:** Quick deployment with zero-config databases and automatic HTTPS

**Pros:**
- ✅ Simple Git-based deployment (`railway up`)
- ✅ Automatic HTTPS with custom domains
- ✅ Built-in PostgreSQL/Redis (can replace SQLite in production)
- ✅ Generous free tier ($5/month credit)
- ✅ One-click environment variable management
- ✅ Auto-restart on crashes

**Cons:**
- ❌ Higher cost at scale ($10-20/month per service after free tier)
- ❌ Limited control over infrastructure
- ❌ US/EU regions only

**Deployment Steps:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create new project
railway init

# Deploy agent-tools
cd projects/agent-tools
railway up

# Set environment variables
railway variables set API_KEYS=your-secret-key
railway variables set NODE_ENV=production

# Repeat for other services
```

**Cost estimate:** $15-30/month for all three services

---

#### Option 2: Fly.io

**Best for:** Global edge deployment with multi-region support

**Pros:**
- ✅ Global Anycast network with edge regions worldwide
- ✅ Free tier includes 3 VMs with 256MB RAM each (perfect for this stack)
- ✅ Built-in load balancing and auto-scaling
- ✅ Persistent volumes for SQLite databases
- ✅ Dockerfile-based deployment (we already have these!)
- ✅ Excellent free tier for side projects

**Cons:**
- ❌ Requires fly.toml configuration for each service
- ❌ More complex than Railway for beginners
- ❌ Paid tier gets expensive ($1.94/mo per 256MB VM after free tier)

**Deployment Steps:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy agent-tools
cd projects/agent-tools
flyctl launch --name agent-tools-prod
flyctl secrets set API_KEYS=your-secret-key
flyctl deploy

# Create persistent volume for SQLite
flyctl volumes create agent_tools_data --size 1

# Repeat for other services
```

**Cost estimate:** $0-15/month (free tier covers 3 services)

---

#### Option 3: Vercel (Agent Dashboard + API Routes)

**Best for:** Dashboard-only deployment with serverless API routes

**Pros:**
- ✅ Instant global CDN deployment
- ✅ Automatic HTTPS and custom domains
- ✅ Generous free tier (100GB bandwidth/month)
- ✅ GitHub integration with preview deployments
- ✅ Zero-config Next.js/Express support
- ✅ Fast cold starts for serverless

**Cons:**
- ❌ **Not suitable for agent-tools/agent-scheduler** (long-running workers, SQLite persistence)
- ❌ 10-second serverless timeout (free tier)
- ❌ No persistent disk (need external DB for agent-tools/scheduler)
- ❌ Requires adapting Express routes to Vercel serverless format

**Deployment Steps (Dashboard Only):**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy agent-dashboard
cd projects/agent-dashboard
vercel --prod

# Set environment variables
vercel env add AGENT_TOOLS_URL production
vercel env add AGENT_SCHEDULER_URL production
```

**Recommendation:** Deploy agent-tools and agent-scheduler on Fly.io/Railway, dashboard on Vercel for optimal performance and cost.

**Cost estimate:** $0/month (dashboard only on Vercel)

---

#### Comparison Table

| Feature | Railway | Fly.io | Vercel (Dashboard Only) |
|---------|---------|--------|-------------------------|
| **Setup Complexity** | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐⭐ Easy |
| **Free Tier** | $5/mo credit | 3x256MB VMs free | 100GB bandwidth |
| **Best For** | All 3 services | All 3 services | Dashboard only |
| **Global Edge** | ❌ US/EU only | ✅ Worldwide | ✅ Worldwide |
| **SQLite Support** | ✅ Yes | ✅ Yes (volumes) | ❌ No |
| **Long-running Workers** | ✅ Yes | ✅ Yes | ❌ No (10s timeout) |
| **Custom Domains** | ✅ Free HTTPS | ✅ Free HTTPS | ✅ Free HTTPS |
| **Estimated Cost/mo** | $15-30 | $0-15 | $0 (dashboard only) |

**Recommendation:** **Fly.io** for best price/performance ratio with global edge support.

### Environment Variables Reference

Complete reference for all three services:

| Variable | Service | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| `NODE_ENV` | All | ❌ | `production` | Node environment (development/production) |
| `PORT` | All | ❌ | Service-specific | HTTP server port (3000/3001/3002) |
| `LOG_LEVEL` | All | ❌ | `info` | Logging level (error/warn/info/debug) |
| **Agent Tools** | | | | |
| `API_KEYS` | agent-tools | ✅ | - | Comma-separated API keys for auth |
| `RATE_LIMIT_WINDOW_MS` | agent-tools | ❌ | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | agent-tools | ❌ | `100` | Max requests per window per IP |
| `CORS_ALLOWED_ORIGINS` | agent-tools | ❌ | `http://localhost:3001` | Comma-separated allowed CORS origins |
| **Agent Dashboard** | | | | |
| `AGENT_TOOLS_URL` | agent-dashboard | ❌ | `http://agent-tools:3000` | Agent Tools API URL (Docker network) |
| `AGENT_SCHEDULER_URL` | agent-dashboard | ❌ | `http://agent-scheduler:3002` | Agent Scheduler API URL (Docker network) |
| `CORS_ALLOWED_ORIGINS` | agent-dashboard | ❌ | `http://localhost:3000,http://localhost:3002` | Allowed CORS origins |
| **Agent Scheduler** | | | | |
| `CORS_ALLOWED_ORIGINS` | agent-scheduler | ❌ | `http://localhost:3001` | Allowed CORS origins |
| **Docker Compose** | | | | |
| `AGENT_TOOLS_PORT` | docker-compose | ❌ | `3000` | Published port for agent-tools |
| `AGENT_DASHBOARD_PORT` | docker-compose | ❌ | `3001` | Published port for agent-dashboard |
| `AGENT_SCHEDULER_PORT` | docker-compose | ❌ | `3002` | Published port for agent-scheduler |
| `AGENT_TOOLS_API_KEY` | docker-compose | ✅ | - | API key for agent-tools (mapped to API_KEYS) |

**Security Notes:**
- ✅ Required fields marked with checkmark must be set in production
- ⚠️ Never commit `.env` files or expose `API_KEYS` in logs/Git
- 🔒 Generate strong API keys: `openssl rand -hex 32` or `uuidgen`
- 🔑 Rotate API keys regularly (quarterly recommended)

### Post-Deployment Checklist

After deploying to production, verify the following:

#### 1. Health Checks

```bash
# Verify all services are healthy
curl https://your-domain.com:3000/health
curl https://your-domain.com:3001/health
curl https://your-domain.com:3002/health

# Expected response for all:
# {"status":"ok","uptime":123.456}

# Check Docker health status (if using Docker Compose)
docker-compose ps
# All services should show "Up (healthy)"
```

#### 2. Authentication & Security

```bash
# Test API authentication
curl -X POST https://your-domain.com:3000/api/todos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Auth test"}'
# Should return 201 Created

# Test without auth (should fail)
curl -X POST https://your-domain.com:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Should fail"}'
# Should return 401 Unauthorized

# Verify security headers
curl -I https://your-domain.com:3000/health | grep -E "X-Frame-Options|Strict-Transport-Security|Content-Security-Policy"
# Should show helmet security headers
```

#### 3. Rate Limiting

```bash
# Test rate limiting (make 101 requests)
for i in {1..101}; do
  curl -s -w "%{http_code}\n" -o /dev/null \
    -H "Authorization: Bearer YOUR_API_KEY" \
    https://your-domain.com:3000/api/todos
done
# Last request should return 429 Too Many Requests
```

#### 4. Data Persistence

```bash
# Create a TODO
curl -X POST https://your-domain.com:3000/api/todos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Persistence Test","description":"Should survive restart"}'

# Restart service
docker-compose restart agent-tools
# OR: flyctl apps restart agent-tools-prod

# Verify TODO still exists
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com:3000/api/todos
# Should include "Persistence Test"
```

#### 5. Monitoring Setup

- [ ] **Dashboard Access:** Open https://your-domain.com:3001 and verify UI loads
- [ ] **Metrics Collection:** Check `/api/metrics` endpoint returns weekly data
- [ ] **Log Aggregation:** Verify logs are being shipped to your logging service (if configured)
- [ ] **Uptime Monitoring:** Set up external uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] **Alerting:** Configure alerts for downtime, high error rates, or failed health checks

**Recommended Monitoring Tools:**
- **UptimeRobot** (free): Monitor `/health` endpoints every 5 minutes
- **Better Uptime** (free tier): HTTP checks + status page
- **Grafana Cloud** (free tier): Logs + metrics aggregation
- **Sentry** (free tier): Error tracking and performance monitoring

#### 6. Backup Configuration

```bash
# Backup Docker volumes (SQLite databases)
docker run --rm \
  -v agent-tools-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/agent-tools-$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v agent-scheduler-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/agent-scheduler-$(date +%Y%m%d).tar.gz /data

# Schedule daily backups with cron
# Add to crontab: 0 2 * * * /path/to/backup-script.sh
```

**Recommended Backup Strategy:**
- **Frequency:** Daily automated backups at 2 AM
- **Retention:** Keep 7 daily, 4 weekly, 3 monthly backups
- **Storage:** S3, Backblaze B2, or cloud provider object storage
- **Verification:** Test restore monthly to verify backup integrity

#### 7. Performance Verification

```bash
# Measure API response time (should be < 100ms for health checks)
time curl https://your-domain.com:3000/health

# Load test with Apache Bench (100 requests, 10 concurrent)
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com:3000/api/todos

# Check memory/CPU usage
docker stats agent-tools agent-dashboard agent-scheduler
# Memory should be < 512MB per service
# CPU should be < 10% at idle
```

#### 8. Production Hardening

- [ ] **API Key Rotation:** Set calendar reminder to rotate API keys quarterly
- [ ] **HTTPS Only:** Verify HTTP redirects to HTTPS (set up reverse proxy if needed)
- [ ] **Environment Variables:** All secrets loaded from environment, not hardcoded
- [ ] **Resource Limits:** Set CPU/memory limits in docker-compose.yml or platform config
- [ ] **Log Rotation:** Configure log rotation to prevent disk space issues
- [ ] **Database Limits:** Set max database size limits to prevent runaway growth
- [ ] **CORS Configuration:** Restrict CORS origins to specific domains (no wildcards)
- [ ] **Security Scanning:** GitHub Actions security workflows are enabled and passing

#### 9. Documentation

- [ ] **Runbook Created:** Document common operations (restart, backup, restore)
- [ ] **Incident Response:** Document who to contact and escalation procedures
- [ ] **Environment Docs:** Document all environment variables and their purposes
- [ ] **Architecture Diagram:** Update with production URLs and infrastructure details

#### 10. Final Smoke Test

```bash
# End-to-end workflow test
# 1. Create a TODO
TODO_ID=$(curl -s -X POST https://your-domain.com:3000/api/todos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test","description":"End-to-end test"}' \
  | jq -r '.id')

# 2. Retrieve the TODO
curl -s https://your-domain.com:3000/api/todos/$TODO_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  | jq

# 3. Update the TODO
curl -s -X PUT https://your-domain.com:3000/api/todos/$TODO_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test Updated","completed":true}' \
  | jq

# 4. Delete the TODO
curl -s -X DELETE https://your-domain.com:3000/api/todos/$TODO_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# 5. Verify dashboard shows activity
curl -s https://your-domain.com:3001/api/logs?count=5 | jq

# All steps should succeed with 200/201/204 responses
```

---

**Post-deployment success criteria:** All 10 checklist items above pass without errors.

## Production Deployment (Legacy)

### Additional Recommendations

1. **Change API Key:** Set strong `AGENT_TOOLS_API_KEY` in `.env`
2. **Use Secrets:** Store sensitive values in Docker secrets
3. **Reverse Proxy:** Use nginx/Traefik for SSL and routing
4. **Volume Backups:** Schedule backups of Docker volumes
5. **Log Aggregation:** Ship logs to external service (ELK, Datadog)
6. **Resource Limits:** Add CPU/memory limits in docker-compose.yml
7. **Monitoring:** Integrate with Prometheus/Grafana

### Example with Resource Limits

```yaml
services:
  agent-tools:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## Project Structure

```
.
├── docker-compose.yml          # Orchestration config
├── .env.example                # Environment template
├── README.md                   # This file
├── memory/                     # Agent memory (mounted read-only)
├── scripts/                    # Agent automation scripts
└── projects/
    ├── agent-tools/            # TODO API service
    │   ├── Dockerfile
    │   ├── src/
    │   └── tests/
    ├── agent-dashboard/        # Observability dashboard
    │   ├── Dockerfile
    │   ├── src/
    │   ├── public/
    │   └── tests/
    └── agent-scheduler/        # Task scheduler service
        ├── Dockerfile
        ├── src/
        └── tests/
```

## License

MIT

## Support

For issues or questions about individual services, see:
- [Agent Tools README](projects/agent-tools/README.md)
- [Agent Dashboard README](projects/agent-dashboard/README.md)
- [Agent Scheduler README](projects/agent-scheduler/README.md)
