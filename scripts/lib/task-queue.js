#!/usr/bin/env node
/**
 * Shared task queue parser and writer.
 * Single source of truth for reading/writing memory/TASKS.md.
 *
 * Handles both legacy format:
 *   - [ ] TASK-001 | description
 * and tagged format:
 *   - [ ] TASK-016 | [dev] description
 *
 * Supported tags: [dev] [deploy] [qa] [monitor] [jira] [calendar]
 * No tag defaults to [dev].
 *
 * Jira/Linear IDs (e.g. JIRA-123, LINEAR-456) are extracted from the description.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const EMPTY_QUEUE =
  '# Task Queue\n\n' +
  '## \uD83D\uDD04 In Progress\n\n' +
  '## \uD83D\uDCCB Pending\n\n' +
  '## \u2705 Completed\n';

// Regex anchors for the three sections
const SECTION_IN_PROGRESS = /## 🔄 In Progress\n/;
const SECTION_PENDING      = /## 📋 Pending\n/;
const SECTION_COMPLETED    = /## ✅ Completed\n/;

const VALID_TAGS = ['dev', 'deploy', 'qa', 'monitor', 'jira', 'calendar'];

/**
 * Extract structured fields from a raw task line.
 * @param {string} line
 * @returns {{ id: string, desc: string, raw: string, tag: string, projectName: string|null, jiraId: string|null }|null}
 */
function parseLine(line) {
  // Must be a checkbox item
  if (!line.match(/^\s*-\s*\[\s*[x ]?\s*\]/)) return null;

  // Extract TASK-NNN and the description that follows
  const m = line.match(/TASK-(\d+)\s*\|\s*(.+)/);
  if (!m) return null;

  const id       = `TASK-${m[1]}`;
  const rawDesc  = m[2].trim();

  // Strip trailing metadata like *(started: ...)* or *(done: ...)*
  const cleanDesc = rawDesc.replace(/\s*\*\((started|done|blocked):[^)]*\)\*\s*$/, '').trim();

  // Detect tag prefix [tag]
  const tagMatch = cleanDesc.match(/^\[([^\]]+)\]\s*/);
  let tag  = 'dev';
  let desc = cleanDesc;

  if (tagMatch && VALID_TAGS.includes(tagMatch[1].toLowerCase())) {
    tag  = tagMatch[1].toLowerCase();
    desc = cleanDesc.slice(tagMatch[0].length).trim();
  }

  // Extract Jira/Linear ID from description
  const jiraMatch = desc.match(/\b(JIRA-\d+|LINEAR-\d+)\b/i);
  const jiraId    = jiraMatch ? jiraMatch[1].toUpperCase() : null;

  // Extract project name: first word in UPPER_CASE or CamelCase before a colon
  const projMatch = desc.match(/^([A-Z][A-Za-z0-9_-]+):/);
  const projectName = projMatch ? projMatch[1] : null;

  return { id, desc, raw: line, tag, projectName, jiraId };
}

/**
 * Parse TASKS.md and return categorised task lists.
 * Creates the file with default content if it does not exist.
 *
 * @param {string} tasksFile - Absolute path to TASKS.md
 * @returns {{ inProgress: object[], pending: object[], completed: object[] }}
 */
function parseTasks(tasksFile) {
  if (!fs.existsSync(tasksFile)) {
    fs.mkdirSync(path.dirname(tasksFile), { recursive: true });
    fs.writeFileSync(tasksFile, EMPTY_QUEUE);
    return { inProgress: [], pending: [], completed: [] };
  }

  const content = fs.readFileSync(tasksFile, 'utf8');

  const extractSection = (regex) => {
    const m = content.match(new RegExp(regex.source + '([\\s\\S]*?)(?=\\n## |$)'));
    if (!m) return [];
    return m[1].split('\n').map(parseLine).filter(Boolean);
  };

  return {
    inProgress: extractSection(SECTION_IN_PROGRESS),
    pending:    extractSection(SECTION_PENDING),
    completed:  extractSection(SECTION_COMPLETED),
  };
}

/**
 * Compute the next sequential TASK-NNN id from existing file content.
 * @param {string} content
 * @returns {string}
 */
function nextTaskId(content) {
  const ids  = content.match(/TASK-(\d+)/g) || [];
  const max  = ids.reduce((m, id) => {
    const n = parseInt(id.replace('TASK-', ''), 10);
    return n > m ? n : m;
  }, 0);
  return `TASK-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Add a new task to the Pending section.
 * Creates the file if it does not exist.
 *
 * @param {string} tasksFile
 * @param {string} description - Plain description. May include a [tag] prefix.
 * @param {string} [tag]       - Optional explicit tag; ignored if description already has one.
 * @returns {string} The new task id, e.g. "TASK-017"
 */
function addTask(tasksFile, description, tag) {
  let content = fs.existsSync(tasksFile)
    ? fs.readFileSync(tasksFile, 'utf8')
    : EMPTY_QUEUE;

  const id = nextTaskId(content);

  // Build the line, prepending a tag if supplied and not already embedded
  let lineDesc = description.trim();
  if (tag && VALID_TAGS.includes(tag) && !lineDesc.match(/^\[[^\]]+\]/)) {
    lineDesc = `[${tag}] ${lineDesc}`;
  }

  const newLine = `- [ ] ${id} | ${lineDesc}`;
  content = content.replace('## 📋 Pending\n', `## 📋 Pending\n${newLine}\n`);
  fs.writeFileSync(tasksFile, content);
  return id;
}

/**
 * Move a task from Pending to In Progress.
 * @param {string} tasksFile
 * @param {{ id: string, desc: string, raw: string }} task
 */
function markInProgress(tasksFile, task) {
  let content   = fs.readFileSync(tasksFile, 'utf8');
  const ts      = new Date().toLocaleString();
  const newLine = `- [ ] ${task.id} | ${task.desc} *(started: ${ts})*`;

  // Remove from wherever it currently sits
  content = content.split('\n').filter(l => !l.includes(task.id)).join('\n');
  content = content.replace('## 🔄 In Progress\n', `## 🔄 In Progress\n${newLine}\n`);
  fs.writeFileSync(tasksFile, content);
}

/**
 * Move a task from In Progress to Completed.
 * @param {string} tasksFile
 * @param {{ id: string, desc: string }} task
 */
function markCompleted(tasksFile, task) {
  let content   = fs.readFileSync(tasksFile, 'utf8');
  const ts      = new Date().toLocaleString();
  const doneTag = task.desc.match(/^\[[^\]]+\]/) ? task.desc : task.desc;

  // Remove all lines mentioning this task id
  content = content.split('\n').filter(l => !l.includes(task.id)).join('\n');

  const completedLine = `- [x] ${task.id} | ${doneTag} *(done: ${ts})*`;
  content = content.replace('## ✅ Completed\n', `## ✅ Completed\n${completedLine}\n`);
  fs.writeFileSync(tasksFile, content);
}

/**
 * Mark a task as blocked, annotating it in place with the reason.
 * Leaves the task in whatever section it is currently in (usually In Progress).
 * @param {string} tasksFile
 * @param {{ id: string, raw: string, desc: string }} task
 * @param {string} reason
 */
function markBlocked(tasksFile, task, reason) {
  let content = fs.readFileSync(tasksFile, 'utf8');
  const ts    = new Date().toLocaleString();
  const tag   = `*(blocked: ${reason} — ${ts})*`;

  // Replace the raw line with an annotated version
  const updated = `- [ ] ${task.id} | ${task.desc} ${tag}`;
  if (content.includes(task.raw)) {
    content = content.replace(task.raw, updated);
  } else {
    // Fall back to id-based replacement
    content = content.split('\n').map(l =>
      l.includes(task.id) && l.match(/^\s*-\s*\[/) ? updated : l
    ).join('\n');
  }

  fs.writeFileSync(tasksFile, content);
}

/**
 * Return the first pending task, or null if the queue is empty.
 * @param {string} tasksFile
 * @returns {object|null}
 */
function getNextPending(tasksFile) {
  const { pending } = parseTasks(tasksFile);
  return pending.length > 0 ? pending[0] : null;
}

module.exports = {
  parseTasks,
  addTask,
  markInProgress,
  markCompleted,
  markBlocked,
  getNextPending,
};
