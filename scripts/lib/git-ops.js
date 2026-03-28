#!/usr/bin/env node
/**
 * Git operations — auto-commit, push, diff, log.
 *
 * Used by:
 *   - change-validator.js (after worker completes)
 *   - decider.js (for context: what changed recently)
 *   - agent.js worker completion handler
 *
 * All operations run synchronously (execSync) to keep the flow simple.
 * Never commits .env files, secrets, or node_modules.
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

// Files that should NEVER be committed
const BLOCKED_PATTERNS = [
  '.env', '.env.local', '.env.*',
  '*.pem', '*.key', '*.cert',
  'node_modules/',
  '.claude-flow/data/',
];

function isBlocked(file) {
  const basename = path.basename(file);

  // Block known secrets/sensitive patterns
  if (BLOCKED_PATTERNS.some(p => {
    if (p.endsWith('/')) return file.includes(p);
    if (p.startsWith('*.')) return basename.endsWith(p.slice(1));
    return basename === p || file.endsWith('/' + p);
  })) return true;

  // Block garbage files: no directory separator = root level, and name looks like a bash artifact
  // e.g. "'", "{", "0)", "(i.relevanceScore", etc.
  if (!file.includes('/') && !file.includes('\\')) {
    // Root-level files are OK only if they look like real files
    const isRealFile = /^[\w.-]+$/.test(basename) && basename.length > 1;
    if (!isRealFile) return true;
  }

  // Block files that don't exist on disk (orphaned git status entries)
  try {
    const fullPath = path.join(ROOT, file);
    if (!require('fs').existsSync(fullPath)) return true;
  } catch {}

  return false;
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd:      opts.cwd || ROOT,
      encoding: 'utf8',
      stdio:    'pipe',
      timeout:  30000,
      ...opts,
    }).trim();
  } catch (e) {
    return e.stdout?.trim() || '';
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Returns list of changed/untracked files (excluding blocked patterns).
 * Format: [{ status: 'M'|'A'|'??'|'D', file: 'path/to/file' }]
 */
function getStatus() {
  const raw = run('git status --porcelain');
  if (!raw) return [];
  return raw.split('\n')
    .map(line => {
      const status = line.slice(0, 2).trim();
      const file   = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
      return { status, file };
    })
    .filter(({ file }) => file && !isBlocked(file));
}

/**
 * Returns true if there are uncommitted changes.
 */
function hasChanges() {
  return getStatus().length > 0;
}

// ── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Returns git diff of staged + unstaged changes (max 8000 chars).
 */
function getDiff() {
  const staged   = run('git diff --cached');
  const unstaged = run('git diff');
  const full     = [staged, unstaged].filter(Boolean).join('\n');
  return full.slice(0, 8000);
}

/**
 * Returns recent commit log, one line per commit.
 * @param {number} n - Number of commits
 */
function getRecentLog(n = 5) {
  return run(`git log --oneline -${n}`);
}

/**
 * Returns current branch name.
 */
function getBranch() {
  return run('git rev-parse --abbrev-ref HEAD');
}

// ── Commit & Push ─────────────────────────────────────────────────────────────

/**
 * Stage all eligible changed files and commit with the given message.
 * Returns { success, sha, error }.
 */
function commitAll(message) {
  const changed = getStatus();
  if (changed.length === 0) return { success: false, error: 'No changes to commit' };

  // Stage eligible files only
  for (const { file } of changed) {
    if (!isBlocked(file)) {
      run(`git add "${file}"`);
    }
  }

  // Check if anything was actually staged
  const staged = run('git diff --cached --name-only');
  if (!staged) return { success: false, error: 'Nothing staged after filtering' };

  const result = spawnSync('git', ['commit', '-m', message], {
    cwd:      ROOT,
    encoding: 'utf8',
    stdio:    'pipe',
  });

  if (result.status !== 0) {
    return { success: false, error: result.stderr || result.stdout || 'commit failed' };
  }

  const sha = run('git rev-parse --short HEAD');
  return { success: true, sha, files: staged.split('\n').filter(Boolean) };
}

/**
 * Push current branch to origin.
 * Returns { success, error }.
 */
function push() {
  const branch = getBranch();
  const result = spawnSync('git', ['push', 'origin', branch], {
    cwd:      ROOT,
    encoding: 'utf8',
    stdio:    'pipe',
    timeout:  30000,
  });

  if (result.status !== 0) {
    // Auto-set upstream if push fails due to no upstream
    if (result.stderr?.includes('no upstream')) {
      const r2 = spawnSync('git', ['push', '--set-upstream', 'origin', branch], {
        cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 30000,
      });
      return r2.status === 0
        ? { success: true }
        : { success: false, error: r2.stderr || 'push failed' };
    }
    return { success: false, error: result.stderr || 'push failed' };
  }
  return { success: true };
}

// ── Project context ───────────────────────────────────────────────────────────

/**
 * Returns a compact summary of the repo state for the decider.
 */
function getRepoContext() {
  const status = getStatus();
  const log    = getRecentLog(5);
  const branch = getBranch();

  const projects = fs.existsSync(path.join(ROOT, 'projects'))
    ? fs.readdirSync(path.join(ROOT, 'projects')).filter(d => d !== '_template')
    : [];

  return [
    `Branch: ${branch}`,
    `Recent commits:\n${log || '(none)'}`,
    `Changed files: ${status.length > 0 ? status.map(s => `${s.status} ${s.file}`).join(', ') : '(none)'}`,
    `Projects: ${projects.length > 0 ? projects.join(', ') : '(none yet)'}`,
  ].join('\n');
}

module.exports = {
  getStatus,
  hasChanges,
  getDiff,
  getRecentLog,
  getBranch,
  commitAll,
  push,
  getRepoContext,
};
