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

## Production Deployment

### Recommendations

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
