# Agent Tools API

A TypeScript + Express REST API for productivity tools with SQLite persistence and API key authentication.

## Features

- ✅ CRUD operations for TODO items
- ✅ SQLite database persistence with better-sqlite3
- ✅ Bearer token authentication
- ✅ OpenAPI/Swagger documentation
- ✅ Comprehensive test coverage (45 tests)
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

## Authentication

All `/todos/*` endpoints require Bearer token authentication.

**Request Header:**
```
Authorization: Bearer your-api-key-here
```

**Responses:**
- `401 Unauthorized` - Missing or malformed authorization header
- `403 Forbidden` - Invalid API key
- `500 Internal Server Error` - API_KEYS not configured

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
│   │   └── auth.ts              # Bearer token authentication
│   ├── models/
│   │   └── todo.ts              # TypeScript interfaces
│   ├── routes/
│   │   └── todos.ts             # TODO API routes
│   ├── index.ts                 # Express app setup
│   └── swagger.ts               # OpenAPI specification
├── tests/
│   ├── auth.test.ts             # Authentication tests
│   ├── health.test.ts           # Health check tests
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
