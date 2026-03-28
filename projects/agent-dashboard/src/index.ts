import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const app = express();
const PORT = 3001;
const ROOT = path.resolve(__dirname, '..', '..', '..');

// Helper: Read goals from memory/goals.md
function readGoals(): { active: string[]; waiting: string[]; completed: string[] } {
  try {
    const goalsPath = path.join(ROOT, 'memory', 'goals.md');
    const content = fs.readFileSync(goalsPath, 'utf8');

    const active: string[] = [];
    const waiting: string[] = [];
    const completed: string[] = [];

    let section: 'none' | 'active' | 'waiting' | 'completed' = 'none';

    for (const line of content.split('\n')) {
      if (line.includes('## Active Goals')) section = 'active';
      else if (line.includes('## Waiting Goals')) section = 'waiting';
      else if (line.includes('## Completed Goals')) section = 'completed';
      else if (line.startsWith('###')) {
        const goal = line.replace(/^###\s*/, '').trim();
        if (section === 'active') active.push(goal);
        else if (section === 'waiting') waiting.push(goal);
        else if (section === 'completed') completed.push(goal);
      }
    }

    return { active, waiting, completed };
  } catch (err) {
    return { active: [], waiting: [], completed: [] };
  }
}

// Helper: Get active workers
function getActiveWorkers(): Array<{ id: string; task: string; runningMs: number }> {
  try {
    const workersPath = path.join(ROOT, 'scripts', 'lib', 'workers.js');
    const workers = require(workersPath);
    return workers.listActive();
  } catch (err) {
    return [];
  }
}

// Helper: Read last N daily log entries
function readDailyLog(count: number = 20): string[] {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(ROOT, 'memory', 'daily', `${today}.md`);
    const content = fs.readFileSync(logPath, 'utf8');

    const entries = content
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .slice(-count);

    return entries;
  } catch (err) {
    return [];
  }
}

// Helper: Get git status
function getGitStatus(): { branch: string; commits: string[] } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: ROOT,
      encoding: 'utf8'
    }).trim();

    const commits = execSync('git log --oneline -5', {
      cwd: ROOT,
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    return { branch, commits };
  } catch (err) {
    return { branch: 'unknown', commits: [] };
  }
}

// Helper: Check decision engine status
function getDecisionEngineStatus(): { available: boolean; message: string } {
  try {
    const deciderPath = path.join(ROOT, 'scripts', 'lib', 'decider.js');
    const exists = fs.existsSync(deciderPath);
    return {
      available: exists,
      message: exists ? 'Decision engine ready' : 'Decision engine not found'
    };
  } catch (err) {
    return { available: false, message: 'Error checking decision engine' };
  }
}

// API endpoints
app.get('/api/status', (req: Request, res: Response) => {
  const status = {
    goals: readGoals(),
    workers: getActiveWorkers(),
    recentLogs: readDailyLog(20),
    git: getGitStatus(),
    decisionEngine: getDecisionEngineStatus(),
    timestamp: new Date().toISOString(),
  };

  res.json(status);
});

app.get('/api/logs', (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string) || 20;
  const logs = readDailyLog(count);

  res.json({
    logs,
    count: logs.length,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/goals', (req: Request, res: Response) => {
  const goals = readGoals();

  res.json({
    goals,
    summary: {
      active: goals.active.length,
      waiting: goals.waiting.length,
      completed: goals.completed.length,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/recent-activity', (req: Request, res: Response) => {
  const count = parseInt(req.query.count as string) || 20;
  const logs = readDailyLog(count);

  res.json({
    activity: logs,
    count: logs.length,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/workers', (req: Request, res: Response) => {
  const workers = getActiveWorkers();

  res.json({
    workers,
    count: workers.length,
    timestamp: new Date().toISOString(),
  });
});

// Web UI
app.get('/', (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      padding: 20px;
    }
    h1 { color: #58a6ff; margin-bottom: 20px; font-size: 28px; }
    h2 { color: #8b949e; font-size: 18px; margin: 20px 0 10px; border-bottom: 1px solid #21262d; padding-bottom: 5px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 16px;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-success { background: #238636; color: #fff; }
    .badge-warning { background: #9e6a03; color: #fff; }
    .badge-error { background: #da3633; color: #fff; }
    .log-entry {
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px solid #21262d;
      font-family: 'Courier New', monospace;
    }
    .log-entry:last-child { border-bottom: none; }
    .worker-item {
      background: #0d1117;
      padding: 10px;
      margin: 8px 0;
      border-radius: 4px;
      border-left: 3px solid #58a6ff;
    }
    .goal-item {
      padding: 8px;
      margin: 6px 0;
      background: #0d1117;
      border-radius: 4px;
    }
    .timestamp {
      text-align: right;
      font-size: 12px;
      color: #8b949e;
      margin-top: 10px;
    }
    .commit {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      padding: 4px 0;
    }
    .empty-state { color: #8b949e; font-style: italic; padding: 10px 0; }
    .refresh-indicator {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #238636;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .refresh-indicator.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 Agent Dashboard</h1>

    <div class="grid">
      <div class="card">
        <h2>Active Goals</h2>
        <div id="goals-active"></div>
      </div>

      <div class="card">
        <h2>Active Workers</h2>
        <div id="workers"></div>
      </div>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h2>Recent Activity (Last 20 entries)</h2>
      <div id="logs"></div>
    </div>

    <div class="grid" style="margin-top: 20px;">
      <div class="card">
        <h2>Git Status</h2>
        <div id="git"></div>
      </div>

      <div class="card">
        <h2>Decision Engine</h2>
        <div id="decision-engine"></div>
      </div>
    </div>

    <div class="timestamp" id="timestamp"></div>
  </div>

  <div class="refresh-indicator" id="refresh-indicator">Refreshing...</div>

  <script>
    async function fetchStatus() {
      const indicator = document.getElementById('refresh-indicator');
      indicator.classList.add('show');

      try {
        const response = await fetch('/api/status');
        const data = await response.json();

        // Goals
        const goalsActive = document.getElementById('goals-active');
        if (data.goals.active.length === 0) {
          goalsActive.innerHTML = '<div class="empty-state">No active goals</div>';
        } else {
          goalsActive.innerHTML = data.goals.active.map(g =>
            \`<div class="goal-item">\${g}</div>\`
          ).join('');
        }

        // Workers
        const workers = document.getElementById('workers');
        if (data.workers.length === 0) {
          workers.innerHTML = '<div class="empty-state">No active workers</div>';
        } else {
          workers.innerHTML = data.workers.map(w =>
            \`<div class="worker-item">
              <strong>\${w.id}</strong><br>
              <small>\${w.task}</small><br>
              <small>Running: \${Math.round(w.runningMs / 1000)}s</small>
            </div>\`
          ).join('');
        }

        // Logs
        const logs = document.getElementById('logs');
        if (data.recentLogs.length === 0) {
          logs.innerHTML = '<div class="empty-state">No log entries</div>';
        } else {
          logs.innerHTML = data.recentLogs.map(l =>
            \`<div class="log-entry">\${l}</div>\`
          ).join('');
        }

        // Git
        const git = document.getElementById('git');
        git.innerHTML = \`
          <div><strong>Branch:</strong> \${data.git.branch}</div>
          <h3 style="margin-top: 10px; font-size: 14px; color: #8b949e;">Recent Commits:</h3>
          \${data.git.commits.map(c => \`<div class="commit">\${c}</div>\`).join('')}
        \`;

        // Decision Engine
        const de = document.getElementById('decision-engine');
        const badgeClass = data.decisionEngine.available ? 'badge-success' : 'badge-error';
        de.innerHTML = \`
          <span class="status-badge \${badgeClass}">
            \${data.decisionEngine.available ? '✓ Available' : '✗ Unavailable'}
          </span>
          <div style="margin-top: 8px;">\${data.decisionEngine.message}</div>
        \`;

        // Timestamp
        document.getElementById('timestamp').textContent =
          'Last updated: ' + new Date(data.timestamp).toLocaleString();

      } catch (err) {
        console.error('Failed to fetch status:', err);
      }

      setTimeout(() => indicator.classList.remove('show'), 500);
    }

    // Initial fetch
    fetchStatus();

    // Auto-refresh every 10 seconds
    setInterval(fetchStatus, 10000);
  </script>
</body>
</html>`);
});

// Only start server if running directly (not during tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Agent Dashboard running at http://localhost:${PORT}`);
  });
}

export default app;
