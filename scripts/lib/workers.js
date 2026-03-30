#!/usr/bin/env node
/**
 * Worker manager — spawn and monitor background Claude CLI workers.
 *
 * A "worker" is a Claude CLI process started with --print --dangerously-skip-permissions
 * that receives a full system context (MEMORY.md + goals + daily log) prepended to
 * its task prompt. Workers run in the background; the main agent loop continues.
 *
 * Usage:
 *   const workers = require('./lib/workers');
 *   workers.onComplete((id, output, structured) => { ... });
 *   workers.onError((id, errorMsg) => { ... });
 *   workers.spawnWorker('TASK-007', 'Build the auth module...');
 */

'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const { config } = require('./config');
const memory     = require('./memory');

const ROOT = path.resolve(__dirname, '..', '..');

// Active worker registry: workerId → { pid, child, task, startedAt, status }
const activeWorkers = new Map();

// Callbacks
let _onComplete = null;
let _onError    = null;

/**
 * Register a callback for when a worker completes successfully.
 * @param {Function} fn - (workerId: string, output: string, structured: object|null) => void
 */
function onComplete(fn) { _onComplete = fn; }

/**
 * Register a callback for when a worker errors or times out.
 * @param {Function} fn - (workerId: string, errorMessage: string) => void
 */
function onError(fn) { _onError = fn; }

// ── Structured output parser ──────────────────────────────────────────────────

function extractStructured(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('{')) {
      try { return JSON.parse(lines[i]); } catch (_) {}
    }
  }
  return null;
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

/**
 * Spawn a background Claude CLI worker for a task.
 *
 * @param {string} workerId   - Unique ID (e.g. "TASK-007" or "AUTO-1234567890")
 * @param {string} taskPrompt - The task description / prompt text
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]     - Max ms to run (default: 30 min)
 * @param {string} [opts.extraContext]  - Additional context to inject before the task
 * @returns {number|null} PID of spawned process, or null if spawn failed
 */
function spawnWorker(workerId, taskPrompt, opts = {}) {
  if (activeWorkers.has(workerId)) {
    memory.log(`Worker ${workerId} already running — skipping duplicate spawn`);
    return null;
  }

  const timeoutMs    = opts.timeoutMs  ?? 1800000; // 30 min
  const extraContext = opts.extraContext ?? '';
  // Sonnet for all workers by default — fast, cheap, capable enough for execution tasks
  // Pass opts.model = 'opus' only for complex architecture / reasoning tasks
  const model        = opts.model ?? 'sonnet';
  const systemCtx    = memory.buildSystemContext();

  const fullPrompt = [
    systemCtx,
    extraContext ? `=== Additional Context ===\n${extraContext}\n` : '',
    '=== YOUR TASK ===',
    taskPrompt,
    '',
    'Instructions:',
    '- Work autonomously. Make real changes.',
    '- Read CLAUDE.md and MEMORY.md before starting.',
    '- Log progress to memory/daily/' + memory.today() + '.md as you go.',
    '- When done, summarize in 2-3 sentences.',
    '- Output your final result as a JSON object on the LAST line of your response:',
    '  {"status":"done","summary":"what you built/changed","nextAction":null}',
    '  OR if blocked: {"status":"blocked","summary":"exactly what is blocking you","nextAction":"what Maxim needs to do"}',
  ].join('\n');

  const claudeCmd = config.claude.cmd;

  memory.log(`Worker spawned: ${workerId} — ${taskPrompt.slice(0, 100)}`);

  let stdout   = '';
  let stderr   = '';
  let timedOut = false;

  let child;
  try {
    const { MODELS } = (() => {
      try { return require('./claude-runner'); } catch { return { MODELS: {} }; }
    })();
    const resolvedModel = { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6', haiku: 'claude-haiku-4-5-20251001' }[model] ?? model;

    child = spawn(
      claudeCmd,
      ['--print', '--dangerously-skip-permissions', '--no-session-persistence', '--model', resolvedModel],
      {
        cwd:         ROOT,
        env:         { ...process.env },
        windowsHide: true,
        shell:       true,
        stdio:       ['pipe', 'pipe', 'pipe'],
      }
    );
  } catch (spawnErr) {
    memory.log(`Worker spawn failed: ${workerId} — ${spawnErr.message}`);
    if (_onError) _onError(workerId, `Spawn failed: ${spawnErr.message}`);
    return null;
  }

  child.stdin.write(fullPrompt);
  child.stdin.end();

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const entry = {
    pid:       child.pid,
    child,
    task:      taskPrompt.slice(0, 120),
    workerId,
    startedAt: Date.now(),
    status:    'running',
  };
  activeWorkers.set(workerId, entry);

  // Timeout guard
  const timer = setTimeout(() => {
    timedOut = true;
    try { child.kill('SIGTERM'); } catch (_) {}
    entry.status = 'timed-out';
    activeWorkers.delete(workerId);
    memory.log(`Worker timed out: ${workerId} (${Math.round(timeoutMs / 60000)} min)`);
    if (_onError) _onError(workerId, `Timed out after ${Math.round(timeoutMs / 60000)} minutes`);
  }, timeoutMs);

  child.on('close', (code) => {
    clearTimeout(timer);
    if (timedOut) return;

    entry.status = 'done';
    activeWorkers.delete(workerId);

    const output     = stdout.trim() || stderr.trim() || `(exited with code ${code}, no output)`;
    const structured = extractStructured(output);

    memory.log(`Worker done: ${workerId} — ${structured?.summary || output.slice(0, 80)}`);

    if (_onComplete) _onComplete(workerId, output, structured);
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    entry.status = 'error';
    activeWorkers.delete(workerId);
    memory.log(`Worker error: ${workerId} — ${err.message}`);
    if (_onError) _onError(workerId, err.message);
  });

  return child.pid;
}

// ── Inspection ────────────────────────────────────────────────────────────────

/**
 * Check if a worker with this ID is currently running.
 * @param {string} workerId
 * @returns {boolean}
 */
function isRunning(workerId) {
  return activeWorkers.has(workerId);
}

/**
 * Returns a snapshot list of all currently active workers.
 * @returns {Array<{ id: string, pid: number, task: string, status: string, runningMs: number }>}
 */
function listActive() {
  return Array.from(activeWorkers.entries()).map(([id, w]) => ({
    id,
    pid:       w.pid,
    task:      w.task,
    status:    w.status,
    runningMs: Date.now() - w.startedAt,
  }));
}

/**
 * Count of currently active workers.
 * @returns {number}
 */
function count() {
  return activeWorkers.size;
}

// ── Control ───────────────────────────────────────────────────────────────────

/**
 * Kill a specific worker by ID.
 * @param {string} workerId
 */
function killWorker(workerId) {
  const entry = activeWorkers.get(workerId);
  if (entry) {
    try { entry.child.kill('SIGTERM'); } catch (_) {}
    activeWorkers.delete(workerId);
    memory.log(`Worker killed: ${workerId}`);
  }
}

/**
 * Kill all active workers.
 */
function killAll() {
  for (const [id] of activeWorkers) {
    killWorker(id);
  }
}

module.exports = {
  spawnWorker,
  isRunning,
  listActive,
  count,
  killWorker,
  killAll,
  onComplete,
  onError,
};
