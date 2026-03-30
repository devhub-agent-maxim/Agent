#!/usr/bin/env node
/**
 * Orchestrator — event-driven task pipeline.
 *
 * Replaces the 10-minute polling decider with a lean, event-driven engine.
 * Uses Sonnet for all decisions (no Opus) with synthesized prompts under 500 chars.
 *
 * Pipeline (Superpowers-style):
 *   event → decide → route → dispatch worker → review → commit gate
 *
 * Sprint state lives in memory/sprint/current.json — shared by all agents.
 *
 * Events:
 *   emit('task', { id, prompt, projectName })   — new work request
 *   emit('done', { workerId, structured })       — worker finished
 *   emit('error', { workerId, message })         — worker failed
 *   emit('telegram', { text, threadId })         — inbound Telegram command
 *   emit('schedule', { name })                   — scheduled trigger
 *
 * Usage:
 *   const orch = require('./lib/orchestrator');
 *   orch.emit('task', { id: 'T-001', prompt: 'Add /ping endpoint to delivery-logistics' });
 */

'use strict';

const EventEmitter = require('events');
const fs           = require('fs');
const path         = require('path');
const { runClaude }  = require('./claude-runner');
const workers        = require('./workers');
const memory         = require('./memory');

const ROOT         = path.resolve(__dirname, '..', '..');
const SPRINT_FILE  = path.join(ROOT, 'memory', 'sprint', 'current.json');
const MAX_WORKERS  = 3;

// ── Sprint state helpers ──────────────────────────────────────────────────────

function readSprint() {
  if (!fs.existsSync(SPRINT_FILE)) return { queue: [], active: [], completed: [], blocked: [], pipeline: { stage: 'idle', currentTask: null, lastEvent: null } };
  try { return JSON.parse(fs.readFileSync(SPRINT_FILE, 'utf8')); }
  catch { return { queue: [], active: [], completed: [], blocked: [], pipeline: { stage: 'idle', currentTask: null, lastEvent: null } }; }
}

function writeSprint(state) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(SPRINT_FILE), { recursive: true });
  fs.writeFileSync(SPRINT_FILE, JSON.stringify(state, null, 2));
}

function sprintAddQueue(task) {
  const state = readSprint();
  if (!state.queue.find(t => t.id === task.id)) {
    state.queue.push({ ...task, queuedAt: new Date().toISOString() });
    writeSprint(state);
  }
}

function sprintStartTask(taskId) {
  const state = readSprint();
  const idx = state.queue.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    const [task] = state.queue.splice(idx, 1);
    task.startedAt = new Date().toISOString();
    state.active.push(task);
    state.pipeline.stage = 'working';
    state.pipeline.currentTask = taskId;
    writeSprint(state);
    return task;
  }
  return null;
}

function sprintCompleteTask(taskId, summary, stage = 'done') {
  const state = readSprint();
  const idx = state.active.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    const [task] = state.active.splice(idx, 1);
    task.completedAt = new Date().toISOString();
    task.summary = summary;
    task.stage = stage;
    state.completed.push(task);
    if (state.active.length === 0) {
      state.pipeline.stage = 'idle';
      state.pipeline.currentTask = null;
    }
    writeSprint(state);
  }
}

function sprintBlockTask(taskId, reason) {
  const state = readSprint();
  // Remove from active or queue
  ['active', 'queue'].forEach(key => {
    const idx = state[key].findIndex(t => t.id === taskId);
    if (idx !== -1) {
      const [task] = state[key].splice(idx, 1);
      task.blockedAt = new Date().toISOString();
      task.blockReason = reason;
      state.blocked.push(task);
    }
  });
  if (state.active.length === 0) state.pipeline.stage = 'idle';
  writeSprint(state);
}

// ── Lean context builder ──────────────────────────────────────────────────────
// Max ~500 chars total — no full MEMORY.md dump

function buildLeanContext(taskId) {
  const sprint = readSprint();
  const goals  = memory.readGoals();

  // Extract just the active goals block, truncate to 200 chars
  const goalMatch = goals.match(/## Active Goals([\s\S]*?)(?:##|$)/);
  const goalSnip  = (goalMatch ? goalMatch[1].trim() : 'none').slice(0, 200);

  const recent = sprint.completed.slice(-3).map(t => `✓ ${t.id}: ${(t.summary || '').slice(0, 60)}`).join('\n');
  const active = sprint.active.map(t => `⚡ ${t.id}: ${(t.prompt || '').slice(0, 60)}`).join('\n');

  return [
    `Sprint: ${sprint.sprint?.goal || 'bootstrapping'}`,
    `Goals: ${goalSnip}`,
    recent ? `Recent: ${recent}` : '',
    active ? `Active: ${active}` : '',
    `Task: ${taskId}`,
  ].filter(Boolean).join('\n');
}

// ── Agent routing ─────────────────────────────────────────────────────────────
// Detect stack from project dir, pick specialist

const STACK_AGENTS = {
  'next':    'nextjs-expert',
  'react':   'react-components',
  'vue':     'vue-components',
  'nuxt':    'nuxt-expert',
  'laravel': 'laravel-backend',
  'django':  'django-backend',
  'rails':   'rails-backend',
  'express': 'node-backend',
  'fastify': 'node-backend',
  'default': 'node-backend',
};

function detectAgent(projectName) {
  if (!projectName) return STACK_AGENTS.default;
  const pkgPath = path.join(ROOT, 'projects', projectName, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next)       return STACK_AGENTS.next;
    if (deps.nuxt)       return STACK_AGENTS.nuxt;
    if (deps.vue)        return STACK_AGENTS.vue;
    if (deps.react)      return STACK_AGENTS.react;
  }
  // Check for Python / Rails
  if (fs.existsSync(path.join(ROOT, 'projects', projectName, 'manage.py')))    return STACK_AGENTS.django;
  if (fs.existsSync(path.join(ROOT, 'projects', projectName, 'Gemfile')))      return STACK_AGENTS.rails;
  if (fs.existsSync(path.join(ROOT, 'projects', projectName, 'artisan')))      return STACK_AGENTS.laravel;
  return STACK_AGENTS.default;
}

// ── Sonnet decision engine ────────────────────────────────────────────────────
// Lean prompt: describe situation in <200 chars, get back routing JSON

async function decidePipeline(task) {
  const ctx = buildLeanContext(task.id);

  const prompt = [
    ctx,
    '',
    'You are the tech-lead orchestrator. Given this task, output a routing plan.',
    `Task prompt: "${task.prompt}"`,
    '',
    'Output ONE JSON on last line:',
    '{"pipeline":["code-archaeologist","<specialist>","code-reviewer","performance-optimizer"],"specialist":"<agent-name>","reason":"<20 words>"}',
    'Available specialists: nextjs-expert, react-components, vue-components, nuxt-expert, laravel-backend, django-backend, rails-backend, node-backend, api-architect, tailwind-frontend, frontend-developer',
    'Skip code-archaeologist if this is a new file creation task.',
  ].join('\n');

  const result = await runClaude(prompt, { model: 'sonnet', timeoutMs: 30000 });

  if (result.structured?.pipeline) {
    return result.structured;
  }

  // Fallback: default pipeline
  const specialist = detectAgent(task.projectName);
  return {
    pipeline: ['code-archaeologist', specialist, 'code-reviewer', 'performance-optimizer'],
    specialist,
    reason: 'auto-detected from project stack',
  };
}

// ── Pipeline execution ────────────────────────────────────────────────────────

async function runPipeline(task, plan) {
  memory.log(`Orchestrator: starting pipeline for ${task.id} — specialist: ${plan.specialist}`);

  let context = '';  // accumulates output from each stage for the next

  for (const agentName of plan.pipeline) {
    const stageId = `${task.id}:${agentName}`;

    // Build lean stage prompt
    const stagePrompt = buildStagePrompt(agentName, task, context, plan);
    memory.log(`Orchestrator: running stage ${agentName} for ${task.id}`);

    const result = await runClaude(stagePrompt, { model: 'sonnet', timeoutMs: 300000 });

    if (!result.success) {
      memory.log(`Orchestrator: stage ${agentName} failed — ${result.output.slice(0, 100)}`);
      sprintBlockTask(task.id, `Stage ${agentName} failed: ${result.output.slice(0, 80)}`);
      orch.emit('stageError', { taskId: task.id, stage: agentName, error: result.output });
      return;
    }

    // Check if code-reviewer returned fail
    if (agentName === 'code-reviewer' && result.structured?.status === 'fail') {
      const criticals = (result.structured.issues || []).filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
      if (criticals.length > 0) {
        const reason = criticals.map(i => `${i.severity}: ${i.issue}`).join('; ').slice(0, 200);
        memory.log(`Orchestrator: code-reviewer FAIL on ${task.id} — ${reason}`);
        sprintBlockTask(task.id, `Review failed: ${reason}`);
        orch.emit('reviewFail', { taskId: task.id, issues: criticals });
        return;
      }
    }

    // Accumulate context for next stage (compact: last 300 chars of output)
    const summary = result.structured?.summary || result.output.slice(-300);
    context += `\n[${agentName} result]: ${summary}`;
  }

  // All stages passed
  const finalSummary = context.slice(-200);
  sprintCompleteTask(task.id, finalSummary);
  memory.log(`Orchestrator: pipeline complete for ${task.id}`);
  orch.emit('pipelineDone', { taskId: task.id, summary: finalSummary });
}

function buildStagePrompt(agentName, task, priorContext, plan) {
  const agentFile = findAgentFile(agentName);
  const agentInstructions = agentFile
    ? fs.readFileSync(agentFile, 'utf8').replace(/^---[\s\S]*?---\n/, '').slice(0, 800)
    : `You are the ${agentName} agent.`;

  const projectDir = task.projectName ? path.join(ROOT, 'projects', task.projectName) : ROOT;

  return [
    agentInstructions,
    '',
    `Project: ${task.projectName || 'workspace root'} (${projectDir})`,
    `Task: ${task.prompt}`,
    priorContext ? `Prior stage output: ${priorContext.slice(-400)}` : '',
    '',
    'Work autonomously. Make real changes when your role requires it.',
    'Output last line as JSON per your agent spec.',
  ].filter(Boolean).join('\n');
}

function findAgentFile(agentName) {
  const searchDirs = [
    path.join(ROOT, '.claude', 'agents', 'team', 'core'),
    path.join(ROOT, '.claude', 'agents', 'team', 'specialists'),
    path.join(ROOT, '.claude', 'agents', 'team', 'universal'),
    path.join(ROOT, '.claude', 'agents', 'team', 'orchestrators'),
  ];
  for (const dir of searchDirs) {
    const file = path.join(dir, `${agentName}.md`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// ── Main event emitter ────────────────────────────────────────────────────────

const orch = new EventEmitter();

// New task queued
orch.on('task', async (task) => {
  if (!task.id) task.id = `TASK-${Date.now()}`;

  memory.log(`Orchestrator: task received — ${task.id}: ${task.prompt?.slice(0, 80)}`);
  sprintAddQueue(task);

  // If workers at capacity, queue for later
  const sprint = readSprint();
  if (sprint.active.length >= MAX_WORKERS) {
    memory.log(`Orchestrator: at capacity (${sprint.active.length}/${MAX_WORKERS}), queued ${task.id}`);
    return;
  }

  // Start immediately
  sprintStartTask(task.id);

  const plan = await decidePipeline(task);
  memory.log(`Orchestrator: pipeline plan for ${task.id} — ${JSON.stringify(plan).slice(0, 120)}`);

  await runPipeline(task, plan);

  // Drain queue if room
  orch.emit('_drain');
});

// Drain queue when a slot opens
orch.on('_drain', async () => {
  const sprint = readSprint();
  if (sprint.queue.length === 0 || sprint.active.length >= MAX_WORKERS) return;

  const next = sprint.queue[0];
  sprintStartTask(next.id);
  const plan = await decidePipeline(next);
  await runPipeline(next, plan);
  orch.emit('_drain');
});

// Telegram command handler
orch.on('telegram', ({ text, threadId }) => {
  const trimmed = text.trim();

  if (trimmed.startsWith('/task ')) {
    const prompt = trimmed.slice(6).trim();
    orch.emit('task', { id: `TG-${Date.now()}`, prompt, source: 'telegram', threadId });
    return;
  }

  if (trimmed === '/sprint' || trimmed === '/status') {
    const sprint = readSprint();
    const msg = [
      `Sprint: ${sprint.sprint?.goal || 'no active sprint'}`,
      `Queue: ${sprint.queue.length} | Active: ${sprint.active.length} | Done: ${sprint.completed.length} | Blocked: ${sprint.blocked.length}`,
      sprint.active.map(t => `⚡ ${t.id}`).join(', ') || '(idle)',
    ].join('\n');
    orch.emit('notify', { text: msg, threadId });
    return;
  }

  if (trimmed.startsWith('/goal ')) {
    const goal = trimmed.slice(6).trim();
    memory.addGoal(goal);
    orch.emit('notify', { text: `Goal added: ${goal}`, threadId });
    return;
  }
});

// Schedule trigger
orch.on('schedule', ({ name }) => {
  if (name === 'standup') {
    const sprint = readSprint();
    const completed = sprint.completed.slice(-5).map(t => `• ${t.id}: ${(t.summary || '').slice(0, 80)}`).join('\n');
    const blocked   = sprint.blocked.map(t => `⚠ ${t.id}: ${(t.blockReason || '').slice(0, 60)}`).join('\n');
    const active    = sprint.active.map(t => `⚡ ${t.id}`).join(', ');
    const text = [
      `🌅 Daily Standup — ${memory.today()}`,
      '',
      `Done:\n${completed || '(nothing yet)'}`,
      blocked ? `\nBlocked:\n${blocked}` : '',
      active  ? `\nActive: ${active}` : '',
    ].filter(Boolean).join('\n');
    orch.emit('notify', { text });
  }
});

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Queue a new task.
 * @param {string} id
 * @param {string} prompt
 * @param {string} [projectName]
 */
function queueTask(id, prompt, projectName) {
  orch.emit('task', { id, prompt, projectName });
}

/**
 * Get current sprint state snapshot.
 * @returns {object}
 */
function getSprintState() {
  return readSprint();
}

module.exports = {
  orch,
  queueTask,
  getSprintState,
  readSprint,
  writeSprint,
  sprintAddQueue,
  sprintStartTask,
  sprintCompleteTask,
  sprintBlockTask,
};
