#!/usr/bin/env node
/**
 * Telegram → Claude Code Bridge
 * @maxim_devhub_bot ↔ Claude Code CLI
 * Send any message in Dev Projects Hub → Claude responds
 *
 * Usage: node scripts/telegram-bridge.js
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

// Force unbuffered logging to file
const LOG_FILE = path.join(require('os').tmpdir(), 'bridge.log');
function log(...args) {
  const line = `${args.join(' ')}\n`;
  fs.appendFileSync(LOG_FILE, line);
}
console.log = log;
console.error = log;

// ── Config ────────────────────────────────────────────────────────────────────
// Load .env manually if needed
const PROJECT_DIR     = path.resolve(__dirname, '..');
const envPath = path.join(PROJECT_DIR, '.env');
if (fs.existsSync(envPath) && !process.env.TELEGRAM_BOT_TOKEN) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID        = parseInt(process.env.TELEGRAM_GROUP_ID);
const { config: _cfg } = require('./lib/config');
const CLAUDE_CMD      = _cfg.claude.cmd;
const API             = `https://api.telegram.org/bot${BOT_TOKEN}`;
const CLAUDE_TIMEOUT_MS = 300000; // 5 min
const TASKS_FILE      = path.join(PROJECT_DIR, 'memory', 'TASKS.md');
const GOALS_FILE      = path.join(PROJECT_DIR, 'memory', 'goals.md');

if (!BOT_TOKEN || !GROUP_ID) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_ID in .env');
  process.exit(1);
}

// ── Conversation memory (per thread, last 8 exchanges) ────────────────────────
const convHistory = new Map();

function threadKey(chatId, threadId) {
  return `${chatId}:${threadId ?? 'main'}`;
}

function addHistory(chatId, threadId, role, text) {
  const key = threadKey(chatId, threadId);
  if (!convHistory.has(key)) convHistory.set(key, []);
  const h = convHistory.get(key);
  h.push({ role, text: text.slice(0, 600) });
  if (h.length > 8) h.shift();
}

function buildPrompt(chatId, threadId, userText) {
  const key = threadKey(chatId, threadId);
  const h   = convHistory.get(key) || [];

  // If user pasted a huge block (prev response + new question),
  // extract just the first line/sentence as the real new query.
  let actualQuery = userText;
  if (userText.length > 600) {
    const firstLine = userText.split('\n')[0].trim();
    // Only use first line if it's a real question (not empty / too short)
    if (firstLine.length > 10) {
      actualQuery = firstLine;
      log(`[SMART-PARSE] Long msg truncated. Using: "${firstLine.slice(0, 80)}"`);
    }
  }

  if (h.length === 0) return actualQuery;

  const ctx = h
    .map(m => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.text}`)
    .join('\n');

  return `[Conversation so far]\n${ctx}\n\n[New message from user]\n${actualQuery}`;
}

// ── Telegram API ──────────────────────────────────────────────────────────────
async function tg(method, params = {}) {
  try {
    const res  = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) { console.error(`[TG ${method}] ${data.description}`); return null; }
    return data.result;
  } catch (err) {
    console.error(`[TG ${method}] network error: ${err.message}`);
    return null;
  }
}

async function sendMsg(chatId, text, threadId) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    const result = await tg('sendMessage', {
      chat_id: chatId,
      text: chunk,
      message_thread_id: threadId || undefined,
      parse_mode: 'Markdown',
    });
    if (!result) {
      await tg('sendMessage', { chat_id: chatId, text: chunk, message_thread_id: threadId || undefined });
    }
  }
}

// ── Claude execution ──────────────────────────────────────────────────────────
function runClaude(prompt) {
  return new Promise((resolve) => {
    let out = '', err = '', timedOut = false;

    const child = spawn(CLAUDE_CMD, [
      '--print',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
    ], {
      cwd: PROJECT_DIR,
      env: { ...process.env },
      windowsHide: true,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      resolve('⏱ Claude timed out (5 min). Try a shorter request.');
    }, CLAUDE_TIMEOUT_MS);

    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      if (out.trim()) resolve(out.trim());
      else if (err.trim()) resolve(`⚠️ Error:\n\`\`\`\n${err.slice(0, 800)}\n\`\`\``);
      else resolve(`(Claude exited with code ${code}, no output)`);
    });

    child.on('error', e => { clearTimeout(timer); resolve(`⚠️ Could not start Claude: ${e.message}`); });
  });
}

// ── Message handler ───────────────────────────────────────────────────────────
const processing = new Set();

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const thread = msg.message_thread_id;
  const text   = (msg.text || '').trim();
  const from   = msg.from?.first_name || 'Someone';
  const msgId  = msg.message_id;

  if (!text || !chatId) return;
  if (msg.from?.is_bot) return;           // ignore bot messages
  if (processing.has(msgId)) return;
  processing.add(msgId);

  const isGroup = chatId === GROUP_ID;
  const isDM    = msg.chat?.type === 'private';
  if (!isGroup && !isDM) return;

  console.log(`[${new Date().toLocaleTimeString()}] ${from} (thread:${thread ?? 'General'}): ${text.slice(0, 100)}`);

  // /help
  if (text === '/start' || text === '/help') {
    await sendMsg(chatId, [
      '🤖 *Dev Ecosystem Hub — Autonomous Agent*',
      '',
      'I run 24/7. You can chat with me OR queue tasks for me to do autonomously.',
      '',
      '*Chat commands:*',
      '`/status`     — Bridge + Claude version',
      '`/tasks`      — Show task queue',
      '`/goals`      — Show current goals',
      '`/workers`    — Show worker status and activity',
      '`/clear`      — Clear conversation memory for this topic',
      '`/help`       — This message',
      '',
      '*Add tasks (I work on these automatically every 30 min):*',
      '`task: build X` — Add a task to the queue',
      '`add task: do Y` — Same thing',
      '',
      'Anything else → I respond immediately like a chat.',
    ].join('\n'), thread);
    processing.delete(msgId);
    return;
  }

  // /status
  if (text === '/status') {
    try {
      const v = execSync(`"${CLAUDE_CMD}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
      await sendMsg(chatId, `✅ *Bridge online*\n• Claude: \`${v}\`\n• Project: \`${path.basename(PROJECT_DIR)}\`\n• Bot: @maxim_devhub_bot`, thread);
    } catch (e) {
      await sendMsg(chatId, `❌ Claude not found: ${e.message}`, thread);
    }
    processing.delete(msgId);
    return;
  }

  // /clear — reset memory for this thread
  if (text === '/clear') {
    convHistory.delete(threadKey(chatId, thread));
    await sendMsg(chatId, '🧹 Conversation memory cleared for this topic.', thread);
    processing.delete(msgId);
    return;
  }

  // /tasks — show task queue
  if (text === '/tasks') {
    try {
      const content = fs.existsSync(TASKS_FILE) ? fs.readFileSync(TASKS_FILE, 'utf8') : 'No task queue found.';
      const inProg  = (content.match(/## 🔄 In Progress\n([\s\S]*?)(?=\n## |$)/)?.[1] || '').trim();
      const pending = (content.match(/## 📋 Pending\n([\s\S]*?)(?=\n## |$)/)?.[1] || '').trim();
      const done    = (content.match(/## ✅ Completed\n([\s\S]*?)(?=\n## |$)/)?.[1] || '').trim();
      const pendingCount = (pending.match(/- \[ \]/g) || []).length;
      const doneCount    = (done.match(/- \[x\]/g) || []).length;
      const lines = ['📋 *Task Queue*', ''];
      if (inProg) lines.push('*🔄 In Progress:*\n' + inProg, '');
      lines.push(`*📋 Pending (${pendingCount}):*`);
      if (pendingCount === 0) lines.push('_Empty — add tasks with "task: build X"_');
      else lines.push(pending);
      lines.push('', `*✅ Completed: ${doneCount}*`);
      await sendMsg(chatId, lines.join('\n'), thread);
    } catch (e) {
      await sendMsg(chatId, `❌ Error reading tasks: ${e.message}`, thread);
    }
    processing.delete(msgId);
    return;
  }

  // /goals — show current goals
  if (text === '/goals') {
    try {
      const content = fs.existsSync(GOALS_FILE) ? fs.readFileSync(GOALS_FILE, 'utf8') : 'No goals file found.';
      const activeSection = content.match(/## Active Goals\n([\s\S]*?)(?=\n## |$)/)?.[1] || '';

      const lines = ['🎯 *Current Goals*', ''];

      if (!activeSection.trim()) {
        lines.push('_No active goals defined._');
      } else {
        // Parse goals from the active section
        const goalBlocks = activeSection.split(/\n### /).filter(b => b.trim());

        for (const block of goalBlocks) {
          const titleMatch = block.match(/^(.+)/);
          const priorityMatch = block.match(/\*\*Priority:\*\* (.+)/);
          const statusMatch = block.match(/\*\*Status:\*\* (.+)/);
          const descMatch = block.match(/\*\*Description:\*\* (.+)/);

          if (titleMatch) {
            lines.push(`*${titleMatch[1].trim()}*`);
            if (priorityMatch) lines.push(`Priority: \`${priorityMatch[1].trim()}\``);
            if (statusMatch) lines.push(`Status: ${statusMatch[1].trim()}`);
            if (descMatch) lines.push(`${descMatch[1].trim()}`);
            lines.push('');
          }
        }
      }

      await sendMsg(chatId, lines.join('\n'), thread);
    } catch (e) {
      await sendMsg(chatId, `❌ Error reading goals: ${e.message}`, thread);
    }
    processing.delete(msgId);
    return;
  }

  // /workers — show worker status and recent activity
  if (text === '/workers') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyFile = path.join(PROJECT_DIR, 'memory', 'daily', `${today}.md`);
      const content = fs.existsSync(dailyFile) ? fs.readFileSync(dailyFile, 'utf8') : '';

      const lines = ['⚙️ *Worker Status*', ''];

      // Find most recent worker count
      const workerCountMatches = [...content.matchAll(/Work loop tick — (\d+) workers running/g)];
      const currentCount = workerCountMatches.length > 0
        ? workerCountMatches[workerCountMatches.length - 1][1]
        : '0';

      lines.push(`*Currently Running:* ${currentCount} workers`);
      lines.push('');

      // Find recent worker activity (last 10 entries)
      const workerLogs = [];
      const spawnMatches = [...content.matchAll(/- (.+) — (?:Spawning|Worker spawned|Worker done): (.+)/g)];

      if (spawnMatches.length > 0) {
        lines.push('*Recent Activity:*');
        const recentLogs = spawnMatches.slice(-10);
        for (const match of recentLogs) {
          const time = match[1];
          const activity = match[2].slice(0, 100);
          lines.push(`\`${time}\` — ${activity}${match[2].length > 100 ? '...' : ''}`);
        }
      } else {
        lines.push('_No worker activity today._');
      }

      await sendMsg(chatId, lines.join('\n'), thread);
    } catch (e) {
      await sendMsg(chatId, `❌ Error reading worker status: ${e.message}`, thread);
    }
    processing.delete(msgId);
    return;
  }

  // task: / add task: — add to autonomous queue
  const taskMatch = text.match(/^(?:task|add task|queue task):\s*(.+)/i);
  if (taskMatch) {
    const desc = taskMatch[1].trim();
    try {
      // Read and update TASKS.md
      let content = fs.existsSync(TASKS_FILE) ? fs.readFileSync(TASKS_FILE, 'utf8') : '# Task Queue\n\n## 🔄 In Progress\n\n## 📋 Pending\n\n## ✅ Completed\n';
      const existing = content.match(/TASK-(\d+)/g) || [];
      const maxId = existing.reduce((max, id) => { const n = parseInt(id.replace('TASK-', '')); return n > max ? n : max; }, 0);
      const newId = `TASK-${String(maxId + 1).padStart(3, '0')}`;
      content = content.replace('## 📋 Pending\n', `## 📋 Pending\n- [ ] ${newId} | ${desc}\n`);
      fs.writeFileSync(TASKS_FILE, content);
      await sendMsg(chatId, `✅ *Task added to queue:* \`${newId}\`\n${desc}\n\nThe heartbeat will pick it up within 30 minutes and notify you when done.`, thread);
    } catch (e) {
      await sendMsg(chatId, `❌ Error adding task: ${e.message}`, thread);
    }
    processing.delete(msgId);
    return;
  }

  // Save user message to history
  addHistory(chatId, thread, 'user', text);

  const prompt    = buildPrompt(chatId, thread, text);
  const thinkMsg  = await tg('sendMessage', {
    chat_id: chatId,
    text: '⏳ Thinking...',
    message_thread_id: thread || undefined,
  });

  const reply = await runClaude(prompt);

  if (thinkMsg?.message_id) {
    await tg('deleteMessage', { chat_id: chatId, message_id: thinkMsg.message_id });
  }

  // Save Claude response to history
  addHistory(chatId, thread, 'assistant', reply);

  await sendMsg(chatId, reply, thread);
  processing.delete(msgId);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Dev Ecosystem Hub — Telegram Bridge v2');
  console.log(`📁 Project : ${PROJECT_DIR}`);

  const me = await tg('getMe');
  if (!me) { console.error('❌ Cannot connect to Telegram. Check token.'); process.exit(1); }
  console.log(`✅ Bot     : @${me.username}`);
  console.log(`📬 Group   : ${GROUP_ID}`);
  console.log('🧠 Memory  : conversation history enabled (8 exchanges per topic)');

  let offset = 0;
  const seed = await tg('getUpdates', { offset: -1, limit: 1 });
  if (seed?.length) offset = seed[seed.length - 1].update_id + 1;

  await sendMsg(GROUP_ID, '✅ *Bridge v2 online* — I now remember our conversation in each topic. No need to re-paste context!\n\nUse `/clear` to reset memory for a topic.', null);
  console.log('\n🔄 Polling for messages...\n');

  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
      if (!updates) { await sleep(5000); continue; }
      for (const upd of updates) {
        offset = upd.update_id + 1;
        if (upd.message) handleMessage(upd.message).catch(e => console.error('Handler error:', e));
      }
    } catch (err) {
      console.error('Poll error:', err.message);
      await sleep(5000);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
