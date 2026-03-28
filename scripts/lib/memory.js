#!/usr/bin/env node
/**
 * Memory helpers — read/write the three-layer memory system.
 *
 * Layer 1: MEMORY.md      — hard rules + identity (loaded into every worker)
 * Layer 2: daily notes    — timestamped action log, one file per day
 * Layer 3: goals.md       — what the agent is working toward
 *
 * Usage:
 *   const memory = require('./lib/memory');
 *   memory.log('Task started: build auth module');
 *   const ctx = memory.buildSystemContext();
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..', '..');
const DAILY_DIR  = path.join(ROOT, 'memory', 'daily');
const GOALS_FILE = path.join(ROOT, 'memory', 'goals.md');
const TASKS_FILE = path.join(ROOT, 'memory', 'TASKS.md');
const MEMORY_MD  = path.join(ROOT, 'MEMORY.md');

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function todayFile() {
  return path.join(DAILY_DIR, `${today()}.md`);
}

// ── Daily note ────────────────────────────────────────────────────────────────

/**
 * Append a timestamped entry to today's daily note.
 * Creates the file with a header if it does not exist.
 * @param {string} entry
 */
function log(entry) {
  if (!fs.existsSync(DAILY_DIR)) {
    fs.mkdirSync(DAILY_DIR, { recursive: true });
  }

  const file = todayFile();

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# ${today()}\n\n## Log\n`);
  }

  const line = `- ${new Date().toLocaleTimeString()} — ${entry}\n`;
  fs.appendFileSync(file, line);
}

/**
 * Read today's daily note, or empty string if it does not exist.
 * @returns {string}
 */
function readToday() {
  const file = todayFile();
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/**
 * Read a specific day's note.
 * @param {string} date - YYYY-MM-DD
 * @returns {string}
 */
function readDay(date) {
  const file = path.join(DAILY_DIR, `${date}.md`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

// ── Goals ─────────────────────────────────────────────────────────────────────

/**
 * Read memory/goals.md.
 * @returns {string}
 */
function readGoals() {
  return fs.existsSync(GOALS_FILE)
    ? fs.readFileSync(GOALS_FILE, 'utf8')
    : '# Goals\n\n## Active Goals\n*(none)*\n';
}

/**
 * Append a new goal to the Active Goals section.
 * @param {string} description
 * @param {string} [priority='HIGH']
 */
function addGoal(description, priority = 'HIGH') {
  const existing = readGoals();
  const entry = [
    '',
    `### Goal (added ${today()})`,
    `**Priority:** ${priority}`,
    `**Description:** ${description}`,
    `**Done when:** TBD`,
    `**Next action:** TBD`,
    '',
  ].join('\n');

  const updated = existing.replace(
    '## Active Goals\n',
    `## Active Goals\n${entry}`
  );

  fs.writeFileSync(GOALS_FILE, updated);
}

// ── MEMORY.md ─────────────────────────────────────────────────────────────────

/**
 * Read MEMORY.md (hard rules — injected into every worker prompt).
 * @returns {string}
 */
function readMemoryMd() {
  return fs.existsSync(MEMORY_MD) ? fs.readFileSync(MEMORY_MD, 'utf8') : '';
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/**
 * Read memory/TASKS.md.
 * @returns {string}
 */
function readTasks() {
  return fs.existsSync(TASKS_FILE) ? fs.readFileSync(TASKS_FILE, 'utf8') : '';
}

// ── System context builder ────────────────────────────────────────────────────

/**
 * Build the full system context string to prepend to every worker prompt.
 * Includes MEMORY.md hard rules, current goals, and today's log.
 * @returns {string}
 */
function buildSystemContext() {
  const memMd = readMemoryMd();
  const goals = readGoals();
  const daily = readToday();

  return [
    '=== MEMORY.md (Hard Rules — Always Follow) ===',
    memMd,
    '',
    `=== Current Goals (memory/goals.md) ===`,
    goals,
    '',
    `=== Today's Log (memory/daily/${today()}.md) ===`,
    daily || '(no entries yet today)',
    '',
    '=== End of Context ===',
    '',
  ].join('\n');
}

// ── Project context ───────────────────────────────────────────────────────────

/**
 * Read a project's context.md file.
 * @param {string} projectName
 * @returns {string}
 */
function readProjectContext(projectName) {
  const file = path.join(ROOT, 'memory', 'projects', projectName, 'context.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/**
 * Write/update a project's context.md file.
 * @param {string} projectName
 * @param {string} content
 */
function writeProjectContext(projectName, content) {
  const dir = path.join(ROOT, 'memory', 'projects', projectName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'context.md'), content);
}

module.exports = {
  log,
  readToday,
  readDay,
  readGoals,
  addGoal,
  readMemoryMd,
  readTasks,
  buildSystemContext,
  readProjectContext,
  writeProjectContext,
  today,
  DAILY_DIR,
  GOALS_FILE,
  TASKS_FILE,
  MEMORY_MD,
  ROOT,
};
