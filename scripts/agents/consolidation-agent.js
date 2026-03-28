#!/usr/bin/env node
/**
 * Consolidation Agent — nightly 2 AM knowledge base maintenance
 * Phases: daily-cleanup → PARA-maintenance → pattern-extraction → prep-tomorrow
 * Schedule: Daily 2:00 AM via Windows Task Scheduler
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const { spawn, execSync } = require('child_process');

const ROOT          = path.resolve(__dirname, '..', '..');
const { config }    = require('../lib/config');
const NOTIFY_SCRIPT = path.join(__dirname, '..', 'notify.js');
const MEMORY_DIR    = path.join(ROOT, 'memory');
const DAILY_DIR     = path.join(MEMORY_DIR, 'daily');
const ARCHIVE_DIR   = path.join(MEMORY_DIR, 'archives');
const PROJECTS_DIR  = path.join(MEMORY_DIR, 'projects');
const PATTERNS_FILE = path.join(MEMORY_DIR, 'resources', 'patterns', 'error-patterns.md');
const GLOBAL_TASKS  = path.join(MEMORY_DIR, 'TASKS.md');
const CLAUDE_CMD    = config.claude.cmd;
const CLAUDE_TIMEOUT = config.claude.timeoutMs;

const STALE_COMPLETED_DAYS = 7;
const STALLED_HOURS        = 24;

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ── Telegram notification ─────────────────────────────────────────────────────
function notify(message) {
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "${message.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      cwd: ROOT, timeout: 10000,
    });
  } catch (e) {
    log(`Notify failed: ${e.message}`);
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function today()    { return new Date().toISOString().slice(0, 10); }
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── File helpers ──────────────────────────────────────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function appendFile(file, content) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, content);
}

function readFileSafe(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

// ── Parse heartbeat-style TASKS.md (section-based) ───────────────────────────
function parseHeartbeatTasks(content) {
  const pendingM   = content.match(/## [^\n]*Pending\n([\s\S]*?)(?=\n## |$)/);
  const inProgM    = content.match(/## [^\n]*In Progress\n([\s\S]*?)(?=\n## |$)/);
  const completedM = content.match(/## [^\n]*Completed\n([\s\S]*?)(?=\n## |$)/);

  const parseBlock = block => (block ? block[1] : '').split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => ({ raw: l, text: l.replace(/^[-*]\s*\[.\]\s*/, '').trim() }));

  return {
    pending:    parseBlock(pendingM),
    inProgress: parseBlock(inProgM),
    completed:  parseBlock(completedM),
    raw:        content,
  };
}

// ── PHASE 1: Task cleanup ─────────────────────────────────────────────────────
function phase1TaskCleanup() {
  log('Phase 1: Task cleanup');

  const taskFiles = [GLOBAL_TASKS];
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const name of fs.readdirSync(PROJECTS_DIR)) {
      const f = path.join(PROJECTS_DIR, name, 'TASKS.md');
      if (fs.existsSync(f)) taskFiles.push(f);
    }
  }

  let archived = 0, stalled = 0;
  const archiveFile = path.join(ARCHIVE_DIR, 'completed-tasks.md');
  ensureDir(ARCHIVE_DIR);

  for (const file of taskFiles) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    const parsed = parseHeartbeatTasks(content);

    // Archive completed tasks older than STALE_COMPLETED_DAYS
    const cutoff = Date.now() - STALE_COMPLETED_DAYS * 24 * 60 * 60 * 1000;
    const toArchive = parsed.completed.filter(t => {
      const m = t.raw.match(/done:\s*([^)]+)\)/);
      if (!m) return false;
      const ts = new Date(m[1].trim()).getTime();
      return !isNaN(ts) && ts < cutoff;
    });

    if (toArchive.length > 0) {
      appendFile(archiveFile, `\n## Archived from ${file} on ${today()}\n${toArchive.map(t => t.raw.trim()).join('\n')}\n`);
      for (const t of toArchive) content = content.replace(t.raw + '\n', '').replace(t.raw, '');
      fs.writeFileSync(file, content);
      archived += toArchive.length;
      log(`  Archived ${toArchive.length} task(s) from ${path.basename(file)}`);
    }

    // Reset stalled in-progress tasks back to pending
    const stalledCutoff = Date.now() - STALLED_HOURS * 60 * 60 * 1000;
    let updatedContent = fs.readFileSync(file, 'utf8');

    for (const task of parsed.inProgress) {
      const startedMatch = task.raw.match(/started:\s*([^)]+)\)/);
      if (!startedMatch) continue;
      const startTs = new Date(startedMatch[1].trim()).getTime();
      if (isNaN(startTs) || startTs >= stalledCutoff) continue;
      const stalledLine = `- [ ] [STALLED] ${task.text}`;
      // Remove from In Progress, insert into Pending
      updatedContent = updatedContent.replace(task.raw + '\n', '').replace(task.raw, '');
      updatedContent = updatedContent.replace(/(## [^\n]*Pending\n)/, `$1${stalledLine}\n`);
      stalled++;
      log(`  Reset stalled task: ${task.text.slice(0, 60)}`);
    }
    fs.writeFileSync(file, updatedContent);
  }

  // Count pending tasks across all files
  let pendingCount = 0;
  for (const file of taskFiles) {
    const c = readFileSafe(file);
    const m = c.match(/## [^\n]*Pending\n([\s\S]*?)(?=\n## |$)/);
    if (m) pendingCount += (m[1].match(/^\s*-/gm) || []).length;
  }

  log(`  Phase 1 done: ${archived} archived, ${stalled} stalled reset, ~${pendingCount} pending`);
  return { archived, stalled, pendingCount };
}

// ── PHASE 2: Archive completed projects ──────────────────────────────────────
function phase2ArchiveProjects() {
  log('Phase 2: Archive completed projects');
  if (!fs.existsSync(PROJECTS_DIR)) return 0;

  let archivedProjects = 0;
  const yyyyMM = today().slice(0, 7);
  const monthDir = path.join(ARCHIVE_DIR, yyyyMM);

  for (const name of fs.readdirSync(PROJECTS_DIR)) {
    const tasksFile   = path.join(PROJECTS_DIR, name, 'TASKS.md');
    const contextFile = path.join(PROJECTS_DIR, name, 'context.md');
    if (!fs.existsSync(tasksFile)) continue;

    const content = fs.readFileSync(tasksFile, 'utf8');
    const parsed  = parseHeartbeatTasks(content);

    const hasPending   = parsed.pending.length > 0;
    const hasInProgress = parsed.inProgress.length > 0;
    if (hasPending || hasInProgress) continue;
    if (parsed.completed.length === 0) continue;

    // All tasks done — archive the project
    ensureDir(monthDir);
    const archivePath = path.join(monthDir, `${name}-done.md`);
    const summary = `# ${name} — Archived ${today()}\n\n## Completed Tasks\n${parsed.completed.map(t => t.raw).join('\n')}\n`;
    fs.writeFileSync(archivePath, summary);

    // Mark context.md as archived
    if (fs.existsSync(contextFile)) {
      let ctx = fs.readFileSync(contextFile, 'utf8');
      if (!ctx.startsWith('[ARCHIVED]')) {
        fs.writeFileSync(contextFile, `[ARCHIVED] ${today()}\n\n${ctx}`);
      }
    }

    archivedProjects++;
    log(`  Archived project: ${name}`);
  }

  log(`  Phase 2 done: ${archivedProjects} project(s) archived`);
  return archivedProjects;
}

// ── PHASE 3: Pattern extraction via Claude ────────────────────────────────────
async function phase3PatternExtraction() {
  log('Phase 3: Pattern extraction');

  const dailyFile = path.join(DAILY_DIR, `${today()}.md`);
  const dailyContent = readFileSafe(dailyFile);

  // Gather today's build logs
  let buildLogs = '';
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const name of fs.readdirSync(PROJECTS_DIR)) {
      const logFile = path.join(PROJECTS_DIR, name, 'build-log.md');
      if (!fs.existsSync(logFile)) continue;
      const logContent = fs.readFileSync(logFile, 'utf8');
      const todaySection = logContent.match(new RegExp(`## ${today()}[\\s\\S]*?(?=\\n## |$)`));
      if (todaySection) buildLogs += `\n### ${name}\n${todaySection[0]}\n`;
    }
  }

  if (!dailyContent && !buildLogs) {
    log('  No daily note or build logs found — skipping pattern extraction');
    return false;
  }

  const prompt = `You are a knowledge extraction agent. Review today's work log and extract reusable patterns.\n\nDAILY NOTE:\n${dailyContent || '(empty)'}\n\nBUILD LOGS:\n${buildLogs || '(none)'}\n\nExtract any reusable patterns, error solutions, or lessons learned from today's work. Format ONLY as bullet points suitable for appending to memory/resources/patterns/error-patterns.md. Be concise. Prefix each bullet with the date ${today()}. Output nothing else.`;

  return new Promise(resolve => {
    let out = '', timedOut = false;
    const child = spawn(CLAUDE_CMD, ['--print', '--dangerously-skip-permissions', '--no-session-persistence'], {
      cwd: ROOT, env: { ...process.env }, windowsHide: true, shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); resolve(false); }, CLAUDE_TIMEOUT);
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut || !out.trim()) { resolve(false); return; }
      ensureDir(path.dirname(PATTERNS_FILE));
      appendFile(PATTERNS_FILE, `\n\n## ${today()}\n${out.trim()}\n`);
      log(`  Patterns written to error-patterns.md`);
      resolve(true);
    });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// ── PHASE 4: Prep tomorrow's daily note ──────────────────────────────────────
function phase4PrepTomorrow() {
  log('Phase 4: Prep tomorrow');

  const tomorrowDate = tomorrow();
  const tomorrowFile = path.join(DAILY_DIR, `${tomorrowDate}.md`);
  if (fs.existsSync(tomorrowFile)) {
    log('  Tomorrow note already exists — skipping');
    return;
  }

  // Gather top 3 pending tasks from global TASKS.md
  const globalContent = readFileSafe(GLOBAL_TASKS);
  const pendingM = globalContent.match(/## [^\n]*Pending\n([\s\S]*?)(?=\n## |$)/);
  const topTasks = pendingM
    ? (pendingM[1].match(/^\s*-.+/gm) || []).slice(0, 3).map(l => l.trim()).join('\n')
    : '(no pending tasks)';

  const note = `# ${tomorrowDate}\n\n## Today's Focus\n${topTasks}\n\n## Meetings\n(To be filled by calendar-agent at 8 AM)\n\n## Log\n`;
  ensureDir(DAILY_DIR);
  fs.writeFileSync(tomorrowFile, note);
  log(`  Tomorrow's note created: ${tomorrowFile}`);

  // Write summary to today's note
  const todayFile = path.join(DAILY_DIR, `${today()}.md`);
  appendFile(todayFile, `\n- ${new Date().toLocaleTimeString()} — Nightly consolidation complete. Tomorrow's note prepared.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('Consolidation agent starting...');

  const p1 = phase1TaskCleanup();
  const p2 = phase2ArchiveProjects();
  const p3 = await phase3PatternExtraction();
  phase4PrepTomorrow();

  // Count active projects
  let activeProjects = 0;
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const name of fs.readdirSync(PROJECTS_DIR)) {
      const ctxFile = path.join(PROJECTS_DIR, name, 'context.md');
      if (!fs.existsSync(ctxFile)) continue;
      const ctx = fs.readFileSync(ctxFile, 'utf8');
      if (!ctx.startsWith('[ARCHIVED]')) activeProjects++;
    }
  }

  // Phase 5: Report
  const report = [
    'Nightly consolidation complete',
    `${p1.archived} tasks archived`,
    `${p1.stalled} stalled tasks reset to pending`,
    `${activeProjects} projects active`,
    `Patterns extracted: ${p3 ? 'yes' : 'no'}`,
    'Tomorrow prepared',
  ].join('\n- ');

  notify(`Nightly consolidation complete\n- ${p1.archived} tasks archived\n- ${p1.stalled} stalled tasks reset to pending\n- ${activeProjects} projects active\n- Patterns extracted: ${p3 ? 'yes' : 'no'}\n- Tomorrow prepared`);

  log('Consolidation agent complete.');
  log(report);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "Consolidation agent error: ${err.message.replace(/"/g, '')}"`, {
      cwd: ROOT, timeout: 10000,
    });
  } catch (_) {}
  process.exit(1);
});
