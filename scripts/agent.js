#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Autonomous Agent — Main Process                         ║
 * ║                                                          ║
 * ║  Always-on. Self-clocking. CLI-first.                    ║
 * ║  Replaces: heartbeat.js + telegram-bridge.js             ║
 * ║  (those files are kept for backward compatibility)       ║
 * ║                                                          ║
 * ║  Usage:   node scripts/agent.js                          ║
 * ║  Stop:    Ctrl+C                                         ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 * Three async loops run in parallel forever:
 *
 *   Loop 1 — Telegram listener
 *     Polls every 30s. Responds to messages instantly.
 *     Commands: /status /tasks /goals /workers /clear /help
 *     Task queue: "task: build X"
 *     Goals:     "goal: description"
 *
 *   Loop 2 — Work loop (every 10 min)
 *     Reads goals + task queue → decides what to do → spawns workers.
 *     Workers are background Claude CLI processes.
 *     Max 2 concurrent workers.
 *
 *   Loop 3 — Nightly (2:00 AM daily)
 *     Runs consolidation agent, prepares tomorrow's daily note.
 */

'use strict';

// Load .env before anything else
require('./lib/config');

const { config, validate } = require('./lib/config');
const memory     = require('./lib/memory');
const workers    = require('./lib/workers');
const { decide } = require('./lib/decider');
const scheduler  = require('./lib/scheduler');
const { orch, queueTask, getSprintState } = require('./lib/orchestrator');
const discord = require('./lib/discord');
const {
  parseTasks,
  addTask,
  markInProgress,
  markCompleted,
  markBlocked,
} = require('./lib/task-queue');
const { runClaude } = require('./lib/claude-runner');
const socialMonitor = require('./agents/social-monitor-agent');
const dashboard     = require('./lib/dashboard');
const { processVideo, extractVideoUrl } = require('./agents/video-intel-agent');

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT       = path.resolve(__dirname, '..');
const TASKS_FILE = path.join(ROOT, 'memory', 'TASKS.md');
const AGENTS_DIR = path.join(__dirname, 'agents');

const WORK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ── Validate required config ──────────────────────────────────────────────────
try {
  validate(['telegram.botToken', 'telegram.groupId']);
} catch (err) {
  console.error(`\n❌ Config error: ${err.message}`);
  console.error('Copy .env.example → .env and fill in TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID\n');
  process.exit(1);
}

const BOT_TOKEN = config.telegram.botToken;
const GROUP_ID  = config.telegram.groupId;
const API_BASE  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Telegram topic thread IDs (Dev Projects Hub) ──────────────────────────────
const THREAD_SOCIAL_MONITOR = parseInt(process.env.TELEGRAM_SOCIAL_MONITOR_THREAD_ID || '4', 10);
const THREAD_NEW_PROJECT    = process.env.TELEGRAM_NEW_PROJECT_THREAD_ID ? parseInt(process.env.TELEGRAM_NEW_PROJECT_THREAD_ID, 10) : null;
const THREAD_WORKERS        = process.env.TELEGRAM_WORKERS_THREAD_ID     ? parseInt(process.env.TELEGRAM_WORKERS_THREAD_ID, 10)     : null;
const THREAD_ERRORS         = process.env.TELEGRAM_ERRORS_THREAD_ID      ? parseInt(process.env.TELEGRAM_ERRORS_THREAD_ID, 10)      : null;

// ── Logging ───────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(require('os').tmpdir(), 'agent.log');

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

// ── Telegram API ──────────────────────────────────────────────────────────────

async function tg(method, params = {}) {
  try {
    const res  = await fetch(`${API_BASE}/${method}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.ok) {
      log(`[TG] ${method} failed: ${data.description}`);
      return null;
    }
    return data.result;
  } catch (err) {
    log(`[TG] ${method} network error: ${err.message}`);
    return null;
  }
}

/**
 * Send a message, splitting into 4000-char chunks automatically.
 * Falls back to plain text if Markdown parse fails.
 */
async function sendMsg(chatId, text, threadId) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));

  for (const chunk of chunks) {
    const result = await tg('sendMessage', {
      chat_id:           chatId,
      text:              chunk,
      message_thread_id: threadId || undefined,
      parse_mode:        'Markdown',
    });
    // Fallback: send without Markdown if it failed
    if (!result) {
      await tg('sendMessage', {
        chat_id:           chatId,
        text:              chunk,
        message_thread_id: threadId || undefined,
      });
    }
  }
}

/** Notify Maxim on the main group (general topic) */
async function notify(text) {
  await sendMsg(GROUP_ID, text, null);
}

/** Post to Workers topic — worker start, complete, and task updates */
async function notifyWorkers(text) {
  await sendMsg(GROUP_ID, text, THREAD_WORKERS || null);
}

/** Post to Errors topic — blocked workers and failures */
async function notifyErrors(text) {
  await sendMsg(GROUP_ID, text, THREAD_ERRORS || null);
}

/** Post intel digest to Social Monitor topic */
async function notifyIntel(text) {
  await sendMsg(GROUP_ID, text, THREAD_SOCIAL_MONITOR);
}

/**
 * Post an idea card to the New Project topic with inline approval buttons.
 * Falls back to main group if THREAD_NEW_PROJECT not set.
 */
async function sendIdeaCard(item) {
  const threadId = THREAD_NEW_PROJECT || undefined;
  const id = `idea_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  pendingIdeas.set(id, item);

  // Auto-expire ideas after 24h to prevent memory leak
  setTimeout(() => pendingIdeas.delete(id), 24 * 60 * 60 * 1000);

  const scoreBar = '█'.repeat(Math.round((item.relevanceScore || 7) / 2)) + '░'.repeat(5 - Math.round((item.relevanceScore || 7) / 2));
  const text = [
    `💡 *New Idea* — ${item.source}`,
    '',
    `*${item.title.slice(0, 200)}*`,
    item.url ? item.url : '',
    '',
    `Score: [${scoreBar}] ${item.relevanceScore}/10`,
    item.relevanceReason ? `_${item.relevanceReason}_` : '',
    '',
    'What should I do with this?',
  ].filter(l => l !== undefined).join('\n');

  await tg('sendMessage', {
    chat_id:           GROUP_ID,
    text,
    message_thread_id: threadId,
    parse_mode:        'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Add as Task',   callback_data: `task:${id}`   },
          { text: '🎯 Add to Goal',  callback_data: `goal:${id}`   },
        ],
        [
          { text: '🧠 Save to Memory', callback_data: `memory:${id}` },
          { text: '❌ Skip',           callback_data: `skip:${id}`   },
        ],
      ],
    },
  });
}

/** Handle an inline keyboard button press */
async function handleCallbackQuery(query) {
  const cbId   = query.id;
  const data   = query.data || '';
  const chatId = query.message?.chat?.id;
  const msgId  = query.message?.message_id;
  const from   = query.from?.first_name || 'Someone';

  // Always answer immediately — removes the loading spinner on Telegram
  await tg('answerCallbackQuery', { callback_query_id: cbId });

  const colonIdx = data.indexOf(':');
  if (colonIdx === -1) return;
  const action = data.slice(0, colonIdx);
  const ideaId = data.slice(colonIdx + 1);

  const item = pendingIdeas.get(ideaId);
  if (!item) {
    await tg('editMessageText', {
      chat_id:    chatId,
      message_id: msgId,
      text:       '⚠️ This idea has expired. Run /monitor for fresh intel.',
    });
    return;
  }

  pendingIdeas.delete(ideaId);
  log(`[Callback] ${from} chose "${action}" for: ${item.title.slice(0, 60)}`);

  let resultText = '';

  switch (action) {
    case 'task': {
      const taskId = addTask(TASKS_FILE, `[intel] ${item.title.slice(0, 150)}`);
      memory.log(`Idea approved as task: ${taskId} — ${item.title}`);
      resultText = `✅ *Added as task:* \`${taskId}\`\n_${item.title.slice(0, 100)}_`;
      break;
    }
    case 'goal': {
      memory.addGoal(`[intel] ${item.title.slice(0, 200)}`);
      memory.log(`Idea added as goal: ${item.title}`);
      resultText = `🎯 *Added as goal*\n_${item.title.slice(0, 100)}_`;
      break;
    }
    case 'memory': {
      memory.log(`Intel saved: [${item.source}] ${item.title} — ${item.url || ''}`);
      resultText = `🧠 *Saved to memory*\n_${item.title.slice(0, 100)}_`;
      break;
    }
    case 'skip': {
      resultText = `❌ _Skipped_`;
      break;
    }
    default:
      return;
  }

  // Edit the original card to show outcome (removes buttons)
  await tg('editMessageText', {
    chat_id:     chatId,
    message_id:  msgId,
    text:        resultText,
    parse_mode:  'Markdown',
  });
}

// ── Pending ideas (for inline-keyboard approval flow) ────────────────────────
// Key: unique idea ID  Value: { source, title, url, relevanceScore, relevanceReason }
const pendingIdeas = new Map();

// ── Conversation memory (per thread — last 8 exchanges) ──────────────────────
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

function buildChatPrompt(chatId, threadId, userText) {
  const key = threadKey(chatId, threadId);
  const h   = convHistory.get(key) || [];

  // Smart-parse: if user pasted a huge block, use just the first line
  let query = userText;
  if (userText.length > 600) {
    const first = userText.split('\n')[0].trim();
    if (first.length > 10) {
      query = first;
      log(`[SMART-PARSE] Long message truncated to: "${first.slice(0, 80)}"`);
    }
  }

  const systemCtx = memory.buildSystemContext();

  if (h.length === 0) {
    return `${systemCtx}\n\n[Message from Maxim]\n${query}`;
  }

  const historyText = h
    .map(m => `${m.role === 'user' ? 'Maxim' : 'Agent'}: ${m.text}`)
    .join('\n');

  return `${systemCtx}\n\n[Conversation history]\n${historyText}\n\n[New message from Maxim]\n${query}`;
}

// ── Worker event handlers ─────────────────────────────────────────────────────

workers.onComplete((workerId, output, structured) => {
  log(`✅ Worker done: ${workerId}`);

  const summary   = structured?.summary || output.slice(0, 500);
  const isBlocked = structured?.status === 'blocked';
  const nextAction = structured?.nextAction
    ? `\n\n*Next action needed:* ${structured.nextAction}`
    : '';

  // Update TASKS.md if this was a queued task
  if (workerId.match(/^TASK-\d+$/)) {
    const { inProgress } = parseTasks(TASKS_FILE);
    const task = inProgress.find(t => t.id === workerId);
    if (task) {
      if (isBlocked) {
        markBlocked(TASKS_FILE, task, structured?.summary || 'see logs');
      } else {
        markCompleted(TASKS_FILE, task);
      }
    }
  }

  if (isBlocked) {
    notifyErrors(`🚫 *${workerId} blocked*\n${summary}${nextAction}`);
  } else {
    notifyWorkers(`✅ *${workerId} done*\n${summary}${nextAction}`);
  }
});

workers.onError((workerId, errorMsg) => {
  log(`❌ Worker error: ${workerId} — ${errorMsg}`);
  memory.log(`Worker error: ${workerId} — ${errorMsg}`);
  notifyErrors(`❌ *Worker failed:* \`${workerId}\`\n${errorMsg}`);
});

// ── Orchestrator event bridge ─────────────────────────────────────────────────

orch.on('notify', ({ text, threadId }) => {
  sendMsg(GROUP_ID, text, threadId || null).catch(() => {});
});

orch.on('pipelineDone', ({ taskId, summary }) => {
  log(`[Orch] Pipeline done: ${taskId}`);
  notifyWorkers(`✅ *Pipeline done:* \`${taskId}\`\n${summary.slice(0, 300)}`).catch(() => {});
});

orch.on('reviewFail', ({ taskId, issues }) => {
  const detail = issues.map(i => `[${i.severity}] ${i.issue}`).join('\n').slice(0, 300);
  notifyErrors(`🚫 *Review FAIL:* \`${taskId}\`\n${detail}`).catch(() => {});
});

orch.on('stageError', ({ taskId, stage, error }) => {
  notifyErrors(`⚠️ *Stage error:* \`${taskId}\` @ ${stage}\n${error.slice(0, 200)}`).catch(() => {});
});

// ── Telegram message handler ──────────────────────────────────────────────────
const processing = new Set();

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const thread = msg.message_thread_id;
  const text   = (msg.text || '').trim();
  const from   = msg.from?.first_name || 'Someone';
  const msgId  = msg.message_id;

  if (!text || !chatId) return;
  if (msg.from?.is_bot) return;
  if (processing.has(msgId)) return;
  processing.add(msgId);

  const isGroup = chatId === GROUP_ID;
  const isDM    = msg.chat?.type === 'private';
  if (!isGroup && !isDM) return;

  log(`[TG] ${from} (thread:${thread ?? 'General'}): ${text.slice(0, 100)}`);

  try {
    await dispatchCommand(chatId, thread, text, msgId);
  } catch (err) {
    log(`[TG] Handler error: ${err.message}`);
    await sendMsg(chatId, `⚠️ Error: ${err.message}`, thread);
  }

  processing.delete(msgId);
}

async function dispatchCommand(chatId, thread, text, msgId) {

  // ── /help ─────────────────────────────────────────────────────────────────
  if (text === '/start' || text === '/help') {
    await sendMsg(chatId, [
      '🤖 *Autonomous Agent — Online 24/7*',
      '',
      'I run continuously. Talk to me or queue tasks.',
      '',
      '*Status commands:*',
      '`/status`    — Active workers + queue overview',
      '`/sprint`    — Orchestrator pipeline state (queue/active/done/blocked)',
      '`/tasks`     — Full task queue (TASKS.md)',
      '`/goals`     — Current goals',
      '`/workers`   — Running background workers',
      '`/schedule`  — Scheduled jobs',
      '`/monitor`   — Run intel scraper now (morning brief on demand)',
      '',
      '*Video summarizer (just paste a URL):*',
      '`tiktok.com/...`   — Summarize TikTok into bullet points',
      '`instagram.com/...` — Summarize IG Reel into bullet points',
      '_Auto-saves to intel feed if relevant (≥6/10)_',
      '',
      '*Ideas approval (auto-posts to New Project topic):*',
      '_Intel with score ≥8 → idea card with buttons_',
      '`✅ Add as Task` · `🎯 Add to Goal` · `🧠 Save to Memory` · `❌ Skip`',
      '`/clear`     — Reset this thread\'s conversation memory',
      '',
      '*Queue work:*',
      '`task: build X`          — Add to task queue',
      '`task: [dev] feature Y`  — Tagged task',
      '',
      '*Set goals (drives autonomous decisions):*',
      '`goal: description`',
      '',
      '*Anything else* → I respond immediately like a chat.',
    ].join('\n'), thread);
    return;
  }

  // ── /status ───────────────────────────────────────────────────────────────
  if (text === '/status') {
    const active = workers.listActive();
    const { pending, inProgress } = parseTasks(TASKS_FILE);
    const jobs = scheduler.list();

    const lines = [
      '⚙️ *Agent Status*',
      `• Workers running: \`${active.length}\``,
      `• Tasks in queue: \`${pending.length}\``,
      `• Tasks in progress: \`${inProgress.length}\``,
      `• Scheduled jobs: \`${jobs.length}\``,
    ];

    if (active.length > 0) {
      lines.push('', '*Running Workers:*');
      for (const w of active) {
        const mins = Math.round(w.runningMs / 60000);
        lines.push(`  • \`${w.id}\` — ${w.task.slice(0, 60)} *(${mins}m)*`);
      }
    }

    if (inProgress.length > 0) {
      lines.push('', '*In Progress:*');
      for (const t of inProgress) lines.push(`  • \`${t.id}\` — ${t.desc.slice(0, 60)}`);
    }

    await sendMsg(chatId, lines.join('\n'), thread);
    return;
  }

  // ── /tasks ────────────────────────────────────────────────────────────────
  if (text === '/tasks') {
    const content = fs.existsSync(TASKS_FILE)
      ? fs.readFileSync(TASKS_FILE, 'utf8')
      : '*(No tasks yet. Add with "task: do X")*';
    await sendMsg(chatId, `📋 *Task Queue*\n\n\`\`\`\n${content.slice(0, 3400)}\n\`\`\``, thread);
    return;
  }

  // ── /goals ────────────────────────────────────────────────────────────────
  if (text === '/goals') {
    const goals = memory.readGoals();
    await sendMsg(chatId, `🎯 *Current Goals*\n\n${goals.slice(0, 3500)}`, thread);
    return;
  }

  // ── /workers ──────────────────────────────────────────────────────────────
  if (text === '/workers') {
    const active = workers.listActive();
    if (active.length === 0) {
      await sendMsg(chatId, '🔵 No workers running right now.', thread);
    } else {
      const lines = ['⚙️ *Active Workers:*', ''];
      for (const w of active) {
        const mins = Math.round(w.runningMs / 60000);
        lines.push(`• \`${w.id}\` (PID \`${w.pid}\`)`);
        lines.push(`  ${w.task.slice(0, 80)}`);
        lines.push(`  Running: ${mins} min`);
        lines.push('');
      }
      await sendMsg(chatId, lines.join('\n'), thread);
    }
    return;
  }

  // ── /schedule ─────────────────────────────────────────────────────────────
  if (text === '/schedule') {
    const jobs = scheduler.list();
    const lines = ['📅 *Scheduled Jobs:*', ''];
    for (const j of jobs) lines.push(`• ${j}`);
    if (jobs.length === 0) lines.push('*(none)*');
    await sendMsg(chatId, lines.join('\n'), thread);
    return;
  }

  // ── /monitor ──────────────────────────────────────────────────────────────
  if (text === '/monitor') {
    await sendMsg(chatId, '🔍 *Running intel scraper now...* (takes ~60s)', thread);
    // Pass notifyIntel so digest posts to Social Monitor thread (thread 4)
    socialMonitor.run(notifyIntel)
      .then(async result => {
        log(`[Monitor] Manual run complete — ${result.sent} items`);
        // Post idea cards (score ≥8) to New Project topic
        const ideaItems = (result.items || []).filter(i => (i.relevanceScore || 0) >= 8);
        if (ideaItems.length > 0) {
          await sendMsg(GROUP_ID,
            `💡 *${ideaItems.length} high-value idea${ideaItems.length > 1 ? 's' : ''} found — sending to New Project...*`,
            THREAD_SOCIAL_MONITOR
          );
          for (const item of ideaItems.slice(0, 5)) {
            await sendIdeaCard(item);
          }
        }
        await sendMsg(chatId,
          `✅ *Intel scan complete:* ${result.sent} items found${ideaItems.length > 0 ? `, ${ideaItems.length} idea card${ideaItems.length > 1 ? 's' : ''} sent` : ''}`,
          thread
        );
      })
      .catch(err => {
        log(`[Monitor] Error: ${err.message}`);
        sendMsg(chatId, `⚠️ Intel scraper error: ${err.message}`, thread);
      });
    return;
  }

  // ── /sprint ───────────────────────────────────────────────────────────────
  if (text === '/sprint') {
    const s = getSprintState();
    const lines = [
      `🏃 *Sprint:* ${s.sprint?.goal || 'none'}`,
      `Queue: ${s.queue.length} · Active: ${s.active.length} · Done: ${s.completed.length} · Blocked: ${s.blocked.length}`,
    ];
    if (s.active.length > 0)  lines.push('', '*Active:*',  ...s.active.map(t  => `⚡ \`${t.id}\` — ${(t.prompt || '').slice(0, 60)}`));
    if (s.blocked.length > 0) lines.push('', '*Blocked:*', ...s.blocked.map(t => `⚠️ \`${t.id}\` — ${(t.blockReason || '').slice(0, 60)}`));
    if (s.completed.slice(-3).length > 0) lines.push('', '*Recently done:*', ...s.completed.slice(-3).map(t => `✅ \`${t.id}\` — ${(t.summary || '').slice(0, 60)}`));
    await sendMsg(chatId, lines.join('\n'), thread);
    return;
  }

  // ── /clear ────────────────────────────────────────────────────────────────
  if (text === '/clear') {
    convHistory.delete(threadKey(chatId, thread));
    await sendMsg(chatId, '🧹 Thread memory cleared.', thread);
    return;
  }

  // ── task: [description] ───────────────────────────────────────────────────
  const taskMatch = text.match(/^(?:task|add task|queue task):\s*(.+)/i);
  if (taskMatch) {
    const desc  = taskMatch[1].trim();
    const newId = addTask(TASKS_FILE, desc);
    memory.log(`Task queued via Telegram: ${newId} — ${desc}`);
    // Also route through the event-driven orchestrator pipeline
    queueTask(newId, desc);
    await sendMsg(
      chatId,
      `✅ *Task queued:* \`${newId}\`\n${desc}\n\n_Pipeline starting now..._`,
      thread
    );
    return;
  }

  // ── goal: [description] ───────────────────────────────────────────────────
  const goalMatch = text.match(/^goal:\s*(.+)/i);
  if (goalMatch) {
    const goalText = goalMatch[1].trim();
    memory.addGoal(goalText);
    memory.log(`Goal added via Telegram: ${goalText}`);
    await sendMsg(chatId, `🎯 *Goal added:*\n${goalText}`, thread);
    return;
  }

  // ── TikTok / Instagram / YouTube Shorts URL ───────────────────────────────
  const videoUrl = extractVideoUrl(text);
  if (videoUrl) {
    const thinkMsg = await tg('sendMessage', {
      chat_id:           chatId,
      text:              '⏳ Processing video...',
      message_thread_id: thread || undefined,
    });

    processVideo(videoUrl, null)
      .then(async (summary) => {
        if (thinkMsg?.message_id) {
          await tg('deleteMessage', { chat_id: chatId, message_id: thinkMsg.message_id });
        }
        await sendMsg(chatId, summary, thread);
      })
      .catch(async (err) => {
        if (thinkMsg?.message_id) {
          await tg('deleteMessage', { chat_id: chatId, message_id: thinkMsg.message_id });
        }
        await sendMsg(chatId, `❌ Video processing error: ${err.message}`, thread);
      });
    return;
  }

  // ── Default: chat with Claude ─────────────────────────────────────────────
  addHistory(chatId, thread, 'user', text);

  const prompt   = buildChatPrompt(chatId, thread, text);
  const thinkMsg = await tg('sendMessage', {
    chat_id:           chatId,
    text:              '⏳ Thinking...',
    message_thread_id: thread || undefined,
  });

  // Sonnet for all chat responses — fast, smart enough for conversation
  const result = await runClaude(prompt, { timeoutMs: 300000, model: 'sonnet' });
  const reply  = result.output || '(no response)';

  if (thinkMsg?.message_id) {
    await tg('deleteMessage', { chat_id: chatId, message_id: thinkMsg.message_id });
  }

  addHistory(chatId, thread, 'assistant', reply);
  await sendMsg(chatId, reply, thread);
}

// ── Work loop — autonomous brain, runs every 10 min ──────────────────────────

async function workLoop() {
  const active = workers.listActive();
  log(`[Work] Tick — ${active.length} workers active`);
  memory.log(`Work loop tick — ${active.length} workers running`);

  const decision = await decide(active);
  log(`[Work] Decision: ${decision.action} — ${decision.reason}`);

  if (decision.action === 'wait') {
    memory.log(`Work loop: waiting — ${decision.reason}`);
    return;
  }

  if (!decision.prompt) {
    log('[Work] Decision was "work" but no prompt — skipping');
    return;
  }

  // Determine worker ID
  const workerId = decision.taskId || `AUTO-${Date.now()}`;

  // Mark task in-progress in TASKS.md if it's a queued task
  if (decision.taskId) {
    const { pending } = parseTasks(TASKS_FILE);
    const task = pending.find(t => t.id === decision.taskId);
    if (task) markInProgress(TASKS_FILE, task);
  }

  memory.log(`Spawning worker: ${workerId} — ${decision.prompt.slice(0, 80)}`);
  log(`[Work] Spawning worker: ${workerId}`);

  notifyWorkers(`🚀 *Starting:* \`${workerId}\`\n${decision.prompt.slice(0, 200)}`);

  workers.spawnWorker(workerId, decision.prompt);
}

// ── Nightly consolidation — runs at 2:00 AM ───────────────────────────────────

async function nightlyConsolidation() {
  log('[Nightly] Starting consolidation...');
  memory.log('Nightly consolidation started');

  const consolidationScript = path.join(AGENTS_DIR, 'consolidation-agent.js');
  if (fs.existsSync(consolidationScript)) {
    await new Promise((resolve) => {
      const child = spawn('node', [consolidationScript], {
        cwd:   ROOT,
        env:   { ...process.env },
        stdio: 'inherit',
      });
      child.on('close', resolve);
      child.on('error', (err) => {
        log(`[Nightly] Consolidation error: ${err.message}`);
        resolve();
      });
    });
  } else {
    log('[Nightly] No consolidation-agent.js found — skipping');
  }

  // Prepare tomorrow's daily note
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const tomorrowFile = path.join(ROOT, 'memory', 'daily', `${tomorrowDate}.md`);

  if (!fs.existsSync(tomorrowFile)) {
    fs.mkdirSync(path.dirname(tomorrowFile), { recursive: true });
    fs.writeFileSync(tomorrowFile, `# ${tomorrowDate}\n\n## Today's Focus\n---\n\n## Log\n`);
  }

  memory.log("Nightly consolidation complete. Tomorrow's note prepared.");
  log('[Nightly] Done.');
}

// ── Telegram polling ──────────────────────────────────────────────────────────

async function startTelegramPolling() {
  log('[TG] Connecting to Telegram...');

  const me = await tg('getMe');
  if (!me) {
    log('[TG] ❌ Failed to connect. Check TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
  }

  log(`[TG] ✅ Connected as @${me.username}`);

  // Seed offset to skip old messages
  let offset = 0;
  const seed = await tg('getUpdates', { offset: -1, limit: 1 });
  if (seed?.length) offset = seed[seed.length - 1].update_id + 1;

  // Polling loop — never exits
  let conflictCount = 0;

  while (true) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout:          30,
        allowed_updates: ['message', 'callback_query'],
      });

      conflictCount = 0; // reset on success

      if (!updates) { await sleep(5000); continue; }

      for (const upd of updates) {
        offset = upd.update_id + 1;
        if (upd.message) {
          handleMessage(upd.message).catch(err =>
            log(`[TG] Unhandled handler error: ${err.message}`)
          );
        }
        if (upd.callback_query) {
          handleCallbackQuery(upd.callback_query).catch(err =>
            log(`[TG] Callback error: ${err.message}`)
          );
        }
      }
    } catch (err) {
      const isConflict = err.message && err.message.includes('Conflict');

      if (isConflict) {
        conflictCount++;
        if (conflictCount === 1) {
          log(`[TG] ⚠️  Conflict — another instance is running. Waiting for it to die...`);
        }
        // Back off exponentially up to 60s, then exit if stuck for >5 min
        const backoff = Math.min(60000, 3000 * conflictCount);
        await sleep(backoff);

        if (conflictCount >= 10) {
          log('[TG] ❌ Conflict unresolved after 10 attempts. Kill the other agent instance and restart.');
          log('[TG]    Run:  taskkill /F /IM node.exe   (Windows)');
          process.exit(1);
        }
      } else {
        log(`[TG] Poll error: ${err.message}`);
        await sleep(5000);
      }
    }
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Autonomous Agent — Booting                  ║');
  console.log(`║  ${new Date().toLocaleString().padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  log('Agent starting...');
  memory.log('Agent started');

  // Register work loop (every 10 min, run one cycle immediately)
  scheduler.schedule('work-loop', workLoop, WORK_INTERVAL_MS, { runImmediately: true });
  log(`[Scheduler] Work loop registered — every ${WORK_INTERVAL_MS / 60000} min`);

  // Register nightly consolidation at 2:00 AM
  scheduler.scheduleDaily('nightly', 2, 0, nightlyConsolidation);
  log('[Scheduler] Nightly consolidation registered — daily at 02:00');

  // Register daily standup at 9:00 AM
  scheduler.scheduleDaily('standup', 9, 0, () => {
    log('[Standup] Running daily scrum...');
    orch.emit('schedule', { name: 'standup' });
    // Also post to Discord
    discord.standupSummary(getSprintState()).catch(err => log(`[Standup] Discord error: ${err.message}`));
  });
  log('[Scheduler] Standup registered — daily at 09:00');

  // Register daily intel scraper at 8:00 AM
  scheduler.scheduleDaily('intel-scraper', 8, 0, async () => {
    log('[Intel] Morning brief starting...');
    try {
      // run() with null notifyFn — it sends the digest internally to the main group
      // We override by passing notifyIntel so the digest lands in Social Monitor thread
      const result = await socialMonitor.run(notifyIntel);
      log(`[Intel] Done — ${result.sent} items sent to Telegram`);

      // Post idea cards for high-value items (score ≥8) to New Project topic
      const ideaItems = (result.items || []).filter(i => (i.relevanceScore || 0) >= 8);
      if (ideaItems.length > 0) {
        log(`[Intel] Sending ${ideaItems.length} idea cards to New Project...`);
        await notifyIntel(`💡 *${ideaItems.length} high-value idea${ideaItems.length > 1 ? 's' : ''} below — approve or skip:*`);
        for (const item of ideaItems.slice(0, 5)) {
          await sendIdeaCard(item);
        }
      }
    } catch (err) {
      log(`[Intel] Error: ${err.message}`);
      await notify(`⚠️ *Intel scraper error:* ${err.message}`);
    }
  });
  log('[Scheduler] Intel scraper registered — daily at 08:00');

  // Start live dashboard HTTP server
  const dashPort = parseInt(process.env.DASHBOARD_PORT || '3000', 10);
  dashboard.start({
    workers,
    scheduler,
    parseTasks,
    memory,
    ROOT,
    TASKS_FILE,
    port: dashPort,
  });

  // Announce online
  const dashToken = process.env.DASHBOARD_TOKEN || 'agent';
  const newProjectNote = THREAD_NEW_PROJECT
    ? `Ideas → New Project topic`
    : `Set TELEGRAM_NEW_PROJECT_THREAD_ID in .env to enable idea cards`;
  await notify(
    `✅ *Agent online* — ${new Date().toLocaleString()}\n` +
    `Work loop: every 10 min · Standup: 09:00 AM\n` +
    `Nightly: 02:00 AM · Intel: 08:00 AM\n` +
    `Intel digest → Social Monitor topic (thread ${THREAD_SOCIAL_MONITOR})\n` +
    `${newProjectNote}\n` +
    `Dashboard: http://localhost:${dashPort}/?token=${dashToken}\n` +
    `\`/sprint\` for pipeline state · \`/help\` for all commands.`
  );

  log('Agent online. Starting Telegram polling...\n');

  // Start Telegram polling — this is the blocking call that keeps the process alive
  await startTelegramPolling();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal) {
  log(`[Shutdown] Received ${signal}`);
  memory.log(`Agent stopped (${signal})`);
  scheduler.cancelAll();
  workers.killAll();
  try { await notify(`🛑 *Agent stopped* (${signal})`); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  log(`💥 Uncaught exception: ${err.message}`);
  memory.log(`Uncaught exception: ${err.message}\n${err.stack}`);
  notify(`💥 *Uncaught error:* ${err.message}`).catch(() => {});
  // Don't exit — keep running
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log(`⚠️ Unhandled rejection: ${msg}`);
  memory.log(`Unhandled rejection: ${msg}`);
});

// ── Go ────────────────────────────────────────────────────────────────────────

main().catch(err => {
  log(`💥 Fatal startup error: ${err.message}`);
  process.exit(1);
});
