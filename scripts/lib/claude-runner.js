#!/usr/bin/env node
/**
 * Shared Claude CLI runner.
 *
 * Spawns the Claude CLI with --print --dangerously-skip-permissions
 * --no-session-persistence, writes the prompt to stdin, and collects
 * stdout + stderr.
 *
 * If the last non-empty line of the output is valid JSON, it is parsed
 * and returned in the `structured` field. This supports agents that end
 * their prompt with "Output your result as a JSON object on the last line".
 *
 * Usage:
 *   const { runClaude } = require('./lib/claude-runner');
 *   const result = await runClaude('Do X and report what you did.', { timeoutMs: 120000 });
 *   // result: { success: boolean, output: string, structured: object|null }
 */

'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const { config } = require('./config');
const usageTracker = require('./usage-tracker');

const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes
const DEFAULT_CWD        = path.resolve(__dirname, '..', '..');
const DEFAULT_CMD        = config.claude.cmd;

// Model tiers
const MODELS = {
  sonnet: 'claude-sonnet-4-5',   // default — fast, cheap, capable
  opus:   'claude-opus-4-6',     // complex reasoning and architecture decisions only
  haiku:  'claude-haiku-4-5-20251001', // routing and trivial transforms
};

/**
 * Try to parse the last non-empty line of `text` as JSON.
 * Handles both raw JSON and JSON inside markdown code fences.
 * Returns the parsed object, or null if it is not valid JSON.
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractStructured(text) {
  if (!text || text.length === 0) return null;

  // First, try to extract JSON from markdown code fence (```json ... ```)
  const codeFenceMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/);
  if (codeFenceMatch) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch {}
  }

  // Second, try to find JSON anywhere in the text (for cases where JSON is not in a code fence)
  const jsonMatch = text.match(/(\{[\s\S]*"action"\s*:\s*"(?:work|wait)"[\s\S]*?\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {}
  }

  // Third, fall back to parsing the last non-empty line
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  if (!last.startsWith('{') && !last.startsWith('[')) return null;
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

/**
 * Run a prompt through the Claude CLI.
 *
 * @param {string} prompt  - The full prompt text to send via stdin.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]  - Max ms to wait (default 600 000).
 * @param {string} [opts.cwd]        - Working directory for Claude (default project root).
 * @param {string} [opts.claudeCmd]  - Path to the claude executable.
 * @param {string} [opts.model]      - Model to use: 'sonnet' | 'opus' | 'haiku' | full model name.
 *                                     Default: 'sonnet' (fast + cost-effective for most tasks).
 *                                     Use 'opus' only for complex reasoning and architecture decisions.
 * @returns {Promise<{ success: boolean, output: string, structured: object|null }>}
 */
function runClaude(prompt, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd       = opts.cwd       ?? DEFAULT_CWD;
  const claudeCmd = opts.claudeCmd ?? DEFAULT_CMD;

  // Resolve model: accept shorthand ('sonnet', 'opus', 'haiku') or full name
  const modelKey   = opts.model ?? 'sonnet';
  const modelName  = MODELS[modelKey] ?? modelKey; // fallback: treat as full model name

  // Track every Claude call — logs to memory/usage-log.jsonl + pings Telegram
  const promptSummary = prompt.replace(/\n/g, ' ').trim().slice(0, 80);
  usageTracker.trackCall(promptSummary, modelKey, prompt.length);

  return new Promise((resolve) => {
    let stdout   = '';
    let stderr   = '';
    let timedOut = false;

    const child = spawn(
      claudeCmd,
      ['--print', '--dangerously-skip-permissions', '--no-session-persistence', '--model', modelName],
      {
        cwd,
        env:         { ...process.env },
        windowsHide: true,
        shell:       true,
        stdio:       ['pipe', 'pipe', 'pipe'],
      }
    );

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      resolve({
        success:    false,
        output:     `Task timed out after ${Math.round(timeoutMs / 60000)} minutes.`,
        structured: null,
      });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      const output     = stdout.trim() || stderr.trim() || `(exited with code ${code}, no output)`;
      const success    = code === 0 || stdout.trim().length > 0;
      const structured = extractStructured(output);

      resolve({ success, output, structured });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success:    false,
        output:     `Could not start Claude: ${err.message}`,
        structured: null,
      });
    });
  });
}

module.exports = { runClaude };
