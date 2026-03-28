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

// Helper: Read tasks from memory/TASKS.md
function readTasks(): { inProgress: string[]; pending: string[]; completed: string[] } {
  try {
    const tasksPath = path.join(ROOT, 'memory', 'TASKS.md');
    const content = fs.readFileSync(tasksPath, 'utf8');

    const inProgress: string[] = [];
    const pending: string[] = [];
    const completed: string[] = [];

    let section: 'none' | 'inProgress' | 'pending' | 'completed' = 'none';

    for (const line of content.split('\n')) {
      if (line.includes('## 🔄 In Progress')) section = 'inProgress';
      else if (line.includes('## 📋 Pending')) section = 'pending';
      else if (line.includes('## ✅ Completed')) section = 'completed';
      else if (line.trim().startsWith('-')) {
        const task = line.trim();
        if (section === 'inProgress') inProgress.push(task);
        else if (section === 'pending') pending.push(task);
        else if (section === 'completed') completed.push(task);
      }
    }

    return { inProgress, pending, completed };
  } catch (err) {
    return { inProgress: [], pending: [], completed: [] };
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

app.get('/api/tasks', (req: Request, res: Response) => {
  const tasks = readTasks();

  res.json({
    tasks,
    summary: {
      inProgress: tasks.inProgress.length,
      pending: tasks.pending.length,
      completed: tasks.completed.length,
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
    h2 { color: #8b949e; font-size: 18px; margin: 15px 0 10px; border-bottom: 1px solid #21262d; padding-bottom: 5px; }
    h3 { color: #7d8590; font-size: 15px; margin: 12px 0 8px; }
    .container { max-width: 1600px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 16px;
    }
    .full-width { grid-column: 1 / -1; }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
    .badge-success { background: #238636; color: #fff; }
    .badge-warning { background: #9e6a03; color: #fff; }
    .badge-info { background: #1f6feb; color: #fff; }
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
    .item {
      padding: 8px;
      margin: 6px 0;
      background: #0d1117;
      border-radius: 4px;
      font-size: 14px;
    }
    .task-item { border-left: 3px solid #58a6ff; }
    .goal-item { border-left: 3px solid #3fb950; }
    .completed-item {
      border-left: 3px solid #8b949e;
      opacity: 0.7;
    }
    .timestamp {
      text-align: right;
      font-size: 12px;
      color: #8b949e;
      margin-top: 15px;
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
      z-index: 1000;
    }
    .refresh-indicator.show { opacity: 1; }
    .section-count {
      font-size: 13px;
      color: #7d8590;
      font-weight: normal;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 Agent Dashboard</h1>

    <!-- Recent Activity Section -->
    <div class="card full-width">
      <h2>📊 Recent Activity <span class="section-count" id="activity-count">(0)</span></h2>
      <div id="recent-activity"></div>
    </div>

    <!-- Workers and Goals Grid -->
    <div class="grid" style="margin-top: 20px;">
      <div class="card">
        <h2>👷 Active Workers <span class="section-count" id="workers-count">(0)</span></h2>
        <div id="workers"></div>
      </div>

      <div class="card">
        <h2>🎯 Goals</h2>
        <h3>Active <span class="section-count" id="goals-active-count">(0)</span></h3>
        <div id="goals-active"></div>
        <h3 style="margin-top: 15px;">Waiting <span class="section-count" id="goals-waiting-count">(0)</span></h3>
        <div id="goals-waiting"></div>
        <h3 style="margin-top: 15px;">Completed (Last 3) <span class="section-count" id="goals-completed-count">(0)</span></h3>
        <div id="goals-completed"></div>
      </div>
    </div>

    <!-- Tasks Section -->
    <div class="card" style="margin-top: 20px;">
      <h2>✅ Tasks</h2>
      <div class="grid">
        <div>
          <h3>In Progress <span class="section-count" id="tasks-progress-count">(0)</span></h3>
          <div id="tasks-progress"></div>
        </div>
        <div>
          <h3>Pending <span class="section-count" id="tasks-pending-count">(0)</span></h3>
          <div id="tasks-pending"></div>
        </div>
        <div>
          <h3>Completed (Last 5) <span class="section-count" id="tasks-completed-count">(0)</span></h3>
          <div id="tasks-completed"></div>
        </div>
      </div>
    </div>

    <div class="timestamp" id="timestamp"></div>
  </div>

  <div class="refresh-indicator" id="refresh-indicator">Refreshing...</div>

  <script>
    async function fetchAllData() {
      const indicator = document.getElementById('refresh-indicator');
      indicator.classList.add('show');

      try {
        // Fetch all endpoints in parallel
        const [activityRes, workersRes, goalsRes, tasksRes] = await Promise.all([
          fetch('/api/recent-activity?count=10'),
          fetch('/api/workers'),
          fetch('/api/goals'),
          fetch('/api/tasks')
        ]);

        const [activity, workers, goals, tasks] = await Promise.all([
          activityRes.json(),
          workersRes.json(),
          goalsRes.json(),
          tasksRes.json()
        ]);

        // Recent Activity
        const activityDiv = document.getElementById('recent-activity');
        document.getElementById('activity-count').textContent = \`(\${activity.count})\`;
        if (activity.activity.length === 0) {
          activityDiv.innerHTML = '<div class="empty-state">No recent activity</div>';
        } else {
          activityDiv.innerHTML = activity.activity.map(entry =>
            \`<div class="log-entry">\${entry}</div>\`
          ).join('');
        }

        // Workers
        const workersDiv = document.getElementById('workers');
        document.getElementById('workers-count').textContent = \`(\${workers.count})\`;
        if (workers.workers.length === 0) {
          workersDiv.innerHTML = '<div class="empty-state">No active workers</div>';
        } else {
          workersDiv.innerHTML = workers.workers.map(w =>
            \`<div class="worker-item">
              <strong>\${w.id}</strong><br>
              <small>\${w.task}</small><br>
              <small style="color: #58a6ff;">Running: \${Math.round(w.runningMs / 1000)}s</small>
            </div>\`
          ).join('');
        }

        // Goals - Active
        const goalsActiveDiv = document.getElementById('goals-active');
        document.getElementById('goals-active-count').textContent = \`(\${goals.summary.active})\`;
        if (goals.goals.active.length === 0) {
          goalsActiveDiv.innerHTML = '<div class="empty-state">No active goals</div>';
        } else {
          goalsActiveDiv.innerHTML = goals.goals.active.map(g =>
            \`<div class="item goal-item">\${g}</div>\`
          ).join('');
        }

        // Goals - Waiting
        const goalsWaitingDiv = document.getElementById('goals-waiting');
        document.getElementById('goals-waiting-count').textContent = \`(\${goals.summary.waiting})\`;
        if (goals.goals.waiting.length === 0) {
          goalsWaitingDiv.innerHTML = '<div class="empty-state">No waiting goals</div>';
        } else {
          goalsWaitingDiv.innerHTML = goals.goals.waiting.map(g =>
            \`<div class="item goal-item">\${g}</div>\`
          ).join('');
        }

        // Goals - Completed (last 3)
        const goalsCompletedDiv = document.getElementById('goals-completed');
        document.getElementById('goals-completed-count').textContent = \`(\${goals.summary.completed})\`;
        if (goals.goals.completed.length === 0) {
          goalsCompletedDiv.innerHTML = '<div class="empty-state">No completed goals</div>';
        } else {
          const lastThree = goals.goals.completed.slice(-3).reverse();
          goalsCompletedDiv.innerHTML = lastThree.map(g =>
            \`<div class="item completed-item">\${g}</div>\`
          ).join('');
        }

        // Tasks - In Progress
        const tasksProgressDiv = document.getElementById('tasks-progress');
        document.getElementById('tasks-progress-count').textContent = \`(\${tasks.summary.inProgress})\`;
        if (tasks.tasks.inProgress.length === 0) {
          tasksProgressDiv.innerHTML = '<div class="empty-state">No tasks in progress</div>';
        } else {
          tasksProgressDiv.innerHTML = tasks.tasks.inProgress.map(t =>
            \`<div class="item task-item">\${t}</div>\`
          ).join('');
        }

        // Tasks - Pending
        const tasksPendingDiv = document.getElementById('tasks-pending');
        document.getElementById('tasks-pending-count').textContent = \`(\${tasks.summary.pending})\`;
        if (tasks.tasks.pending.length === 0) {
          tasksPendingDiv.innerHTML = '<div class="empty-state">No pending tasks</div>';
        } else {
          tasksPendingDiv.innerHTML = tasks.tasks.pending.map(t =>
            \`<div class="item task-item">\${t}</div>\`
          ).join('');
        }

        // Tasks - Completed (last 5)
        const tasksCompletedDiv = document.getElementById('tasks-completed');
        document.getElementById('tasks-completed-count').textContent = \`(\${tasks.summary.completed})\`;
        if (tasks.tasks.completed.length === 0) {
          tasksCompletedDiv.innerHTML = '<div class="empty-state">No completed tasks</div>';
        } else {
          const lastFive = tasks.tasks.completed.slice(-5).reverse();
          tasksCompletedDiv.innerHTML = lastFive.map(t =>
            \`<div class="item completed-item">\${t}</div>\`
          ).join('');
        }

        // Update timestamp
        document.getElementById('timestamp').textContent =
          'Last updated: ' + new Date().toLocaleString();

      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      }

      setTimeout(() => indicator.classList.remove('show'), 500);
    }

    // Initial fetch
    fetchAllData();

    // Auto-refresh every 5 seconds
    setInterval(fetchAllData, 5000);
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
