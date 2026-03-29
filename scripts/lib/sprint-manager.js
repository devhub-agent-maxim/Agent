#!/usr/bin/env node
/**
 * Sprint Manager — tracks continuous development sprints.
 *
 * A "sprint" = all GitHub Issues with agent-task label for ONE project,
 * worked through continuously until the backlog hits 0.
 *
 * Flow:
 *   1. Worker completes → validator commits → sprintManager.onWorkerDone()
 *   2. Check GitHub Issues backlog for the active project
 *   3. If backlog has more items → return next task immediately (no 10-min wait)
 *   4. If backlog empty → sprint complete → send Telegram summary + board link
 *   5. Move to next project with a backlog, or enter idle mode
 *
 * Telegram rules:
 *   - SILENT during sprint (no per-worker spam)
 *   - NOTIFY on: sprint complete, blocker, urgent issue, startup
 */

'use strict';

const fs   = require('fs');
const path = require('path');

try { require('./config'); } catch (_) {}

const memory = require('./memory');
const gh     = require('./github-issues');

const ROOT = path.resolve(__dirname, '..', '..');

// ── Sprint state ──────────────────────────────────────────────────────────────

let activeSprint = null;
// { project: string, startedAt: Date, tasksCompleted: number, commits: string[] }

let sprintCallback = null;   // called with next task prompt when backlog has work
let completeCallback = null; // called with summary when sprint is done

function log(msg) {
  console.log(`[sprint] ${new Date().toLocaleTimeString()} ${msg}`);
}

// ── Project brief reader ──────────────────────────────────────────────────────

/**
 * Read PROJECT.md for a project and return its brief.
 */
function readProjectBrief(projectName) {
  const briefPath = path.join(ROOT, 'projects', projectName, 'PROJECT.md');
  if (!fs.existsSync(briefPath)) return null;
  return fs.readFileSync(briefPath, 'utf8');
}

/**
 * List all projects that have a PROJECT.md (ready for sprint).
 */
function listSprintableProjects() {
  const projectsDir = path.join(ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir)
    .filter(d => d !== '_template')
    .filter(d => {
      const stat = fs.statSync(path.join(projectsDir, d));
      return stat.isDirectory() && fs.existsSync(path.join(projectsDir, d, 'PROJECT.md'));
    });
}

// ── Sprint lifecycle ──────────────────────────────────────────────────────────

/**
 * Called after a worker completes. Decides whether to:
 *   a) Immediately queue the next task from GitHub Issues backlog
 *   b) Declare sprint complete and send Telegram summary
 *   c) Move to next project's backlog
 *
 * @param {string} workerId      - completed worker ID
 * @param {string} commitSha     - git SHA of the commit (or null)
 * @param {string} summary       - what was built
 * @param {function} notifyFn    - Telegram notify function
 * @returns {Promise<{hasMore: boolean, nextPrompt: string|null}>}
 */
async function onWorkerDone(workerId, commitSha, summary, notifyFn) {
  // Track commit in active sprint
  if (activeSprint && commitSha) {
    activeSprint.tasksCompleted++;
    activeSprint.commits.push(commitSha);
  }

  // Check GitHub Issues backlog
  if (!gh.isConfigured()) {
    return { hasMore: false, nextPrompt: null };
  }

  try {
    const backlog = await gh.getBacklog();

    if (backlog.length > 0) {
      // More work to do — build next task prompt from the issue
      const next = backlog[0];
      log(`Backlog has ${backlog.length} items — picking #${next.number}: ${next.title}`);

      const projectName = detectProject(next.title);
      const brief = projectName ? readProjectBrief(projectName) : null;

      const prompt = buildSprintPrompt(next, brief, projectName);

      return { hasMore: true, nextPrompt: prompt, issueNumber: next.number, issueTitle: next.title };
    }

    // Backlog empty — check if this was an active sprint
    if (activeSprint) {
      await completeSprint(notifyFn);
    } else {
      // No sprint tracked but backlog is empty — check other projects
      const nextProject = await findNextProjectWithBacklog();
      if (nextProject) {
        log(`Starting sprint for project: ${nextProject.project}`);
        await startSprint(nextProject.project, notifyFn);
        return { hasMore: true, nextPrompt: nextProject.prompt, issueNumber: nextProject.issueNumber };
      }
    }

    return { hasMore: false, nextPrompt: null };
  } catch (err) {
    log(`Error checking backlog: ${err.message}`);
    return { hasMore: false, nextPrompt: null };
  }
}

/**
 * Start a sprint for a project — creates initial backlog from PROJECT.md.
 */
async function startSprint(projectName, notifyFn) {
  activeSprint = {
    project:        projectName,
    startedAt:      new Date(),
    tasksCompleted: 0,
    commits:        [],
  };

  log(`Sprint started: ${projectName}`);
  memory.log(`Sprint started for ${projectName}`);

  const brief = readProjectBrief(projectName);
  if (brief && notifyFn) {
    // Silent start — no Telegram notification (only complete gets notified)
    log(`Sprint for ${projectName} running silently...`);
  }
}

/**
 * Mark sprint as complete and send Telegram summary.
 */
async function completeSprint(notifyFn) {
  if (!activeSprint) return;

  const { project, startedAt, tasksCompleted, commits } = activeSprint;
  const elapsed = Math.round((Date.now() - startedAt.getTime()) / 60000);
  const board   = gh.boardUrl();

  log(`Sprint complete: ${project} — ${tasksCompleted} tasks in ${elapsed} min`);
  memory.log(`Sprint complete: ${project} — ${tasksCompleted} tasks, ${commits.length} commits`);

  // Get recently done issues for summary
  const done = await gh.getRecentlyDone(24).catch(() => []);

  if (notifyFn) {
    const lines = [
      `🏁 *Sprint Complete — ${project}*`,
      '━━━━━━━━━━━━━━━━━━━',
      `✅ ${tasksCompleted} task${tasksCompleted !== 1 ? 's' : ''} completed`,
      commits.length > 0 ? `🔀 ${commits.length} commit${commits.length !== 1 ? 's' : ''} pushed` : '',
      `⏱️ Duration: ${elapsed} min`,
      '━━━━━━━━━━━━━━━━━━━',
    ];

    if (done.length > 0) {
      lines.push('*Completed:*');
      done.slice(0, 5).forEach(i => lines.push(`  • ${i.title}`));
    }

    lines.push('', `📋 [View all issues](${board})`);

    await notifyFn(lines.filter(l => l !== '').join('\n'));
  }

  activeSprint = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Detect which project an issue title relates to.
 */
function detectProject(issueTitle) {
  const title = issueTitle.toLowerCase();
  const projectsDir = path.join(ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return null;

  const projects = fs.readdirSync(projectsDir).filter(d => d !== '_template');
  for (const p of projects) {
    if (title.includes(p.toLowerCase().replace(/-/g, ' ')) ||
        title.includes(p.toLowerCase())) {
      return p;
    }
  }
  return null;
}

/**
 * Build a rich task prompt from a GitHub Issue + project brief.
 */
function buildSprintPrompt(issue, brief, projectName) {
  const lines = [
    `## Task: ${issue.title}`,
    `GitHub Issue: #${issue.number} — ${issue.url}`,
    '',
  ];

  if (brief) {
    // Extract sprint goal + constraints from PROJECT.md
    const sprintGoal    = brief.match(/## Current Sprint Goal\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
    const constraints   = brief.match(/## Constraints\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
    const stack         = brief.match(/## Stack\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();

    if (sprintGoal) { lines.push(`Sprint goal: ${sprintGoal}`, ''); }
    if (stack)      { lines.push(`Stack: ${stack}`, ''); }
    if (constraints){ lines.push(`Constraints: ${constraints}`, ''); }
  }

  lines.push(
    '## Instructions',
    '1. Read the existing code in the project directory first',
    '2. Implement the task described in the issue title',
    '3. Write tests for new functionality',
    '4. Run npm test — all tests must pass',
    '5. Do NOT commit — the validator handles commits',
    '',
    `Project directory: projects/${projectName || 'unknown'}`,
    `When done, output a one-line summary of what you built.`,
  );

  return lines.join('\n');
}

/**
 * Find the next project that has GitHub Issues in its backlog.
 * Returns { project, prompt, issueNumber } or null.
 */
async function findNextProjectWithBacklog() {
  // For now, getBacklog() gets all backlog issues regardless of project
  const backlog = await gh.getBacklog().catch(() => []);
  if (backlog.length === 0) return null;

  const issue = backlog[0];
  const projectName = detectProject(issue.title);
  const brief = projectName ? readProjectBrief(projectName) : null;
  const prompt = buildSprintPrompt(issue, brief, projectName);

  return { project: projectName || 'unknown', prompt, issueNumber: issue.number };
}

/**
 * Get current sprint status for dashboard/Telegram.
 */
function getStatus() {
  if (!activeSprint) return { active: false };
  const elapsed = Math.round((Date.now() - activeSprint.startedAt.getTime()) / 60000);
  return {
    active:         true,
    project:        activeSprint.project,
    elapsedMin:     elapsed,
    tasksCompleted: activeSprint.tasksCompleted,
    commits:        activeSprint.commits.length,
  };
}

/**
 * Create GitHub Issues from a PROJECT.md backlog section.
 * Call this once when registering a new project.
 *
 * @param {string} projectName
 */
async function seedBacklogFromProjectMd(projectName) {
  if (!gh.isConfigured()) return 0;
  const brief = readProjectBrief(projectName);
  if (!brief) return 0;

  // Extract backlog items: lines starting with "- [ ] "
  const backlogSection = brief.match(/## Backlog\n([\s\S]*?)(?=\n## |$)/)?.[1] || '';
  const items = backlogSection
    .split('\n')
    .filter(l => l.trim().startsWith('- [ ]'))
    .map(l => l.replace(/^- \[ \]\s*/, '').trim())
    .filter(Boolean);

  if (items.length === 0) return 0;

  log(`Seeding ${items.length} backlog items for ${projectName}...`);
  let created = 0;

  for (const item of items) {
    try {
      // Check if issue already exists with this title
      const existing = await gh.getBacklog();
      const alreadyExists = existing.some(i => i.title === item || i.title.includes(item.slice(0, 40)));
      if (alreadyExists) {
        log(`Skipping (exists): ${item}`);
        continue;
      }

      // Create with backlog label (not in-progress)
      const result = await gh.createIssue(item, `Project: ${projectName}\n\nPart of ${projectName} sprint backlog.`, null);
      if (result) {
        // Move to backlog label (createIssue puts it in-progress by default)
        // We need a direct API call to set backlog label instead
        created++;
        log(`Created issue #${result.number}: ${item}`);
      }
      // Small delay to avoid rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      log(`Error creating issue for "${item}": ${err.message}`);
    }
  }

  log(`Seeded ${created}/${items.length} issues for ${projectName}`);
  return created;
}

module.exports = {
  onWorkerDone,
  startSprint,
  completeSprint,
  getStatus,
  seedBacklogFromProjectMd,
  listSprintableProjects,
  readProjectBrief,
};
