#!/usr/bin/env node
/**
 * Decider — the autonomous decision engine.
 *
 * Called by the work loop every 10 minutes.
 * Returns what the agent should do next (or nothing).
 *
 * Decision priority:
 *   1. Active workers at capacity? → wait
 *   2. Orphaned in-progress task (marked but no worker)? → restart it
 *   3. Pending tasks in TASKS.md? → execute next
 *   4. Active goals with "next action" defined? → do that
 *   5. Active goals but no clear next action? → ask Claude to decide (costs API)
 *   6. Nothing? → wait
 *
 * Usage:
 *   const { decide } = require('./lib/decider');
 *   const decision = await decide(workers.listActive());
 *   // { action: 'work'|'wait', taskId, prompt, reason }
 */

'use strict';

const path          = require('path');
const { parseTasks} = require('./task-queue');
const { runClaude } = require('./claude-runner');
const memory        = require('./memory');

const ROOT       = path.resolve(__dirname, '..', '..');
const TASKS_FILE = path.join(ROOT, 'memory', 'TASKS.md');

// Max concurrent workers before pausing new work
const MAX_CONCURRENT_WORKERS = 2;

/**
 * Decide what to do next.
 *
 * @param {Array} activeWorkerList - Result of workers.listActive()
 * @returns {Promise<{
 *   action: 'work' | 'wait',
 *   taskId: string | null,
 *   prompt: string | null,
 *   reason: string
 * }>}
 */
async function decide(activeWorkerList) {

  // ── 1. Already at worker capacity ─────────────────────────────────────────
  if (activeWorkerList.length >= MAX_CONCURRENT_WORKERS) {
    return {
      action: 'wait',
      taskId: null,
      prompt: null,
      reason: `${activeWorkerList.length} workers running (max ${MAX_CONCURRENT_WORKERS})`,
    };
  }

  // ── 2. Check for orphaned in-progress tasks ────────────────────────────────
  const { pending, inProgress } = parseTasks(TASKS_FILE);
  const activeIds = new Set(activeWorkerList.map(w => w.id));

  const orphaned = inProgress.filter(t => !activeIds.has(t.id));
  if (orphaned.length > 0) {
    const t = orphaned[0];
    return {
      action: 'work',
      taskId: t.id,
      prompt: t.desc,
      reason: `Resuming orphaned task ${t.id} (was in-progress but no worker running)`,
    };
  }

  // ── 3. Execute next pending queued task ────────────────────────────────────
  if (pending.length > 0) {
    const next = pending[0];
    return {
      action: 'work',
      taskId: next.id,
      prompt: next.desc,
      reason: `Next queued task: ${next.id}`,
    };
  }

  // ── 4. Check goals for a defined "next action" ────────────────────────────
  const goals = memory.readGoals();
  const hasActiveGoals = goals.includes('## Active Goals') &&
    !goals.match(/## Active Goals\s*\n\s*\*\(none\)\*/) &&
    !goals.match(/## Active Goals\s*\n\s*---\s*\n\s*\n\s*##/);

  if (!hasActiveGoals) {
    return {
      action: 'wait',
      taskId: null,
      prompt: null,
      reason: 'No queued tasks and no active goals',
    };
  }

  // Extract "Next action:" from goals if it's clearly defined
  const nextActionMatch = goals.match(/\*\*Next action:\*\*\s*(.+?)(?:\n|$)/);
  if (nextActionMatch) {
    const nextAction = nextActionMatch[1].trim();
    // Don't re-do something that was logged today
    const dailyLog = memory.readToday();
    if (!dailyLog.toLowerCase().includes(nextAction.toLowerCase().slice(0, 30))) {
      return {
        action: 'work',
        taskId: null,
        prompt: nextAction,
        reason: `From goals "next action": ${nextAction.slice(0, 60)}`,
      };
    }
  }

  // ── 5. Ask Claude to decide (API cost — only when goals exist but no clear next step) ──
  try {
    const systemCtx = memory.buildSystemContext();
    const decisionPrompt = [
      systemCtx,
      '=== DECISION REQUEST ===',
      '',
      'You are the autonomous agent\'s decision engine.',
      'Based on the active goals and today\'s log above, decide ONE specific action to take right now.',
      '',
      'Rules:',
      '- Only suggest actions that directly advance an Active Goal',
      '- The action must be completable in under 30 minutes',
      '- Do not repeat anything already done today (check the daily log)',
      '- Be specific — not "work on the project" but "create scripts/lib/memory.js with these functions"',
      '- If nothing useful can be done right now, say wait',
      '',
      'Output ONLY a single JSON object on the last line of your response:',
      '{"action":"work","prompt":"[specific task description]","reason":"[why this advances the goal]"}',
      'OR:',
      '{"action":"wait","prompt":null,"reason":"[why waiting is correct right now]"}',
    ].join('\n');

    // Opus for strategic decisions only — this is the one place it's worth the cost
    const result = await runClaude(decisionPrompt, { timeoutMs: 60000, model: 'opus' });

    if (result.structured && (result.structured.action === 'work' || result.structured.action === 'wait')) {
      return {
        action: result.structured.action,
        taskId: null,
        prompt: result.structured.prompt || null,
        reason: result.structured.reason || 'Claude decision engine',
      };
    }
  } catch (err) {
    memory.log(`Decider: Claude decision engine error — ${err.message}`);
  }

  // ── 6. Default: wait ───────────────────────────────────────────────────────
  return {
    action: 'wait',
    taskId: null,
    prompt: null,
    reason: 'No actionable work identified',
  };
}

module.exports = { decide };
