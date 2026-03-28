#!/usr/bin/env node
/**
 * Status Report
 *
 * Generates a developer-friendly status summary of all active projects.
 * Designed to run on SessionStart so you always know where things stand.
 *
 * Usage:
 *   node scripts/status-report.js           — print to terminal
 *   node scripts/status-report.js --json    — output JSON for piping
 *   node scripts/status-report.js --brief   — one-line per project
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MEMORY_DIR = path.join(ROOT, 'memory', 'projects');
const DAILY_DIR  = path.join(ROOT, 'memory', 'daily');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const BRIEF    = args.includes('--brief');

function today() { return new Date().toISOString().slice(0, 10); }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }

// ─── Gather project data ──────────────────────────────────────────────────────
function getProjects() {
  if (!fs.existsSync(MEMORY_DIR)) return [];

  return fs.readdirSync(MEMORY_DIR).map(name => {
    const dir = path.join(MEMORY_DIR, name);
    const tasksFile = path.join(dir, 'TASKS.md');
    const project = { name, tasks: [], prds: [], blocked: [], notes: '' };

    if (fs.existsSync(tasksFile)) {
      const lines = fs.readFileSync(tasksFile, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^[-*]\s+\[(.)\]\s+(.+?)(?:\s+—\s+(.+))?$/);
        if (m) {
          project.tasks.push({ status: m[1], description: m[2].trim(), meta: m[3] || '' });
        }
      }
    }

    // Look for PRDs
    if (fs.existsSync(dir)) {
      project.prds = fs.readdirSync(dir).filter(f => f.startsWith('PRD-'));
    }

    return project;
  }).filter(p => fs.existsSync(path.join(MEMORY_DIR, p.name, 'TASKS.md')));
}

function getDailyNote() {
  const file = path.join(DAILY_DIR, `${today()}.md`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

// ─── JSON output ─────────────────────────────────────────────────────────────
function outputJSON() {
  const projects = getProjects().map(p => {
    const done    = p.tasks.filter(t => t.status === '✓').length;
    const pending = p.tasks.filter(t => t.status === ' ').length;
    const active  = p.tasks.filter(t => t.status === '→').length;
    const blocked = p.tasks.filter(t => t.status === '✗').length;
    return { name: p.name, done, pending, active, blocked, total: p.tasks.length, pct: p.tasks.length > 0 ? Math.round((done / p.tasks.length) * 100) : 0 };
  });
  console.log(JSON.stringify({ date: today(), projects }, null, 2));
}

// ─── Brief output ─────────────────────────────────────────────────────────────
function outputBrief() {
  const projects = getProjects();
  if (projects.length === 0) { console.log('No projects found.'); return; }
  for (const p of projects) {
    const done = p.tasks.filter(t => t.status === '✓').length;
    const total = p.tasks.length;
    const active = p.tasks.find(t => t.status === '→');
    const next = p.tasks.find(t => t.status === ' ');
    const status = active ? `▶ ${active.description}` : next ? `○ next: ${next.description}` : '✓ complete';
    console.log(`${p.name}: ${done}/${total} — ${status}`);
  }
}

// ─── Full output ─────────────────────────────────────────────────────────────
function outputFull() {
  const projects = getProjects();
  const daily = getDailyNote();

  console.log('');
  console.log(bold('╔══════════════════════════════════════════════════╗'));
  console.log(bold('║   DEVELOPMENT STATUS REPORT                      ║'));
  console.log(bold(`║   ${today()}                                    ║`));
  console.log(bold('╚══════════════════════════════════════════════════╝'));

  if (projects.length === 0) {
    console.log(yellow('\n  No projects with TASKS.md found.'));
    console.log(dim('  Create: memory/projects/<name>/TASKS.md'));
    console.log('');
    return;
  }

  let totalDone = 0, totalAll = 0;

  for (const p of projects) {
    const done    = p.tasks.filter(t => t.status === '✓').length;
    const pending = p.tasks.filter(t => t.status === ' ').length;
    const active  = p.tasks.filter(t => t.status === '→');
    const blocked = p.tasks.filter(t => t.status === '✗');
    const total   = p.tasks.length;
    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar     = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    totalDone += done; totalAll += total;

    console.log('');
    console.log(bold(`  📁 ${p.name.toUpperCase()}`));
    console.log(`     Progress: [${bar}] ${pct}% (${done}/${total})`);
    if (p.prds.length > 0) console.log(dim(`     PRDs: ${p.prds.join(', ')}`));

    if (active.length > 0) {
      console.log(cyan(`\n     ▶ IN PROGRESS:`));
      for (const t of active) console.log(cyan(`       → ${t.description}`));
    }

    if (blocked.length > 0) {
      console.log(red(`\n     ⚠ BLOCKED:`));
      for (const t of blocked) console.log(red(`       ✗ ${t.description} ${t.meta ? `(${t.meta})` : ''}`));
    }

    if (pending > 0) {
      const nextTask = p.tasks.find(t => t.status === ' ');
      console.log(yellow(`\n     ○ NEXT UP: ${nextTask.description}`));
      if (pending > 1) console.log(dim(`       (+${pending - 1} more pending)`));
    }

    if (done === total && total > 0) {
      console.log(green(`\n     ✓ ALL DONE!`));
    }
  }

  // Overall summary
  const overallPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
  console.log('');
  console.log(bold('  ──────────────────────────────────────────────'));
  console.log(bold(`  OVERALL: ${totalDone}/${totalAll} tasks (${overallPct}% complete)`));

  // Today's activity from daily note
  if (daily) {
    const logSection = daily.match(/## Autonomous Runner Log\n([\s\S]*?)(?:\n##|$)/);
    if (logSection) {
      const entries = logSection[1].trim().split('\n').filter(Boolean).slice(-3);
      if (entries.length > 0) {
        console.log('');
        console.log(bold('  TODAY\'S ACTIVITY:'));
        for (const e of entries) console.log(dim(`  ${e}`));
      }
    }
  }

  // What to do next
  const allPending = projects.flatMap(p => p.tasks.filter(t => t.status === ' ').map(t => ({ ...t, project: p.name })));
  if (allPending.length > 0) {
    console.log('');
    console.log(bold(`  → RUN NEXT: node scripts/autonomous-runner.js`));
    console.log(dim(`    Will pick up: [${allPending[0].project}] ${allPending[0].description}`));
  } else if (totalAll > 0) {
    console.log(green(bold('\n  🎉 ALL PROJECTS COMPLETE — nothing pending!')));
  }

  console.log(bold('  ══════════════════════════════════════════════'));
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
if (JSON_OUT) outputJSON();
else if (BRIEF) outputBrief();
else outputFull();
