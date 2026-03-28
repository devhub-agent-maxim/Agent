#!/usr/bin/env node
/**
 * Autonomous Runner
 *
 * Reads all TASKS.md files in memory/projects/, picks the next pending task,
 * marks it in-progress, spawns execution via claude-flow CLI, then marks done.
 *
 * Usage:
 *   node scripts/autonomous-runner.js           — run next pending task
 *   node scripts/autonomous-runner.js --all     — run all pending tasks
 *   node scripts/autonomous-runner.js --dry-run — show what would run, don't execute
 *   node scripts/autonomous-runner.js --status  — just print status, exit
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'memory', 'projects');
const DAILY_DIR = path.join(ROOT, 'memory', 'daily');

// ─── Arg parsing ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const RUN_ALL  = args.includes('--all');
const DRY_RUN  = args.includes('--dry-run');
const STATUS_ONLY = args.includes('--status');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function log(msg) { console.log(msg); }
function bold(str) { return `\x1b[1m${str}\x1b[0m`; }
function green(str) { return `\x1b[32m${str}\x1b[0m`; }
function yellow(str) { return `\x1b[33m${str}\x1b[0m`; }
function cyan(str) { return `\x1b[36m${str}\x1b[0m`; }
function red(str) { return `\x1b[31m${str}\x1b[0m`; }

// ─── Task scanning ───────────────────────────────────────────────────────────
function findAllTaskFiles() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return fs.readdirSync(MEMORY_DIR)
    .map(p => path.join(MEMORY_DIR, p, 'TASKS.md'))
    .filter(f => fs.existsSync(f));
}

function parseTasks(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const projectName = path.basename(path.dirname(file));
  const tasks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // [ ] pending  [→] in-progress  [✓] done  [✗] blocked
    const match = line.match(/^[-*]\s+\[(.)\]\s+(.+?)(?:\s+—\s+(.+))?$/);
    if (match) {
      tasks.push({
        index: i,
        status: match[1],
        description: match[2].trim(),
        meta: match[3] || '',
        project: projectName,
        file,
        raw: line,
      });
    }
  }
  return tasks;
}

function allTasks() {
  return findAllTaskFiles().flatMap(parseTasks);
}

function tasksByStatus(status) {
  return allTasks().filter(t => t.status === status);
}

// ─── Task mutation ───────────────────────────────────────────────────────────
function setTaskStatus(task, newStatus) {
  const content = fs.readFileSync(task.file, 'utf8');
  const lines = content.split('\n');
  lines[task.index] = lines[task.index].replace(/\[.\]/, `[${newStatus}]`);
  fs.writeFileSync(task.file, lines.join('\n'));
}

// ─── Daily note ──────────────────────────────────────────────────────────────
function appendToDaily(entry) {
  if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });
  const file = path.join(DAILY_DIR, `${today()}.md`);
  const header = `# ${today()}\n`;
  let existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : header;

  const section = '\n## Autonomous Runner Log\n';
  if (!existing.includes(section.trim())) existing += section;

  existing += `\n- ${new Date().toLocaleTimeString()} — ${entry}`;
  fs.writeFileSync(file, existing);
}

// ─── Status report ───────────────────────────────────────────────────────────
function printStatus() {
  const tasks = allTasks();
  if (tasks.length === 0) {
    log(yellow('No TASKS.md files found in memory/projects/'));
    log('Create one at: memory/projects/<project-name>/TASKS.md');
    return;
  }

  const byProject = {};
  for (const t of tasks) {
    if (!byProject[t.project]) byProject[t.project] = { ' ': [], '→': [], '✓': [], '✗': [] };
    byProject[t.project][t.status]?.push(t);
  }

  log('');
  log(bold('═══════════════════════════════════════════'));
  log(bold('  AUTONOMOUS RUNNER — PROJECT STATUS'));
  log(bold(`  ${today()}`));
  log(bold('═══════════════════════════════════════════'));

  for (const [project, groups] of Object.entries(byProject)) {
    const done    = (groups['✓'] || []).length;
    const pending = (groups[' '] || []).length;
    const active  = (groups['→'] || []).length;
    const blocked = (groups['✗'] || []).length;
    const total   = done + pending + active + blocked;
    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar     = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    log('');
    log(bold(`  📁 ${project}`));
    log(`     [${bar}] ${pct}% — ${done}/${total} tasks done`);

    if (active > 0) {
      log(cyan(`     ▶ IN PROGRESS (${active}):`));
      for (const t of groups['→']) log(cyan(`       → ${t.description}`));
    }
    if (pending > 0) {
      log(yellow(`     ○ PENDING (${pending}):`));
      for (const t of groups[' ']) log(yellow(`       [ ] ${t.description}`));
    }
    if (blocked > 0) {
      log(red(`     ✗ BLOCKED (${blocked}):`));
      for (const t of groups['✗']) log(red(`       ✗ ${t.description}`));
    }
    if (done > 0) {
      log(green(`     ✓ DONE (${done}):`));
      for (const t of groups['✓']) log(green(`       ✓ ${t.description}`));
    }
  }

  const nextTask = tasksByStatus(' ')[0];
  log('');
  log(bold('───────────────────────────────────────────'));
  if (nextTask) {
    log(bold(`  NEXT UP: ${nextTask.project} → ${nextTask.description}`));
    log(`  Run: node scripts/autonomous-runner.js`);
  } else {
    log(green(bold('  ALL TASKS COMPLETE — nothing pending!')));
  }
  log(bold('═══════════════════════════════════════════'));
  log('');
}

// ─── Task execution ──────────────────────────────────────────────────────────
function executeTask(task) {
  log('');
  log(bold(`▶ Starting: [${task.project}] ${task.description}`));
  log(`  File: ${task.file}`);
  log('');

  if (DRY_RUN) {
    log(yellow('  [DRY RUN] Would spawn agent for this task'));
    return true;
  }

  // Mark in-progress
  setTaskStatus(task, '→');
  appendToDaily(`Started: [${task.project}] ${task.description}`);

  // Build the prompt for the autonomous agent
  const projectDir = path.dirname(task.file);
  const prdFiles = fs.existsSync(projectDir)
    ? fs.readdirSync(projectDir).filter(f => f.startsWith('PRD-')).map(f => path.join(projectDir, f))
    : [];

  let contextNote = `You are autonomously executing a development task as part of the ${task.project} project.\n\n`;
  contextNote += `TASK: ${task.description}\n\n`;

  if (prdFiles.length > 0) {
    contextNote += `PRD context available at: ${prdFiles[prdFiles.length - 1]}\n\n`;
  }

  contextNote += `When done:\n`;
  contextNote += `1. Verify your work is correct\n`;
  contextNote += `2. Update ${task.file} — mark task [✓] done\n`;
  contextNote += `3. Write a 1-sentence summary of what you built to: ${path.join(DAILY_DIR, today() + '.md')}\n`;

  // Write the prompt to a temp file so claude CLI can pick it up
  const promptFile = path.join(ROOT, '.claude-flow', 'data', `task-${Date.now()}.md`);
  const dataDir = path.dirname(promptFile);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(promptFile, contextNote);

  log(`  Prompt written to: ${promptFile}`);
  log(`  Spawning Claude agent...`);

  // Attempt to spawn via claude-flow if available
  try {
    const result = spawnSync(
      'npx',
      ['@claude-flow/cli@latest', 'agent', 'spawn', '-t', 'coder', '--task', task.description, '--project', task.project],
      { encoding: 'utf8', timeout: 5000, cwd: ROOT }
    );
    if (result.stdout) log(result.stdout.trim());
    if (result.stderr && !result.stderr.includes('warn')) log(result.stderr.trim());
  } catch (e) {
    log(yellow(`  claude-flow agent spawn not available — task prompt saved for next Claude session`));
  }

  log('');
  log(green(`  Task queued. When Claude completes it, TASKS.md will be updated automatically.`));
  log(`  Watch progress: node scripts/autonomous-runner.js --status`);

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (STATUS_ONLY) {
    printStatus();
    return;
  }

  printStatus();

  const pending = tasksByStatus(' ');
  const active  = tasksByStatus('→');

  if (active.length > 0) {
    log(yellow(`\n  ${active.length} task(s) already in progress. Waiting for completion.`));
    log(`  In progress: ${active.map(t => t.description).join(', ')}`);
    return;
  }

  if (pending.length === 0) {
    log(green('\n  Nothing to do — all tasks complete!'));
    return;
  }

  if (RUN_ALL) {
    log(bold(`\n  Running ALL ${pending.length} pending tasks...`));
    for (const task of pending) {
      executeTask(task);
    }
  } else {
    log(bold(`\n  Picking up next task (${pending.length} pending)...`));
    executeTask(pending[0]);
  }
}

main();
