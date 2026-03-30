#!/usr/bin/env node
/**
 * Live Agent Dashboard — HTTP server embedded in agent.js
 *
 * Exposes:
 *   GET /             → HTML dashboard (auto-refreshes every 10s)
 *   GET /api/status   → JSON snapshot (workers, tasks, goals, log, schedule)
 *
 * Auth: simple token via ?token=XXX or Authorization: Bearer XXX
 * Token = DASHBOARD_TOKEN from .env  (defaults to "agent" if not set)
 *
 * Usage (from agent.js):
 *   const dashboard = require('./lib/dashboard');
 *   dashboard.start({ workers, scheduler, parseTasks, memory, ROOT, TASKS_FILE, port: 3000 });
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

let _opts = null;
let _startTime = null;

function start(opts) {
  _opts      = opts;
  _startTime = Date.now();

  const port  = opts.port || 3000;
  const token = process.env.DASHBOARD_TOKEN || 'agent';

  const server = http.createServer((req, res) => {
    // Auth check
    const url      = new URL(req.url, `http://localhost:${port}`);
    const qToken   = url.searchParams.get('token');
    const authHdr  = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    const authed   = qToken === token || authHdr === token;

    if (!authed) {
      if (url.pathname === '/api/status') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized. Add ?token=YOUR_TOKEN' }));
        return;
      }
      // For browser: redirect to add token
      res.writeHead(302, { 'Location': `/?token=${token}` });
      res.end();
      return;
    }

    if (url.pathname === '/api/status') {
      res.writeHead(200, {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(buildStatus(), null, 2));
      return;
    }

    if (url.pathname === '/api/sprint') {
      // Public — no auth required (org chart page uses this)
      res.writeHead(200, {
        'Content-Type':  'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      try {
        const { readSprint } = require('./orchestrator');
        res.end(JSON.stringify(readSprint(), null, 2));
      } catch (_) {
        res.end(JSON.stringify({ error: 'sprint state unavailable' }));
      }
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = buildHtml(token, port);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, '0.0.0.0', () => {
    const token = process.env.DASHBOARD_TOKEN || 'agent';
    console.log(`[Dashboard] Live at http://localhost:${port}/?token=${token}`);
  });

  server.on('error', err => {
    console.error(`[Dashboard] Server error: ${err.message}`);
  });

  return server;
}

function buildStatus() {
  const { workers, scheduler, parseTasks, memory, ROOT, TASKS_FILE } = _opts;

  // Workers
  const active = workers.listActive ? workers.listActive() : [];

  // Tasks
  let tasks = { inProgress: [], pending: [], completed: [] };
  try { tasks = parseTasks(TASKS_FILE); } catch {}

  // Goals
  let goals = '';
  try { goals = memory.readGoals(); } catch {}

  // Daily log — last 40 lines
  let log = [];
  try {
    const today    = new Date().toISOString().slice(0, 10);
    const logFile  = path.join(ROOT, 'memory', 'daily', `${today}.md`);
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf8').split('\n');
      log = lines.filter(l => l.startsWith('- ')).slice(-40).reverse();
    }
  } catch {}

  // Schedule
  let schedule = [];
  try { schedule = scheduler.list(); } catch {}

  // Intel feed — last 5 entries
  let intel = [];
  try {
    const intelFile = path.join(ROOT, 'memory', 'areas', 'social-intel.md');
    if (fs.existsSync(intelFile)) {
      const raw = fs.readFileSync(intelFile, 'utf8');
      // Only pick up real entry lines — must contain a markdown link [text](url)
      // Skips template/instruction lines like "- (no entries yet...)"
      const lines = raw.split('\n').filter(l => l.startsWith('- ') && l.includes(']('));
      intel = lines.slice(0, 10);
    }
  } catch {}

  const uptimeSec = Math.round((Date.now() - _startTime) / 1000);

  return {
    uptime:     formatUptime(uptimeSec),
    uptimeSec,
    timestamp:  new Date().toLocaleString(),
    workers: {
      active:  active.map(w => ({
        id:        w.id,
        task:      w.task,
        runningMs: w.runningMs,
        pid:       w.pid,
      })),
      count: active.length,
    },
    tasks: {
      inProgress: tasks.inProgress.map(t => ({ id: t.id, desc: t.desc })),
      pending:    tasks.pending.map(t => ({ id: t.id, desc: t.desc })),
      completed:  tasks.completed.slice(0, 10).map(t => ({ id: t.id, desc: t.desc })),
    },
    goals:    goals.slice(0, 2000),
    schedule: schedule,
    log:      log.slice(0, 30),
    intel:    intel,
  };
}

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function buildHtml(token, port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Dashboard</title>
<style>
  :root {
    --bg: #0d0d0f;
    --surface: #16161a;
    --border: #2a2a32;
    --accent: #7c3aed;
    --accent2: #06b6d4;
    --green: #10b981;
    --yellow: #f59e0b;
    --red: #ef4444;
    --text: #e2e8f0;
    --muted: #64748b;
    --font: 'Inter', -apple-system, sans-serif;
    --mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    min-height: 100vh;
    line-height: 1.5;
  }

  /* ── Top bar ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .agent-name { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.85); }
  }
  .topbar-right { display: flex; align-items: center; gap: 16px; color: var(--muted); font-size: 12px; }
  .uptime-badge {
    background: rgba(16,185,129,0.1);
    color: var(--green);
    border: 1px solid rgba(16,185,129,0.2);
    border-radius: 20px;
    padding: 2px 10px;
    font-family: var(--mono);
    font-size: 11px;
  }
  #refresh-indicator { font-size: 11px; color: var(--muted); }
  .refresh-dot {
    display: inline-block; width: 6px; height: 6px;
    border-radius: 50%; background: var(--accent2);
    margin-right: 5px;
    transition: opacity 0.3s;
  }

  /* ── Layout ── */
  .grid {
    display: grid;
    grid-template-columns: 340px 1fr 300px;
    grid-template-rows: auto auto;
    gap: 16px;
    padding: 20px 24px;
    max-width: 1600px;
    margin: 0 auto;
  }
  @media (max-width: 1100px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .col-right { grid-column: span 2; }
  }
  @media (max-width: 700px) {
    .grid { grid-template-columns: 1fr; }
    .col-right { grid-column: span 1; }
  }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .card-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .card-header span.title { color: var(--text); }
  .card-body { padding: 14px 16px; }
  .badge {
    display: inline-flex; align-items: center;
    border-radius: 12px; padding: 1px 8px;
    font-size: 10px; font-weight: 600;
  }
  .badge-green { background: rgba(16,185,129,0.15); color: var(--green); }
  .badge-yellow { background: rgba(245,158,11,0.15); color: var(--yellow); }
  .badge-purple { background: rgba(124,58,237,0.15); color: #a78bfa; }
  .badge-blue { background: rgba(6,182,212,0.15); color: var(--accent2); }
  .badge-muted { background: rgba(100,116,139,0.15); color: var(--muted); }

  /* ── Stat counters ── */
  .stats-row {
    display: flex;
    gap: 1px;
    background: var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .stat-box {
    flex: 1;
    background: var(--surface);
    padding: 10px 12px;
    text-align: center;
  }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
    line-height: 1;
    margin-bottom: 3px;
  }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }

  /* ── Workers ── */
  .worker-card {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(124,58,237,0.05);
    border: 1px solid rgba(124,58,237,0.2);
    border-radius: 7px;
    margin-bottom: 8px;
  }
  .worker-icon {
    width: 28px; height: 28px; flex-shrink: 0;
    background: rgba(124,58,237,0.2);
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
  }
  .worker-id { font-family: var(--mono); font-size: 11px; color: #a78bfa; font-weight: 600; }
  .worker-task { font-size: 12px; color: var(--text); margin-top: 2px; }
  .worker-runtime { font-size: 10px; color: var(--muted); margin-top: 3px; }
  .no-workers { color: var(--muted); font-size: 12px; text-align: center; padding: 20px 0; }

  /* ── Task list ── */
  .task-item {
    display: flex;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
    align-items: flex-start;
  }
  .task-item:last-child { border-bottom: none; }
  .task-id {
    font-family: var(--mono); font-size: 10px;
    color: var(--muted); flex-shrink: 0;
    padding-top: 2px; min-width: 70px;
  }
  .task-desc { font-size: 12px; color: var(--text); flex: 1; }
  .task-progress { color: var(--yellow); }
  .task-done { color: var(--green); text-decoration: line-through; opacity: 0.6; }
  .empty-state { color: var(--muted); font-size: 12px; padding: 8px 0; }

  /* ── Log ── */
  .log-list { list-style: none; }
  .log-item {
    padding: 4px 0;
    border-bottom: 1px solid rgba(42,42,50,0.5);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .log-item:first-child { color: var(--text); }
  .log-item .time { color: var(--accent2); }

  /* ── Schedule ── */
  .sched-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .sched-item:last-child { border-bottom: none; }
  .sched-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0; }

  /* ── Goals ── */
  .goals-text {
    font-size: 12px;
    color: var(--muted);
    white-space: pre-wrap;
    max-height: 300px;
    overflow-y: auto;
    line-height: 1.6;
  }
  .goals-text strong { color: var(--text); }

  /* ── Intel ── */
  .intel-item {
    padding: 5px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .intel-item:last-child { border-bottom: none; }
  .intel-item a { color: var(--accent2); text-decoration: none; }
  .intel-item a:hover { text-decoration: underline; }

  /* ── Scrollbars ── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <div class="status-dot" id="status-dot"></div>
    <div class="agent-name">🤖 Agent</div>
  </div>
  <div class="topbar-right">
    <div id="refresh-indicator"><span class="refresh-dot" id="rdot"></span>live</div>
    <div class="uptime-badge" id="uptime">—</div>
    <div id="ts" style="font-size:11px;color:var(--muted)">—</div>
  </div>
</div>

<div class="grid">

  <!-- LEFT — Workers + Tasks -->
  <div style="display:flex;flex-direction:column;gap:16px;">

    <!-- Workers -->
    <div class="card">
      <div class="card-header">
        <span class="title">Workers</span>
        <span class="badge badge-purple" id="worker-count">0</span>
      </div>
      <div class="card-body" id="workers-body">
        <div class="no-workers">Idle — no active workers</div>
      </div>
    </div>

    <!-- Tasks -->
    <div class="card">
      <div class="card-header">
        <span class="title">Tasks</span>
        <div style="display:flex;gap:6px;">
          <span class="badge badge-yellow" id="badge-inprogress">0 active</span>
          <span class="badge badge-muted" id="badge-pending">0 queued</span>
        </div>
      </div>
      <div class="card-body">
        <div id="tasks-inprogress"></div>
        <div id="tasks-pending"></div>
      </div>
    </div>

  </div>

  <!-- CENTRE — Log + Stats -->
  <div style="display:flex;flex-direction:column;gap:16px;">

    <!-- Stats row -->
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value" id="stat-workers">0</div>
        <div class="stat-label">Workers</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="stat-queued">0</div>
        <div class="stat-label">Queued</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="stat-done">0</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="stat-jobs">0</div>
        <div class="stat-label">Schedules</div>
      </div>
    </div>

    <!-- Live log -->
    <div class="card" style="flex:1;">
      <div class="card-header">
        <span class="title">Live Log</span>
        <span style="font-size:10px;color:var(--muted)">today · newest first</span>
      </div>
      <div class="card-body" style="max-height:420px;overflow-y:auto;">
        <ul class="log-list" id="log-list">
          <li class="log-item"><span style="color:var(--muted)">Waiting for data…</span></li>
        </ul>
      </div>
    </div>

    <!-- Schedule -->
    <div class="card">
      <div class="card-header">
        <span class="title">Scheduled Jobs</span>
      </div>
      <div class="card-body" id="schedule-body">
        <div class="empty-state">Loading…</div>
      </div>
    </div>

  </div>

  <!-- RIGHT — Goals + Intel -->
  <div class="col-right" style="display:flex;flex-direction:column;gap:16px;">

    <!-- Goals -->
    <div class="card">
      <div class="card-header">
        <span class="title">Goals</span>
      </div>
      <div class="card-body">
        <div class="goals-text" id="goals-text">Loading…</div>
      </div>
    </div>

    <!-- Intel feed -->
    <div class="card">
      <div class="card-header">
        <span class="title">Intel Feed</span>
        <span style="font-size:10px;color:var(--muted)">last scrape</span>
      </div>
      <div class="card-body" id="intel-body">
        <div class="empty-state">No intel yet — run /monitor</div>
      </div>
    </div>

  </div>

</div>

<script>
const TOKEN = '${token}';
const API   = '/api/status?token=' + TOKEN;
let refreshTimer;

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function fmtMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? m + 'm ' + s + 's' : s + 's';
}

async function refresh() {
  const dot = document.getElementById('rdot');
  dot.style.opacity = '0.3';
  try {
    const res  = await fetch(API);
    const data = await res.json();
    render(data);
    dot.style.opacity = '1';
  } catch(e) {
    document.getElementById('status-dot').style.background = '#ef4444';
    dot.style.opacity = '0.3';
  }
}

function render(d) {
  // Topbar
  document.getElementById('uptime').textContent = d.uptime;
  document.getElementById('ts').textContent = d.timestamp;

  // Stats
  document.getElementById('stat-workers').textContent = d.workers.count;
  document.getElementById('stat-queued').textContent  = d.tasks.pending.length;
  document.getElementById('stat-done').textContent    = d.tasks.completed.length;
  document.getElementById('stat-jobs').textContent    = d.schedule.length;
  document.getElementById('worker-count').textContent = d.workers.count;
  document.getElementById('badge-inprogress').textContent = d.tasks.inProgress.length + ' active';
  document.getElementById('badge-pending').textContent    = d.tasks.pending.length + ' queued';

  // Workers
  const wb = document.getElementById('workers-body');
  if (d.workers.active.length === 0) {
    wb.innerHTML = '<div class="no-workers">⚡ Idle — no active workers</div>';
  } else {
    wb.innerHTML = d.workers.active.map(w => \`
      <div class="worker-card">
        <div class="worker-icon">⚙️</div>
        <div style="flex:1;min-width:0;">
          <div class="worker-id">\${esc(w.id)}</div>
          <div class="worker-task">\${esc(w.task.slice(0,90))}</div>
          <div class="worker-runtime">Running \${fmtMs(w.runningMs)} · PID \${w.pid}</div>
        </div>
      </div>
    \`).join('');
  }

  // Tasks in progress
  const tip = document.getElementById('tasks-inprogress');
  if (d.tasks.inProgress.length === 0) {
    tip.innerHTML = '<div class="empty-state">No tasks in progress</div>';
  } else {
    tip.innerHTML = d.tasks.inProgress.map(t => \`
      <div class="task-item">
        <div class="task-id">\${esc(t.id)}</div>
        <div class="task-desc task-progress">▶ \${esc(t.desc.slice(0,70))}</div>
      </div>
    \`).join('');
  }

  // Tasks pending
  const tp = document.getElementById('tasks-pending');
  if (d.tasks.pending.length === 0) {
    tp.innerHTML = '<div class="empty-state" style="margin-top:6px;">Queue empty</div>';
  } else {
    tp.innerHTML = d.tasks.pending.slice(0,8).map(t => \`
      <div class="task-item">
        <div class="task-id">\${esc(t.id)}</div>
        <div class="task-desc">\${esc(t.desc.slice(0,70))}</div>
      </div>
    \`).join('');
    if (d.tasks.pending.length > 8) {
      tp.innerHTML += \`<div class="empty-state">+ \${d.tasks.pending.length - 8} more…</div>\`;
    }
  }

  // Log
  const ll = document.getElementById('log-list');
  if (d.log.length === 0) {
    ll.innerHTML = '<li class="log-item"><span style="color:var(--muted)">No log entries today</span></li>';
  } else {
    ll.innerHTML = d.log.map((line, i) => {
      const clean = esc(line.replace(/^- /, ''));
      const timeM = clean.match(/^(\\d+:\\d+:\\d+\\s*[ap]m)/i);
      if (timeM) {
        const rest = clean.slice(timeM[0].length).replace(/^\\s*—\\s*/, '');
        return \`<li class="log-item"><span class="time">\${timeM[0]}</span> \${rest}</li>\`;
      }
      return \`<li class="log-item">\${clean}</li>\`;
    }).join('');
  }

  // Schedule
  const sb = document.getElementById('schedule-body');
  if (d.schedule.length === 0) {
    sb.innerHTML = '<div class="empty-state">No scheduled jobs</div>';
  } else {
    sb.innerHTML = d.schedule.map(j => \`
      <div class="sched-item">
        <div class="sched-dot"></div>
        <div>\${esc(j)}</div>
      </div>
    \`).join('');
  }

  // Goals — simple text render
  const gt = document.getElementById('goals-text');
  const goalsClean = d.goals
    .split('\\n')
    .map(l => {
      if (l.startsWith('### ')) return '<strong>' + esc(l.replace(/^### /, '')) + '</strong>';
      if (l.startsWith('## '))  return '<strong style="color:var(--accent2)">' + esc(l.replace(/^## /, '')) + '</strong>';
      if (l.startsWith('# '))   return '';
      return esc(l);
    })
    .join('\\n');
  gt.innerHTML = goalsClean || '<span style="color:var(--muted)">No goals set</span>';

  // Intel
  const ib = document.getElementById('intel-body');
  if (d.intel.length === 0) {
    ib.innerHTML = '<div class="empty-state">No intel yet — send /monitor in Telegram</div>';
  } else {
    ib.innerHTML = d.intel.map(line => {
      const linkM = line.match(/\\[([^\\]]+)\\]\\(([^)]+)\\)/);
      if (linkM) {
        return \`<div class="intel-item"><a href="\${esc(linkM[2])}" target="_blank" rel="noopener">\${esc(linkM[1].slice(0,60))}</a></div>\`;
      }
      return \`<div class="intel-item">\${esc(line.replace(/^- /, '').slice(0,80))}</div>\`;
    }).join('');
  }
}

// Init
refresh();
refreshTimer = setInterval(refresh, 10000);
</script>
</body>
</html>`;
}

module.exports = { start };
