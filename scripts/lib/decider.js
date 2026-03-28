#!/usr/bin/env node
/**
 * Decider — autonomous context-driven decision engine.
 *
 * Called by the work loop every 10 minutes.
 * Decides what to work on next WITHOUT requiring manual goals.
 *
 * How it works (OpenClaw-style):
 *   1. Active workers at capacity? → wait
 *   2. Orphaned in-progress task? → restart it
 *   3. Pending tasks in TASKS.md? → execute next (highest priority)
 *   4. Gather FULL context: git status, projects, intel, recent work
 *   5. Ask Claude: "given everything you see, what's the single best thing to do right now?"
 *   6. Claude returns a specific, actionable task — agent does it
 *
 * No goals.md required. The agent reads its own context and self-directs.
 */

'use strict';

const path          = require('path');
const fs            = require('fs');
const { parseTasks, markInProgress } = require('./task-queue');
const { runClaude } = require('./claude-runner');
const memory        = require('./memory');
const gitOps        = require('./git-ops');

const ROOT       = path.resolve(__dirname, '..', '..');
const TASKS_FILE = path.join(ROOT, 'memory', 'TASKS.md');
const INTEL_FILE = path.join(ROOT, 'memory', 'areas', 'social-intel.md');

// Max concurrent workers before pausing
const MAX_CONCURRENT_WORKERS = 2;

// ── Context gathering ─────────────────────────────────────────────────────────

/**
 * Build rich context for the decision engine.
 * Reads: git status, projects, recent intel, recent work log, existing tasks.
 */
function gatherContext() {
  const lines = [];

  // 1. Repo state
  lines.push('=== REPO STATE ===');
  lines.push(gitOps.getRepoContext());

  // 2. Projects
  const projectsDir = path.join(ROOT, 'projects');
  const projects = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).filter(d => {
        if (d === '_template') return false;
        return fs.statSync(path.join(projectsDir, d)).isDirectory();
      })
    : [];

  if (projects.length > 0) {
    lines.push('', '=== ACTIVE PROJECTS ===');
    for (const proj of projects.slice(0, 5)) {
      const projDir = path.join(projectsDir, proj);
      const hasPackage = fs.existsSync(path.join(projDir, 'package.json'));
      const hasSrc     = fs.existsSync(path.join(projDir, 'src'));
      const hasTests   = fs.existsSync(path.join(projDir, 'tests'));
      lines.push(`- ${proj}: ${[
        hasPackage ? 'has package.json' : 'no package.json',
        hasSrc     ? 'has src/'        : 'no src/',
        hasTests   ? 'has tests/'      : 'no tests/',
      ].join(', ')}`);

      // Read package.json name/description if exists
      if (hasPackage) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(projDir, 'package.json'), 'utf8'));
          if (pkg.description) lines.push(`  Description: ${pkg.description}`);
        } catch {}
      }
    }
  } else {
    lines.push('', '=== PROJECTS ===');
    lines.push('No projects in projects/ yet (only _template exists)');
  }

  // 3. Scripts overview
  const scriptsDir = path.join(ROOT, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    lines.push('', '=== SCRIPTS (the agent itself) ===');
    const scriptFiles = [];
    try {
      scriptFiles.push(...fs.readdirSync(scriptsDir)
        .filter(f => f.endsWith('.js'))
        .map(f => `scripts/${f}`));
      const libFiles = fs.existsSync(path.join(scriptsDir, 'lib'))
        ? fs.readdirSync(path.join(scriptsDir, 'lib')).filter(f => f.endsWith('.js')).map(f => `scripts/lib/${f}`)
        : [];
      const agentFiles = fs.existsSync(path.join(scriptsDir, 'agents'))
        ? fs.readdirSync(path.join(scriptsDir, 'agents')).filter(f => f.endsWith('.js')).map(f => `scripts/agents/${f}`)
        : [];
      scriptFiles.push(...libFiles, ...agentFiles);
    } catch {}
    lines.push(scriptFiles.slice(0, 20).join(', '));
  }

  // 4. Recent intel (last 3 items from social-intel.md)
  if (fs.existsSync(INTEL_FILE)) {
    const intel = fs.readFileSync(INTEL_FILE, 'utf8');
    const links = intel.split('\n')
      .filter(l => l.includes('](') && l.startsWith('•'))
      .slice(0, 3);
    if (links.length > 0) {
      lines.push('', '=== RECENT INTEL ===');
      lines.push(links.join('\n'));
    }
  }

  // 5. Today's work log (last 10 entries)
  const todayLog = memory.readToday();
  if (todayLog) {
    const entries = todayLog.split('\n').filter(l => l.startsWith('- ')).slice(-10);
    if (entries.length > 0) {
      lines.push('', '=== TODAY\'S LOG (last 10 entries) ===');
      lines.push(entries.join('\n'));
    }
  }

  // 6. Pending tasks
  const { pending, inProgress } = parseTasks(TASKS_FILE);
  if (pending.length > 0 || inProgress.length > 0) {
    lines.push('', '=== TASK QUEUE ===');
    inProgress.forEach(t => lines.push(`[IN PROGRESS] ${t.id}: ${t.desc.slice(0, 80)}`));
    pending.slice(0, 5).forEach(t => lines.push(`[PENDING] ${t.id}: ${t.desc.slice(0, 80)}`));
  }

  // 7. Goals (if any active ones exist)
  const goals = memory.readGoals();
  const activeGoalsSection = goals.match(/## Active Goals\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
  if (activeGoalsSection && activeGoalsSection !== '*(No active goals at the moment)*' && activeGoalsSection.length > 10) {
    lines.push('', '=== ACTIVE GOALS (from goals.md) ===');
    lines.push(activeGoalsSection.slice(0, 1500));
  }

  return lines.join('\n');
}

// ── Main decide function ──────────────────────────────────────────────────────

/**
 * @param {Array} activeWorkerList - Result of workers.listActive()
 * @returns {Promise<{ action: 'work'|'wait', taskId: string|null, prompt: string|null, reason: string }>}
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

  // ── 2. Orphaned in-progress tasks ─────────────────────────────────────────
  const { pending, inProgress } = parseTasks(TASKS_FILE);
  const activeIds = new Set(activeWorkerList.map(w => w.id));
  const orphaned  = inProgress.filter(t => !activeIds.has(t.id));

  if (orphaned.length > 0) {
    const t = orphaned[0];
    return {
      action: 'work',
      taskId: t.id,
      prompt: t.desc,
      reason: `Resuming orphaned task ${t.id}`,
    };
  }

  // ── 3. Execute next pending queued task ───────────────────────────────────
  if (pending.length > 0) {
    const next = pending[0];
    return {
      action: 'work',
      taskId: next.id,
      prompt: next.desc,
      reason: `Next queued task: ${next.id}`,
    };
  }

  // ── 4. Autonomous context-driven decision (no goals required) ─────────────
  // This is the OpenClaw-style autonomous mode.
  // Gather full context and ask Claude what to work on next.

  const context = gatherContext();

  const systemCtx = memory.buildSystemContext();

  const decisionPrompt = [
    systemCtx,
    '',
    '=== AUTONOMOUS DECISION REQUEST ===',
    '',
    context,
    '',
    '=== INSTRUCTIONS ===',
    '',
    'You are the autonomous decision engine for Maxim\'s AI development agent.',
    'Your job: look at the full context above and decide ONE specific, valuable task to work on right now.',
    '',
    'How to think (like a senior engineer):',
    '- What is incomplete or broken that would block further progress?',
    '- What would most improve the agent\'s capabilities or the codebase?',
    '- Is there new intel worth implementing as a feature?',
    '- Is there a test missing for existing code?',
    '- Can any script or agent be made more robust?',
    '',
    'Rules:',
    '- Task must be completable in under 30 minutes',
    '- Be SPECIFIC — not "improve the agent" but "add error handling to scripts/lib/git-ops.js getStatus() function"',
    '- Do NOT repeat what was already done today (check the log above)',
    '- Prefer tasks that directly make the agent more autonomous and capable',
    '- If the agent is already working well and nothing is obviously broken, create a meaningful project in projects/',
    '',
    'Output ONLY a JSON object on the LAST LINE of your response:',
    '{"action":"work","prompt":"[precise task description — what to do, which files, what the output should be]","reason":"[1 sentence: why this is the most valuable thing right now]"}',
    'OR if truly nothing is useful:',
    '{"action":"wait","prompt":null,"reason":"[why waiting is correct]"}',
  ].join('\n');

  try {
    // Sonnet is fast enough for decision-making
    const result = await runClaude(decisionPrompt, { timeoutMs: 90000, model: 'sonnet' });

    if (result.structured &&
        (result.structured.action === 'work' || result.structured.action === 'wait') &&
        (result.structured.action !== 'work' || result.structured.prompt)) {
      return {
        action: result.structured.action,
        taskId: null,
        prompt: result.structured.prompt || null,
        reason: result.structured.reason  || 'Autonomous decision',
      };
    }

    // If structured parse failed but output looks like a task, try to use it
    if (result.output && result.output.length > 50) {
      // Try extracting JSON anywhere in output
      const jsonMatch = result.output.match(/\{[^{}]*"action"\s*:\s*"work"[^{}]*"prompt"[^{}]*\}/s);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.prompt) {
            return { action: 'work', taskId: null, prompt: parsed.prompt, reason: parsed.reason || 'Autonomous decision' };
          }
        } catch {}
      }
    }
  } catch (err) {
    memory.log(`Decider: error — ${err.message}`);
  }

  // ── 5. Default: wait ───────────────────────────────────────────────────────
  return {
    action: 'wait',
    taskId: null,
    prompt: null,
    reason: 'No actionable work identified (decision engine unavailable)',
  };
}

module.exports = { decide };
