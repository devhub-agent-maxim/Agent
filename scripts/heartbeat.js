#!/usr/bin/env node
/**
 * 🤖 Autonomous Heartbeat — Task Dispatcher
 *
 * Runs every 30 minutes via Windows Task Scheduler.
 * Reads the task queue, picks the next pending task,
 * routes it to the appropriate specialized agent, and notifies via Telegram.
 *
 * Task routing (via [tag] prefix in task description):
 *   [dev]      → scripts/agents/developer-agent.js  (build→test→fix loop)
 *   [deploy]   → scripts/agents/deploy-agent.js      (GitHub push + Vercel)
 *   [qa]       → scripts/agents/qa-agent.js          (run tests only)
 *   [monitor]  → scripts/agents/social-monitor-agent.js
 *   [jira]     → scripts/agents/jira-sync-agent.js
 *   (no tag)   → developer-agent.js (default)
 *
 * Usage: node scripts/heartbeat.js
 */

const { spawn, execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');

const PROJECT_DIR   = path.resolve(__dirname, '..');
const TASKS_FILE    = path.join(PROJECT_DIR, 'memory', 'TASKS.md');
const { config }    = require('./lib/config');
const CLAUDE_CMD    = config.claude.cmd;
const NOTIFY_SCRIPT = path.join(__dirname, 'notify.js');
const DAILY_DIR     = path.join(PROJECT_DIR, 'memory', 'daily');
const AGENTS_DIR    = path.join(__dirname, 'agents');
const CLAUDE_TIMEOUT_MS = 600000; // 10 min

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(require('os').tmpdir(), 'heartbeat.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}

// ── Telegram notification ─────────────────────────────────────────────────────
function notify(message) {
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "${message.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_DIR, timeout: 10000,
    });
    log(`📤 Notified: ${message.slice(0, 80)}`);
  } catch (e) {
    log(`⚠️ Notify failed: ${e.message}`);
  }
}

// ── Task queue ────────────────────────────────────────────────────────────────
function parseTasks() {
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, '# Task Queue\n\n## 🔄 In Progress\n\n## 📋 Pending\n\n## ✅ Completed\n');
    return { inProgress: [], pending: [] };
  }
  const content = fs.readFileSync(TASKS_FILE, 'utf8');
  const parseItems = (match) => {
    if (!match) return [];
    return (match[1] || '').split('\n')
      .filter(l => l.match(/^\s*-\s*\[\s*\]/))
      .map(l => {
        const m = l.match(/TASK-(\d+)\s*\|\s*(.+)/) || l.match(/\[.\]\s*(.+)/);
        if (!m) return null;
        const desc = (m[2] || m[1]).trim();
        const tagMatch = desc.match(/^\[(\w+)\]\s*/);
        const tag = tagMatch ? tagMatch[1].toLowerCase() : 'dev';
        const cleanDesc = tagMatch ? desc.slice(tagMatch[0].length) : desc;
        return { id: m[1] ? `TASK-${m[1]}` : 'TASK-?', desc: cleanDesc, tag, raw: l };
      })
      .filter(Boolean);
  };
  return {
    inProgress: parseItems(content.match(/## 🔄 In Progress\n([\s\S]*?)(?=\n## |$)/)),
    pending:    parseItems(content.match(/## 📋 Pending\n([\s\S]*?)(?=\n## |$)/)),
  };
}

function updateTaskStatus(task, newStatus, reason) {
  let content = fs.readFileSync(TASKS_FILE, 'utf8');
  const timestamp = new Date().toLocaleString();
  if (newStatus === 'in_progress') {
    const updatedLine = `- [ ] ${task.id} | ${task.desc} *(started: ${timestamp})*`;
    content = content.replace(task.raw + '\n', '').replace(task.raw, '');
    content = content.replace('## 🔄 In Progress\n', `## 🔄 In Progress\n${updatedLine}\n`);
  } else if (newStatus === 'completed') {
    content = content.replace(new RegExp(`.*${task.id}.*\n?`, 'g'), '');
    const completedLine = `- [x] ${task.id} | ${task.desc} *(done: ${timestamp})*`;
    content = content.replace('## ✅ Completed\n', `## ✅ Completed\n${completedLine}\n`);
  } else if (newStatus === 'blocked') {
    content = content.replace(new RegExp(`(.*${task.id}.*)`), `$1 *(BLOCKED: ${reason} — ${timestamp})*`);
  }
  fs.writeFileSync(TASKS_FILE, content);
}

function writeDailyNote(entry) {
  if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(path.join(DAILY_DIR, `${today}.md`), `\n- ${new Date().toLocaleTimeString()} — ${entry}`);
}

// ── Agent dispatcher ──────────────────────────────────────────────────────────
const AGENT_MAP = {
  dev:     'developer-agent.js',
  deploy:  'deploy-agent.js',
  qa:      'qa-agent.js',
  monitor: 'social-monitor-agent.js',
  jira:    'jira-sync-agent.js',
};

function runAgent(task) {
  return new Promise((resolve) => {
    const agentFile = AGENT_MAP[task.tag] || AGENT_MAP.dev;
    const agentPath = path.join(AGENTS_DIR, agentFile);

    // If specialized agent exists, use it via stdin JSON
    if (fs.existsSync(agentPath)) {
      log(`🎯 Routing ${task.id} → ${agentFile}`);
      const input = JSON.stringify({ taskId: task.id, desc: task.desc, tag: task.tag });
      let out = '', err = '', timedOut = false;

      const child = spawn('node', [agentPath], {
        cwd: PROJECT_DIR,
        env: { ...process.env },
        windowsHide: true,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdin.write(input);
      child.stdin.end();
      child.stdout.on('data', d => { out += d.toString(); });
      child.stderr.on('data', d => { err += d.toString(); });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        resolve({ success: false, output: `Agent ${agentFile} timed out after 10 min.`, structured: null });
      }, CLAUDE_TIMEOUT_MS);

      child.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return;
        // Try to parse structured result from last JSON line
        const lines = out.trim().split('\n').filter(Boolean);
        let structured = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try { structured = JSON.parse(lines[i]); break; } catch (_) {}
        }
        resolve({
          success: code === 0 || out.trim().length > 0,
          output: out.trim() || err.trim() || `(exited ${code})`,
          structured,
        });
      });

      child.on('error', e => { clearTimeout(timer); resolve({ success: false, output: e.message, structured: null }); });

    } else {
      // Fallback: run Claude directly (original heartbeat behaviour)
      log(`⚠️ Agent ${agentFile} not found — falling back to direct Claude`);
      runClaude(task.desc).then(r => resolve({ ...r, structured: null }));
    }
  });
}

// ── Fallback: direct Claude invocation ────────────────────────────────────────
function runClaude(taskDesc) {
  return new Promise((resolve) => {
    const prompt = `You are running as an autonomous agent in the Dev Projects Hub workspace.
Your task: ${taskDesc}
- Project directory: ${PROJECT_DIR}
- Read CLAUDE.md for rules and project context
- Work autonomously — make actual file changes
- After completing, summarize what you did in 2-3 sentences
Execute the task now.`;

    let out = '', err = '', timedOut = false;
    const child = spawn(CLAUDE_CMD, ['--print', '--dangerously-skip-permissions', '--no-session-persistence'], {
      cwd: PROJECT_DIR, env: { ...process.env }, windowsHide: true, shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); resolve({ success: false, output: 'Timed out.' }); }, CLAUDE_TIMEOUT_MS);
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({ success: code === 0 || out.trim().length > 0, output: out.trim() || err.trim() || `(code ${code})` });
    });
    child.on('error', e => { clearTimeout(timer); resolve({ success: false, output: e.message }); });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('💓 Heartbeat starting...');
  const tasks = parseTasks();
  log(`📋 Queue: ${tasks.inProgress.length} in progress, ${tasks.pending.length} pending`);

  if (tasks.inProgress.length > 0) {
    const t = tasks.inProgress[0];
    log(`⏳ Task already in progress: ${t.id} — skipping`);
    notify(`⏳ *Heartbeat* — ${t.id} still in progress. Checking again in 30 min.`);
    writeDailyNote(`Heartbeat: ${t.id} still in progress`);
    return;
  }

  if (tasks.pending.length === 0) {
    log('✅ Queue empty.');
    notify(`🤖 *Heartbeat* — Queue empty. Add tasks via Telegram: _"task: build X"_`);
    writeDailyNote('Heartbeat: queue empty');
    return;
  }

  const task = tasks.pending[0];
  log(`🚀 Starting: ${task.id} [${task.tag}] — ${task.desc}`);
  notify(`🚀 *Starting* ${task.id} \`[${task.tag}]\`\n${task.desc}`);
  writeDailyNote(`Heartbeat started: ${task.id} [${task.tag}] — ${task.desc}`);

  updateTaskStatus(task, 'in_progress');

  const result = await runAgent(task);
  log(`📝 Result (${result.success ? 'SUCCESS' : 'FAILED'}): ${result.output.slice(0, 200)}`);

  // Check if agent wants to chain to another task (e.g. dev → deploy)
  if (result.structured?.nextAction === 'deploy') {
    const { addTask } = require('./lib/task-queue');
    const newId = addTask(TASKS_FILE, `[deploy] ${result.structured.summary || task.desc}`, 'deploy');
    log(`🔗 Chained deploy task: ${newId}`);
    notify(`🔗 *Chained:* Deploy task ${newId} queued automatically`);
  }

  // Mark completed or blocked
  if (result.structured?.status === 'blocked') {
    updateTaskStatus(task, 'blocked', result.structured.summary || 'see logs');
    writeDailyNote(`Heartbeat BLOCKED: ${task.id} — ${result.structured?.summary || 'unknown'}`);
    notify(`🚫 *Blocked:* ${task.id}\n${result.structured?.summary || result.output.slice(0, 300)}`);
  } else {
    updateTaskStatus(task, 'completed');
    writeDailyNote(`Heartbeat completed: ${task.id} [${result.success ? 'success' : 'failed'}]`);
    const emoji = result.success ? '✅' : '⚠️';
    const summary = result.structured?.summary || result.output.slice(0, 600);
    notify(`${emoji} *Done:* ${task.id}\n${task.desc}\n\n${summary}`);
  }

  const remaining = tasks.pending.length - 1;
  if (remaining > 0) {
    notify(`📋 ${remaining} task${remaining > 1 ? 's' : ''} remaining. Next heartbeat in 30 min.`);
  } else {
    notify(`🎉 Queue empty — all tasks done!`);
  }

  log('💓 Heartbeat done.');
}

main().catch(err => {
  log(`💥 Fatal: ${err.message}`);
  notify(`💥 *Heartbeat error:* ${err.message}`);
  process.exit(1);
});
