# Error Handling Patterns

<!-- AGENT INSTRUCTIONS
Reusable error handling patterns for all agents in this workspace.
- Reference these patterns when writing new agents or reviewing existing ones
- Add new patterns as you discover them — include the source agent and date
- Format: ## [Pattern Name] followed by description, code block, and when-to-use
-->

---

## Pattern: Graceful Feature Skip

Use when an optional integration (API token, external service) is absent.
The agent should log clearly and continue, not fail.

```javascript
function deployGitHub(projectDir, description) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log('GitHub not configured — skipping git push');
    return { skipped: true };
  }
  // ... proceed with operation
  return { skipped: false };
}
```

Source: deploy-agent.js | Date: 2026-03-27

---

## Pattern: Structured Exit Result

Every agent should emit a single JSON line to stdout as its last output.
stderr is for logs; stdout carries the machine-readable result.

```javascript
// Always print structured result as the very last stdout line
process.stdout.write(JSON.stringify({
  agent: 'agent-name',
  status: 'success' | 'failure',
  projectName: '...',
  duration_ms: Date.now() - startTime,
  // ...additional fields
}) + '\n');

process.exit(result.status === 'success' ? 0 : 1);
```

Source: deploy-agent.js, jira-sync-agent.js | Date: 2026-03-27

---

## Pattern: stdin JSON OR CLI flags

Agents should accept input in two modes for flexibility:
1. CLI flags: `node agent.js --project foo --target vercel`
2. Piped JSON: `echo '{"projectName":"foo"}' | node agent.js`

```javascript
async function parseInput() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    // parse --flag value pairs
    const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : undefined; };
    return { projectName: get('--project'), target: get('--target') || 'github' };
  }
  // fallback: read from stdin
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) { reject(new Error('No input provided')); return; }
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => raw += c);
    process.stdin.on('end', () => { try { resolve(JSON.parse(raw.trim())); } catch(e) { reject(e); } });
  });
}
```

Source: deploy-agent.js | Date: 2026-03-27

---

## Pattern: Polling with Timeout

For async operations (deploys, builds) that need status polling.
Always set a max attempt count to avoid infinite loops.

```javascript
const MAX_ATTEMPTS = 30;      // 30 × 10s = 5 minutes
const POLL_INTERVAL_MS = 10000;

let attempt = 0;
let result = null;

while (attempt < MAX_ATTEMPTS) {
  await sleep(POLL_INTERVAL_MS);
  attempt++;

  const status = await checkStatus(id);
  log(`Poll ${attempt}/${MAX_ATTEMPTS} — state: ${status}`);

  if (status === 'READY') { result = await getResult(id); break; }
  if (status === 'ERROR' || status === 'CANCELED') {
    throw new Error(`Operation ${status}`);
  }
}

if (!result) throw new Error(`Operation timed out after ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
```

Source: deploy-agent.js (Vercel polling) | Date: 2026-03-27

---

## Pattern: Idempotent File Section Update

When updating a specific project/entity section in a Markdown file,
replace the section if it exists, append if it does not.
Prevents duplicate entries on repeated runs.

```javascript
function updateSection(filePath, sectionName, newContent) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const sectionRegex = new RegExp(`## ${sectionName}[\\s\\S]*?(?=\\n## |$)`, 'g');
  if (sectionRegex.test(content)) {
    content = content.replace(sectionRegex, newContent);
  } else {
    content += `\n${newContent}`;
  }
  fs.writeFileSync(filePath, content);
}
```

Source: deploy-agent.js | Date: 2026-03-27

---

## Pattern: Safe execSync Wrapper

Wrap execSync calls that may produce "acceptable" errors (e.g. nothing to commit).

```javascript
function runGit(command, env) {
  try {
    return execSync(command, { env, stdio: 'pipe' }).toString().trim();
  } catch (err) {
    const output = (err.stdout || '').toString() + (err.stderr || '').toString();
    if (output.includes('nothing to commit')) return 'nothing-to-commit';
    throw err; // re-throw unexpected errors
  }
}
```

Source: deploy-agent.js | Date: 2026-03-27

---

## Pattern: Daily Note Append (idempotent)

All agents write a log line to today's daily note. Create the file if absent.

```javascript
function appendDailyNote(agentName, message) {
  const dir = path.join(WORKSPACE_ROOT, 'memory', 'daily');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0,10)}.md`);
  const line = `- ${new Date().toISOString().slice(0,16).replace('T',' ')} | ${agentName} | ${message}\n`;
  if (fs.existsSync(file)) {
    fs.appendFileSync(file, line);
  } else {
    fs.writeFileSync(file, `# Daily Note — ${new Date().toISOString().slice(0,10)}\n\n${line}`);
  }
}
```

Source: deploy-agent.js, jira-sync-agent.js | Date: 2026-03-27


## 2026-03-27
Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired. Please obtain a new token or refresh your existing token."},"request_id":"req_011CZU2BCkV9JZG4D9P5DYDy"}

- 2026-03-28: Incremental feature layering pattern — build a REST API in sequential worker passes: (1) CRUD + in-memory storage, (2) OpenAPI docs, (3) database persistence, (4) authentication, (5) rate limiting. Each worker verifies tests pass before committing, keeping the main branch always green.
- 2026-03-28: Separate implementation worker from verification worker — after a feature worker completes, spawn a dedicated verify worker that re-runs tests and commits. This catches cases where the implementation worker's self-reported test count is optimistic.
- 2026-03-28: SQLite repository pattern for Express APIs — use `better-sqlite3` with a `TodoRepository` class in `src/db/todos-repository.ts` and a `database.ts` initializer. Store DB files under `data/` and add `data/` to `.gitignore`. Write 6 persistence-specific tests on top of existing unit tests.
- 2026-03-28: Bearer token middleware pattern — implement API key auth as Express middleware (`src/middleware/auth.ts`) that reads `Authorization: Bearer <key>` header, compares against `process.env.API_KEY`, and returns 401 on mismatch. Mount before all protected routes in `index.ts`.
- 2026-03-28: Auto-commit scoring at 6/10 — auto-committed chore/feat commits consistently scored 6/10 by the scoring hook. Score does not block commit but signals room for richer commit messages (add "why" and test counts).
- 2026-03-28: Decision engine unavailability causes work-loop stall — when the decision engine is offline, the work loop logs "No actionable work identified" every ~3 minutes. Backlog tasks are still picked up once the engine recovers; no manual intervention needed.
- 2026-03-28: Work loop yields to active workers during nightly consolidation — if a worker is mid-execution when consolidation starts, the loop logs a waiting message and defers until the worker completes, preventing file-write conflicts.
- 2026-03-28: express-rate-limit middleware pattern — install `express-rate-limit`, create `src/middleware/rate-limiter.ts` with a configurable `RateLimitRequestHandler` (e.g. 100 req/15 min window), and mount it per-router rather than globally so auth routes can have separate limits.
- 2026-03-28: Test count grows predictably with layered features — starting from 32 (CRUD), +1 (docs smoke test) = 33, +6 (persistence) = 39, +6 (auth) = 45, +3 (rate limit) = 48. Track cumulative test count in commit messages to catch regressions across worker handoffs.
