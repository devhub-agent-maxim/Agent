#!/usr/bin/env node
/**
 * Per-project Telegram thread routing.
 *
 * Maps project names → Telegram message_thread_id so each project gets
 * its own topic in the Dev Projects Hub group.
 *
 * Config is read from:
 *   1. memory/project-threads.json  (authoritative, human-editable)
 *   2. TELEGRAM_PROJECT_THREADS env var  (JSON string, overrides file)
 *
 * Schema (project-threads.json):
 * {
 *   "agent-tools":    12,
 *   "agent-dashboard": 18,
 *   "my-new-project": 25
 * }
 *
 * To add a new project thread:
 *   1. Create a topic in the Telegram group
 *   2. Send a test message to that topic
 *   3. Run: node scripts/get-thread-ids.js
 *   4. Add the returned thread_id to memory/project-threads.json
 *
 * If a project has no entry, messages fall back to the main group (no thread).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..', '..');
const MAP_FILE   = path.join(ROOT, 'memory', 'project-threads.json');

// ── Load the map ──────────────────────────────────────────────────────────────

let _map = null;

function loadMap() {
  if (_map) return _map;

  // 1. Try env var first (easy override for CI/prod)
  if (process.env.TELEGRAM_PROJECT_THREADS) {
    try {
      _map = JSON.parse(process.env.TELEGRAM_PROJECT_THREADS);
      return _map;
    } catch (_) {}
  }

  // 2. Try the JSON file
  if (fs.existsSync(MAP_FILE)) {
    try {
      _map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
      return _map;
    } catch (_) {}
  }

  _map = {};
  return _map;
}

/** Force re-read of the map (call after saving to project-threads.json) */
function reloadMap() {
  _map = null;
  return loadMap();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the Telegram thread ID for a project name.
 * Returns null if not configured (falls back to main group).
 *
 * @param {string} projectName
 * @returns {number|null}
 */
function getThreadId(projectName) {
  if (!projectName) return null;
  const map = loadMap();
  // Try exact name, then lowercase, then with dashes replaced by spaces
  return map[projectName]
    || map[projectName.toLowerCase()]
    || map[projectName.toLowerCase().replace(/\s+/g, '-')]
    || null;
}

/**
 * Register a project → thread mapping and persist to file.
 *
 * @param {string} projectName
 * @param {number} threadId
 */
function registerThread(projectName, threadId) {
  const map = loadMap();
  map[projectName] = threadId;
  try {
    fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
    fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2) + '\n');
    _map = map;
    return true;
  } catch (err) {
    console.error(`[project-threads] Failed to save: ${err.message}`);
    return false;
  }
}

/**
 * List all registered project → thread mappings.
 * @returns {Object}
 */
function listAll() {
  return { ...loadMap() };
}

module.exports = { getThreadId, registerThread, listAll, reloadMap };
