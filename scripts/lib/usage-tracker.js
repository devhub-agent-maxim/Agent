#!/usr/bin/env node
/**
 * Usage Tracker — logs every Claude CLI call and pings Telegram.
 *
 * Called from claude-runner.js BEFORE spawning the Claude process.
 *
 * Outputs:
 *   1. Append line to memory/usage-log.jsonl
 *   2. Send a short Telegram message (fire-and-forget, never blocks)
 *
 * Telegram format:
 *   ⚡ Claude call: [prompt summary] • sonnet • ~1200 chars
 *
 * The module is standalone — no dependency on agent.js to avoid circular refs.
 * It reads BOT_TOKEN / GROUP_ID from env directly.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT     = path.resolve(__dirname, '..', '..');
const LOG_FILE = path.join(ROOT, 'memory', 'usage-log.jsonl');

// Keep a running session total so Telegram messages show cumulative count
let sessionCalls = 0;
let sessionChars = 0;

// Rate-limit Telegram to 1 message per 15 seconds max to avoid spam
let lastTgSent = 0;
const TG_MIN_GAP_MS = 15_000;

// ── Telegram (fire-and-forget) ────────────────────────────────────────────────

function sendTg(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId  = process.env.TELEGRAM_GROUP_ID;
  const threadId = process.env.TELEGRAM_USAGE_THREAD_ID || null;

  if (!botToken || !groupId) return; // silently skip if not configured

  const now = Date.now();
  if (now - lastTgSent < TG_MIN_GAP_MS) return; // rate-limit
  lastTgSent = now;

  const params = {
    chat_id:    groupId,
    text,
    parse_mode: 'Markdown',
  };
  if (threadId) params.message_thread_id = parseInt(threadId, 10);

  const body = JSON.stringify(params);
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`;

  // Use Node's built-in https — no npm deps
  try {
    const https = require('https');
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path:     urlObj.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => { res.resume(); } // drain + discard
    );
    req.on('error', () => {}); // never throw
    req.write(body);
    req.end();
  } catch (_) { /* never throw */ }
}

// ── Log to file ───────────────────────────────────────────────────────────────

function appendLog(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (_) { /* never throw */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Track a Claude call. Call this BEFORE spawning the Claude process.
 *
 * @param {string} promptSummary - Short description of what is being asked (first 80 chars of prompt is fine)
 * @param {string} model         - Model shortname: 'sonnet' | 'opus' | 'haiku'
 * @param {number} promptChars   - Length of the full prompt in characters
 */
function trackCall(promptSummary, model, promptChars) {
  sessionCalls++;
  sessionChars += promptChars || 0;

  const entry = {
    ts:      new Date().toISOString(),
    call:    sessionCalls,
    model,
    chars:   promptChars,
    summary: promptSummary,
  };

  appendLog(entry);

  // Build Telegram message
  const summary = (promptSummary || '').slice(0, 80).replace(/\n/g, ' ').trim();
  const kchars  = promptChars > 0 ? `~${Math.round(promptChars / 100) / 10}k chars` : '';
  const session = `session: ${sessionCalls} calls / ${Math.round(sessionChars / 1000)}k chars`;

  const text = `⚡ *Claude call #${sessionCalls}*\n\`${summary}\`\n_${model} • ${kchars} • ${session}_`;

  sendTg(text);
}

/**
 * Get current session stats.
 * @returns {{ calls: number, chars: number }}
 */
function getSessionStats() {
  return { calls: sessionCalls, chars: sessionChars };
}

/**
 * Read the last N log entries from the JSONL file.
 * @param {number} [n=20]
 * @returns {Array}
 */
function getRecentCalls(n = 20) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => JSON.parse(l));
  } catch (_) {
    return [];
  }
}

module.exports = { trackCall, getSessionStats, getRecentCalls };
