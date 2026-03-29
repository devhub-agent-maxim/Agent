# Agent Tools API

## What This Is
A production-grade TypeScript/Express REST API that serves as the agent's tool backend.
Provides task management, authentication, and integration endpoints for the autonomous agent system.
Powers the agent's ability to create, update, and track tasks programmatically.

## Stack
- Language: TypeScript (strict mode)
- Framework: Express 4
- Database: SQLite (better-sqlite3)
- Tests: Jest + Supertest
- Auth: Bearer token (API_KEYS env var)
- Port: 3000
- Docker: yes (Dockerfile present)

## Current Sprint Goal
Extend the API with agent-specific endpoints: task intake from Telegram, GitHub webhook receiver,
sprint status endpoint, and WebSocket support for real-time dashboard updates.

## Definition of Done
- [ ] All tests passing (npm test — currently 147 tests)
- [ ] Build succeeds (npm run build)
- [ ] New endpoints documented in Swagger (/api-docs)
- [ ] Docker build still works

## Backlog
- [ ] Add POST /api/tasks endpoint for Telegram-to-task intake
- [ ] Add GET /api/sprint endpoint returning current sprint status
- [ ] Add POST /api/webhook/github for GitHub issue event handling
- [ ] Add WebSocket endpoint for real-time dashboard updates
- [ ] Add GET /api/health with deep health check (DB + GitHub API)
- [ ] Add task priority field and GET /api/tasks?priority=high filter
- [ ] Add POST /api/tasks/:id/complete endpoint

## Architecture
Express app with layered structure:
- src/middleware/ — auth, cors, rate-limit, security-headers, validation
- src/routes/ — todos.ts (main resource router)
- src/models/ — Todo model with SQLite persistence
- src/swagger.ts — OpenAPI 3.0 spec
- tests/ — Jest + Supertest integration tests

## Constraints
- Every new route needs a test in tests/
- Use Joi for input validation on all POST/PUT endpoints
- Auth middleware must be applied to all non-health routes
- Keep src/index.ts under 200 lines (move logic to routes/)

## Links
- GitHub Issues: https://github.com/devhub-agent-maxim/Agent/issues?q=label%3Aagent-task
- Swagger docs: http://localhost:3000/api-docs
