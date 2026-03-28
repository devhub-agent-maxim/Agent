#!/usr/bin/env node
/**
 * Shared config loader for the autonomous agent system.
 * Reads from .env in the project root using manual parsing — no dotenv dependency.
 * Falls back to process.env for any var already set in the environment.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

// ── Auto-detect Claude CLI path ─────────────────────────────────────────────
// Searches VS Code extensions, then falls back to PATH.
function findClaudeCli() {
  const home = os.homedir();

  const candidates = [
    // npm global install — most common: npm install -g @anthropic-ai/claude-code
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
    // VS Code extension installs (newest version first)
    ...(() => {
      try {
        const extDir = path.join(home, '.vscode', 'extensions');
        if (!fs.existsSync(extDir)) return [];
        return fs.readdirSync(extDir)
          .filter(d => d.startsWith('anthropic.claude-code-'))
          .sort()
          .reverse()
          .map(d => path.join(extDir, d, 'resources', 'native-binary', 'claude.exe'));
      } catch { return []; }
    })(),
    // Claude desktop app
    path.join(home, 'AppData', 'Roaming', 'Claude', 'claude-code', '2.1.78', 'claude.exe'),
    // Fallback: hope it's on PATH
    'claude',
    'claude.cmd',
  ].filter(Boolean);

  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: 'pipe', timeout: 5000 });
      return cmd;
    } catch {}
  }
  return candidates[0] || 'claude';
}

// Load .env manually — no external dependency required
function loadEnv() {
  const envFile = path.join(PROJECT_DIR, '.env');
  if (!fs.existsSync(envFile)) return;

  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    // Never overwrite a var already present in the environment
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    groupId:  parseInt(process.env.TELEGRAM_GROUP_ID || '0', 10),
  },

  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo:  process.env.GITHUB_REPO  || '',
  },

  vercel: {
    token: process.env.VERCEL_TOKEN  || '',
    orgId: process.env.VERCEL_ORG_ID || '',
  },

  jira: {
    baseUrl:    process.env.JIRA_BASE_URL    || '',
    email:      process.env.JIRA_EMAIL       || '',
    apiToken:   process.env.JIRA_API_TOKEN   || '',
    projectKey: process.env.JIRA_PROJECT_KEY || 'DEV',
  },

  linear: {
    apiKey: process.env.LINEAR_API_KEY || '',
  },

  google: {
    clientId:     process.env.GOOGLE_CLIENT_ID     || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },

  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
  },

  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  },

  claude: {
    cmd:       findClaudeCli(),
    timeoutMs: 600000,
  },

  projectDir: process.env.PROJECT_DIR || PROJECT_DIR,
};

/**
 * Assert that a set of dot-path keys are non-empty in the config.
 * Throws with a descriptive message listing all missing vars.
 *
 * @param {string[]} required - dot-path keys, e.g. ['github.token', 'telegram.botToken']
 * @throws {Error}
 */
function validate(required) {
  const missing = required.filter(key => {
    const parts = key.split('.');
    let val = config;
    for (const part of parts) val = val != null ? val[part] : undefined;
    return !val;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}. ` +
      `Copy .env.example to .env and fill in the values.`
    );
  }
}

module.exports = { config, validate };
