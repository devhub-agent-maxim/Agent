#!/usr/bin/env node
/**
 * Agent v2 — Discord-only autonomous agent.
 *
 * No Telegram. No queue/drain. Direct execution.
 * Discord bot for commands. Webhooks for notifications.
 * Model routing from config/agents.json.
 *
 * Usage:   node scripts/agent.js
 * Stop:    Ctrl+C
 *
 * Three systems run in parallel:
 *   1. Discord bot — listens for commands in #command channel
 *   2. Scheduler   — standup (9am), briefing (9:30am), nightly (2am)
 *   3. Executor    — runs tasks via orchestrator with concurrency control
 */

'use strict';

require('./lib/config');

const { config }     = require('./lib/config');
const memory         = require('./lib/memory');
const scheduler      = require('./lib/scheduler');
const orch           = require('./lib/orchestrator');
const discord        = require('./lib/discord');
const discordBot     = require('./lib/discord-bot');
const paperclip      = require('./lib/paperclip');
const registry       = require('./lib/agent-registry');
const socialMonitor  = require('./agents/social-monitor-agent');
const standupAgent   = require('./agents/standup-agent');
const { runClaude }  = require('./lib/claude-runner');

const path = require('path');
const fs   = require('fs');
const { validate } = require('./lib/config');

const ROOT       = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(__dirname, 'agents');

// ── Shutdown state ────────────────────────────────────────────────────────────

let _shutdownInProgress = false;
let _idleLoopTimer      = null;
let _startupDrainTimer  = null;

// ── Logging ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(require('os').tmpdir(), 'agent.log');

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

// ── Discord bot commands ────────────────────────────────────────────────────

function registerCommands() {
  discordBot.onCommand('help', () => {
    return [
      '**Agent v2 — Commands**',
      '',
      '`!status`    — Sprint state + active tasks',
      '`!task <p>`  — Execute a task immediately',
      '`!goal <g>`  — Add a goal',
      '`!agents`    — Agent registry with model tiers',
      '`!standup`   — Trigger standup now',
      '`!monitor`   — Run social intel scraper',
      '`!sprint`    — Full sprint details',
      '`!schedule`  — Scheduled jobs',
    ].join('\n');
  });

  discordBot.onCommand('status', () => {
    const s = orch.getSprintState();
    const agents = registry.listAgents();
    return [
      `**Sprint:** ${s.sprint?.goal || 'none'}`,
      `Active: ${s.active.length} | Pending: ${s.queue.length} | Done: ${s.completed.length} | Blocked: ${s.blocked.length}`,
      s.active.length > 0
        ? s.active.map(t => `> ${t.id}: ${(t.prompt || '').slice(0, 60)}`).join('\n')
        : '> (idle)',
    ].join('\n');
  });

  discordBot.onCommand('sprint', () => {
    const s = orch.getSprintState();
    const lines = [`**Sprint:** ${s.sprint?.goal || 'none'}`];
    if (s.active.length > 0)  lines.push('', '**Active:**',  ...s.active.map(t  => `> ${t.id}: ${(t.prompt || '').slice(0, 60)}`));
    if (s.queue.length > 0)   lines.push('', '**Pending:**', ...s.queue.map(t   => `> ${t.id}: ${(t.prompt || '').slice(0, 60)}`));
    if (s.blocked.length > 0) lines.push('', '**Blocked:**', ...s.blocked.map(t => `> ${t.id}: ${(t.blockReason || '').slice(0, 60)}`));
    if (s.completed.slice(-5).length > 0) lines.push('', '**Recent:**', ...s.completed.slice(-5).map(t => `> ${t.id}: ${(t.summary || '').slice(0, 60)}`));
    return lines.join('\n');
  });

  discordBot.onCommand('agents', () => {
    const agents = registry.listAgents();
    const lines = ['**Agent Registry:**', '```'];
    for (const a of agents) {
      const pad = a.name.padEnd(22);
      lines.push(`${pad} ${a.tier.padEnd(7)} ${a.model.split('-').slice(-1)[0].padEnd(12)} ${a.role.slice(0, 40)}`);
    }
    lines.push('```');
    return lines.join('\n');
  });

  discordBot.onCommand('task', async (args) => {
    if (!args) return 'Usage: `!task <description>`';
    const id = `CMD-${Date.now().toString(36).toUpperCase()}`;
    log(`[Cmd] Task: ${id} — ${args.slice(0, 80)}`);

    // Fire-and-forget — execution starts immediately
    orch.execute({ id, prompt: args, skipPrd: true }).catch(err => {
      log(`[Cmd] Task error: ${err.message}`);
      discord.message(`Task \`${id}\` failed: ${err.message}`).catch(() => {});
    });

    return `Task \`${id}\` started. Watch #pipeline for progress.`;
  });

  discordBot.onCommand('goal', async (args) => {
    if (!args) return 'Usage: `!goal <description>` or `!goal <description> --project=<name>`';

    // Parse optional --project flag
    let projectName = null;
    let goal = args;
    const projectMatch = args.match(/--project[= ](\S+)/i);
    if (projectMatch) {
      projectName = projectMatch[1];
      goal = args.replace(/--project[= ]\S+/i, '').trim();
    }

    const goalId = `GOAL-${Date.now().toString(36).toUpperCase()}`;
    log(`[Cmd] Goal: ${goalId} — ${goal.slice(0, 80)}`);

    // Save to memory
    memory.addGoal(goal);
    memory.log(`Goal started via Discord: ${goal}`);

    // Fire-and-forget — Level 3 autonomous execution
    orch.executeGoal({ goal, projectName }).catch(err => {
      log(`[Cmd] Goal error: ${err.message}`);
      discord.message(`Goal failed: ${err.message}`).catch(() => {});
    });

    return `🎯 Goal accepted. Tech Lead is decomposing it into tasks. Watch #agents for the plan.`;
  });

  discordBot.onCommand('standup', async () => {
    log('[Cmd] Running standup...');
    try {
      const state = orch.getSprintState();
      const goals = memory.readGoals();
      const nextTasks = await standupAgent.runStandup(state, goals);

      for (const task of nextTasks) {
        if (task.id && task.prompt) {
          orch.execute({ id: task.id, prompt: task.prompt, projectName: task.projectName || 'delivery-router', skipPrd: true }).catch(() => {});
        }
      }

      return `Standup complete. ${nextTasks.length} tasks started. Check #standup for conversation.`;
    } catch (err) {
      return `Standup error: ${err.message}`;
    }
  });

  discordBot.onCommand('monitor', async () => {
    log('[Cmd] Running social monitor...');
    try {
      const result = await socialMonitor.run();
      const { briefing, rawCount, signalCount, noteFile } = result;

      // Post to Discord briefing channel
      await discord.morningBriefing({ briefing, rawCount, signalCount, noteFile });

      // Sync top ideas to Paperclip
      const topIdeas = (briefing.projectIdeas || []).filter(i => (i.score || 0) >= 8);
      for (const idea of topIdeas) {
        paperclip.syncBriefingIdea(idea).catch(() => {});
      }

      return `Intel scan: ${signalCount} signals, ${topIdeas.length} ideas synced. Check #briefing.`;
    } catch (err) {
      return `Monitor error: ${err.message}`;
    }
  });

  discordBot.onCommand('schedule', () => {
    const jobs = scheduler.list();
    return jobs.length > 0
      ? `**Scheduled:**\n${jobs.map(j => `> ${j}`).join('\n')}`
      : 'No scheduled jobs.';
  });
}

// ── Orchestrator event handlers ─────────────────────────────────────────────

orch.orch.on('taskComplete', ({ taskId, durationSec }) => {
  log(`[Orch] Complete: ${taskId} (${durationSec}s)`);
});

orch.orch.on('taskBlocked', ({ taskId, stage }) => {
  log(`[Orch] Blocked: ${taskId} at ${stage}`);
});

orch.orch.on('reviewFailed', ({ taskId, issues }) => {
  log(`[Orch] Review FAIL: ${taskId} — ${issues.length} issues`);
});

orch.orch.on('prdReady', ({ task, prd }) => {
  log(`[Orch] PRD ready: ${task.projectName || task.id}`);
  discord.message(`PRD generated for \`${task.projectName}\`. Starting pipeline...`).catch(() => {});
});

// ── Scheduled jobs ──────────────────────────────────────────────────────────

function registerScheduledJobs() {
  // 2:00 AM — Nightly consolidation
  scheduler.scheduleDaily('nightly', 2, 0, async () => {
    log('[Nightly] Starting consolidation...');
    memory.log('Nightly consolidation started');

    const script = path.join(AGENTS_DIR, 'consolidation-agent.js');
    if (fs.existsSync(script)) {
      const { spawn } = require('child_process');
      await new Promise(resolve => {
        const child = spawn('node', [script], { cwd: ROOT, env: { ...process.env }, stdio: 'inherit' });
        child.on('close', resolve);
        child.on('error', () => resolve());
      });
    }

    // Prepare tomorrow's daily note
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const file = path.join(ROOT, 'memory', 'daily', `${date}.md`);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `# ${date}\n\n## Today's Focus\n---\n\n## Log\n`);
    }

    memory.log('Nightly consolidation complete.');
    paperclip.reportRoutine('nightly', 'Nightly consolidation complete').catch(() => {});
    log('[Nightly] Done.');
  });

  // 9:00 AM — Multi-agent standup conversation
  scheduler.scheduleDaily('standup', 9, 0, async () => {
    log('[Standup] Running...');
    try {
      const state = orch.getSprintState();
      const goals = memory.readGoals();
      const nextTasks = await standupAgent.runStandup(state, goals);

      for (const task of nextTasks) {
        if (task.id && task.prompt) {
          orch.execute({ id: task.id, prompt: task.prompt, projectName: task.projectName || 'delivery-router', skipPrd: true }).catch(() => {});
        }
      }

      discord.message(`Standup complete. ${nextTasks.length} tasks started.`).catch(() => {});
      paperclip.syncStandup(orch.getSprintState()).catch(() => {});
    } catch (err) {
      log(`[Standup] Error: ${err.message}`);
      discord.standupSummary(orch.getSprintState()).catch(() => {});
    }
  });

  // 9:00 AM — NotebookLM deep research
  let _nlmIdeas = null;
  scheduler.scheduleDaily('notebooklm-research', 9, 0, async () => {
    log('[NLM] Deep research starting...');
    try {
      const notebooklmAgent = require('./agents/notebooklm-agent');
      _nlmIdeas = await notebooklmAgent.runMorningResearch();
      if (_nlmIdeas?.length) log(`[NLM] ${_nlmIdeas.length} ideas ready`);
    } catch (err) {
      log(`[NLM] Error: ${err.message}`);
    }
  });

  // 9:30 AM — Morning briefing (Discord)
  scheduler.scheduleDaily('morning-briefing', 9, 30, async () => {
    log('[Brief] Starting...');
    try {
      const result = await socialMonitor.run();
      const { briefing, rawCount, signalCount, noteFile } = result;

      // Merge NLM ideas
      if (_nlmIdeas?.length) {
        (briefing.projectIdeas = briefing.projectIdeas || []).push(
          ..._nlmIdeas.map(i => ({
            title: i.title, category: i.category, description: i.description,
            score: i.score || i.relevanceScore || 8, nextStep: i.nextStep || '',
            source: 'NotebookLM',
          }))
        );
        _nlmIdeas = null;
      }

      await discord.morningBriefing({ briefing, rawCount, signalCount, noteFile });
      log('[Brief] Discord briefing posted');

      // Sync top ideas to Paperclip
      const topIdeas = (briefing.projectIdeas || []).filter(i => (i.score || 0) >= 8);
      for (const idea of topIdeas) {
        paperclip.syncBriefingIdea(idea).catch(() => {});
      }

      paperclip.reportRoutine('morning-briefing', `${signalCount} signals, ${topIdeas.length} ideas`).catch(() => {});
      log(`[Brief] Done — ${signalCount} signals`);
    } catch (err) {
      log(`[Brief] Error: ${err.message}`);
      discord.message(`Morning briefing error: ${err.message}`).catch(() => {});
    }
  });

  log('[Scheduler] Jobs registered: nightly (02:00), standup (09:00), NLM (09:00), briefing (09:30)');
}

// ── Startup drain ───────────────────────────────────────────────────────────

async function drainPendingTasks() {
  const state = orch.getSprintState();

  // Move any stuck "active" tasks back to pending (from crashed session)
  if (state.active.length > 0) {
    log(`[Startup] ${state.active.length} stuck active task(s) — resetting to pending`);
    for (const t of state.active) {
      state.queue.push({ ...t, queuedAt: new Date().toISOString() });
    }
    state.active = [];
    if (state.pipeline) state.pipeline.stage = 'idle';
    orch.writeSprint(state);
  }

  if (state.queue.length > 0) {
    log(`[Startup] Executing ${state.queue.length} pending task(s)...`);
    const tasks = state.queue.map(t => ({
      id: t.id, prompt: t.prompt, projectName: t.projectName, skipPrd: t.skipPrd ?? true,
    }));
    // All fire in parallel via executeAll
    orch.executeAll(tasks).catch(err => log(`[Startup] Drain error: ${err.message}`));
  } else {
    log('[Startup] No pending tasks. Waiting for commands or auto-generation.');
    // Trigger auto-task generation after delay
    _startupDrainTimer = setTimeout(async () => {
      _startupDrainTimer = null;
      const auto = await orch.generateNextTask().catch(() => null);
      if (auto) orch.execute({ id: auto.id, prompt: auto.prompt, projectName: auto.projectName, skipPrd: true }).catch(err => log(`[Startup] Auto-task error: ${err.message}`));
    }, 10000);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(52));
  console.log('  Agent v2 — Discord-only');
  console.log('  ' + new Date().toLocaleString());
  console.log('='.repeat(52) + '\n');

  log('Agent starting...');
  memory.log('Agent v2 started');

  // Validate required config early — fail fast before Orchestrator init
  // Note: Discord gracefully degrades if tokens missing (notification-only mode)
  // Claude has hardcoded fallback path; GitHub is critical for orchestrator
  try {
    validate([
      'github.token',
      'github.owner',
      'github.repo',
    ]);
  } catch (err) {
    log(`[Config] ${err.message}`);
    discord.systemLog({ event: 'Config Error', detail: err.message, level: 'error' }).catch(() => {});
    process.exit(1);
  }

  // Load agent registry
  const agentConfig = registry.load();
  log(`[Registry] ${Object.keys(agentConfig.agents).length} agents loaded, max workers: ${agentConfig.concurrency.maxWorkers}`);

  // Initialize Discord bot
  const botReady = await discordBot.init();
  if (botReady) {
    registerCommands();
    discordBot.startPolling(5000);
    log('[Discord] Bot online — listening for commands');
  } else {
    log('[Discord] Bot not configured — running in notification-only mode');
    log('[Discord] Set DISCORD_BOT_TOKEN + DISCORD_COMMAND_CHANNEL_ID in .env for commands');
  }

  // Register scheduled jobs
  registerScheduledJobs();

  // Announce online via Discord — both general and system channels
  discord.message([
    '**Agent v2 online** — ' + new Date().toLocaleString(),
    `Agents: ${Object.keys(agentConfig.agents).length} | Max workers: ${agentConfig.concurrency.maxWorkers}`,
    'Schedule: standup 09:00 | briefing 09:30 | nightly 02:00',
    botReady ? 'Commands: `!help` in command channel' : 'Command channel not configured',
  ].join('\n')).catch(() => {});

  discord.systemLog({
    event: 'Agent v2 Boot',
    detail: [
      `Agents: ${Object.keys(agentConfig.agents).length}`,
      `Max workers: ${agentConfig.concurrency.maxWorkers}`,
      `Discord bot: ${botReady ? 'active' : 'notification-only'}`,
      `Jobs: nightly (02:00), standup (09:00), NLM (09:00), briefing (09:30)`,
    ].join('\n'),
    level: 'success',
  }).catch(() => {});

  // Drain any pending tasks from previous session
  await drainPendingTasks();

  // Periodic idle check — auto-generate tasks when nothing is running.
  // Self-scheduling setTimeout prevents concurrent ticks if a tick takes >10 min.
  async function idleLoopTick() {
    try {
      const s = orch.getSprintState();
      const status = `queue=${s.queue.length} active=${s.active.length}`;
      memory.log(`Heartbeat: idle loop tick — ${status}`);
      if (s.queue.length === 0 && s.active.length === 0) {
        const auto = await orch.generateNextTask().catch(() => null);
        if (auto) {
          memory.log(`Heartbeat: auto-task generated — ${auto.id}`);
          orch.execute({ id: auto.id, prompt: auto.prompt, projectName: auto.projectName, skipPrd: true })
            .catch(err => log(`[Idle] Auto-task error: ${err.message}`));
        }
      }
    } catch (err) {
      log(`[Idle] Loop error: ${err.message}`);
      memory.log(`Heartbeat: idle loop error — ${err.message}`);
    } finally {
      _idleLoopTimer = setTimeout(idleLoopTick, 10 * 60 * 1000);
    }
  }

  _idleLoopTimer = setTimeout(idleLoopTick, 10 * 60 * 1000);

  // Keep process alive
  log('Agent running. Ctrl+C to stop.\n');
  await new Promise(() => {}); // never resolves — process stays alive via scheduler + bot
}

// ── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(signal) {
  if (_shutdownInProgress) return;
  _shutdownInProgress = true;

  log(`[Shutdown] ${signal} — cleaning up...`);
  memory.log(`Agent stopping (${signal})`);

  // Clear pending timers so they don't fire during shutdown
  if (_idleLoopTimer)    { clearTimeout(_idleLoopTimer);    _idleLoopTimer = null; }
  if (_startupDrainTimer){ clearTimeout(_startupDrainTimer); _startupDrainTimer = null; }

  // Stop accepting new work
  scheduler.cancelAll();
  discordBot.stopPolling();

  // Drain in-flight tasks — wait up to 30s then save state for next boot
  const DRAIN_TIMEOUT_MS = 30_000;
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let state = orch.getSprintState();
  if (state.active.length > 0) {
    log(`[Shutdown] Draining ${state.active.length} in-flight task(s) (max 30s)...`);
    while (state.active.length > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      state = orch.getSprintState();
    }
    if (state.active.length > 0) {
      log(`[Shutdown] Drain timeout — ${state.active.length} task(s) unfinished. Requeueing for next session.`);
      state.queue.unshift(...state.active.map(t => ({ ...t, queuedAt: new Date().toISOString() })));
      state.active = [];
      if (state.pipeline) state.pipeline.stage = 'idle';
      orch.writeSprint(state);
    }
  }

  // Notify Discord — awaited so the message goes out before exit
  try {
    await discord.systemLog({ event: 'Agent Shutdown', detail: `Signal: ${signal}`, level: 'warn' });
  } catch {}

  memory.log(`Agent stopped (${signal})`);
  log('[Shutdown] Complete.');
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  log(`Uncaught: ${err.message}`);
  memory.log(`Uncaught: ${err.message}\n${err.stack}`);
  discord.systemLog({ event: 'Uncaught Exception', detail: `${err.message}\n${(err.stack || '').slice(0, 300)}`, level: 'error' }).catch(() => {});
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log(`Rejection: ${msg}`);
  memory.log(`Rejection: ${msg}`);
});

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
