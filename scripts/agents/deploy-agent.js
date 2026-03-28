#!/usr/bin/env node
/**
 * Deploy Agent — GitHub push + Vercel deploy + verify
 * Usage: node scripts/agents/deploy-agent.js --project delivery-logistics --target vercel
 * Or: echo '{"projectName":"delivery-logistics","target":"vercel","description":"Ship v1.0"}' | node scripts/agents/deploy-agent.js
 */

'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, 'memory');
const DEPLOYMENTS_FILE = path.join(MEMORY_DIR, 'areas', 'deployments.md');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');

// ---------------------------------------------------------------------------
// Input parsing — CLI args OR stdin JSON
// ---------------------------------------------------------------------------
async function parseInput() {
  const args = process.argv.slice(2);

  // CLI flag mode: --project NAME --target TARGET --description TEXT
  if (args.length > 0) {
    const get = (flag) => {
      const i = args.indexOf(flag);
      return i !== -1 ? args[i + 1] : undefined;
    };
    return {
      projectName: get('--project') || get('--projectName'),
      target: get('--target') || 'github',
      description: get('--description') || 'Automated deploy',
    };
  }

  // stdin JSON mode
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('No input provided. Use --project flag or pipe JSON via stdin.'));
      return;
    }
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(raw.trim()));
      } catch (e) {
        reject(new Error(`Invalid stdin JSON: ${e.message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------
function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log('Telegram not configured — skipping notification');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text: message });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.on('error', (err) => {
      log(`Telegram error (non-fatal): ${err.message}`);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function log(msg) {
  process.stderr.write(`[deploy-agent] ${msg}\n`);
}

function nowISO() {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Daily note writing
// ---------------------------------------------------------------------------
function writeDailyNote(projectName, status, url, error) {
  ensureDir(DAILY_DIR);
  const file = path.join(DAILY_DIR, `${todayDateStr()}.md`);
  const timestamp = nowISO();
  const entry = status === 'success'
    ? `- ${timestamp} | deploy-agent | ✅ Deployed **${projectName}** → ${url}\n`
    : `- ${timestamp} | deploy-agent | ❌ Deploy failed for **${projectName}**: ${error}\n`;

  if (fs.existsSync(file)) {
    fs.appendFileSync(file, entry);
  } else {
    fs.writeFileSync(file, `# Daily Note — ${todayDateStr()}\n\n## Deploy Log\n${entry}`);
  }
}

// ---------------------------------------------------------------------------
// deployments.md update
// ---------------------------------------------------------------------------
function updateDeploymentsFile(projectName, url, deployId, status) {
  ensureDir(path.dirname(DEPLOYMENTS_FILE));
  const timestamp = nowISO();
  const statusBadge = status === 'success' ? '✅ healthy' : '❌ failed';
  const block = [
    `## ${projectName}`,
    `- **Last deploy**: ${timestamp}`,
    `- **Live URL**: ${url || 'N/A'}`,
    `- **Status**: ${statusBadge}`,
    `- **Deploy ID**: ${deployId || 'N/A'}`,
    '',
  ].join('\n');

  let content = fs.existsSync(DEPLOYMENTS_FILE) ? fs.readFileSync(DEPLOYMENTS_FILE, 'utf8') : '';

  // Replace existing block for this project or append
  const sectionRegex = new RegExp(`## ${projectName}[\\s\\S]*?(?=\\n## |$)`, 'g');
  if (sectionRegex.test(content)) {
    content = content.replace(sectionRegex, block);
  } else {
    content += `\n${block}`;
  }

  fs.writeFileSync(DEPLOYMENTS_FILE, content);
  log(`Updated ${DEPLOYMENTS_FILE}`);
}

// ---------------------------------------------------------------------------
// GitHub deploy
// ---------------------------------------------------------------------------
function deployGitHub(projectDir, description) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log('GitHub not configured — skipping git push');
    return { skipped: true };
  }

  const timestamp = nowISO();
  const commitMsg = `deploy: ${description} ${timestamp}`;
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

  log(`Running git add in ${projectDir}`);
  execSync(`git -C "${projectDir}" add src/ tests/ package.json tsconfig.json`, { env, stdio: 'pipe' });

  log(`Committing: ${commitMsg}`);
  try {
    execSync(`git -C "${projectDir}" commit -m "${commitMsg}"`, { env, stdio: 'pipe' });
  } catch (err) {
    // Nothing to commit is acceptable
    if (err.stdout && err.stdout.toString().includes('nothing to commit')) {
      log('Nothing new to commit — pushing existing HEAD');
    } else {
      throw err;
    }
  }

  log('Pushing to origin main');
  execSync(`git -C "${projectDir}" push origin main`, { env, stdio: 'pipe' });
  log('GitHub push complete');
  return { skipped: false };
}

// ---------------------------------------------------------------------------
// HTTPS helpers for Vercel
// ---------------------------------------------------------------------------
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Vercel deploy
// ---------------------------------------------------------------------------
async function deployVercel(projectName, projectDir) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    log('Vercel not configured — skipping Vercel deploy');
    return { skipped: true };
  }

  log('Initiating Vercel deployment');

  // Read package.json to grab the project name if available
  let vercelProjectName = projectName;
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) vercelProjectName = pkg.name;
    } catch { /* ignore */ }
  }

  const payload = JSON.stringify({ name: vercelProjectName, target: 'production' });

  const createRes = await httpsRequest(
    {
      hostname: 'api.vercel.com',
      path: '/v13/deployments',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload
  );

  if (createRes.status >= 400) {
    throw new Error(`Vercel API error ${createRes.status}: ${JSON.stringify(createRes.body)}`);
  }

  const deployId = createRes.body.id;
  log(`Vercel deploy created: ${deployId}`);

  // Poll status every 10s for up to 5 minutes
  const maxAttempts = 30;
  let attempt = 0;
  let liveUrl = null;

  while (attempt < maxAttempts) {
    await sleep(10000);
    attempt++;

    const statusRes = await httpsRequest(
      {
        hostname: 'api.vercel.com',
        path: `/v13/deployments/${deployId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      null
    );

    const deployState = statusRes.body.status || statusRes.body.readyState;
    log(`Poll ${attempt}/${maxAttempts} — state: ${deployState}`);

    if (deployState === 'READY') {
      liveUrl = `https://${statusRes.body.url}`;
      log(`Deployment ready: ${liveUrl}`);
      break;
    }

    if (deployState === 'ERROR' || deployState === 'CANCELED') {
      throw new Error(`Vercel deployment ${deployState}`);
    }
  }

  if (!liveUrl) {
    throw new Error('Vercel deployment timed out after 5 minutes');
  }

  // Verify URL returns 200
  log(`Verifying live URL: ${liveUrl}`);
  const httpStatus = await httpsGet(liveUrl);
  if (httpStatus !== 200) {
    log(`Warning: live URL returned HTTP ${httpStatus} — deployment may need a moment`);
  } else {
    log('Live URL verified — HTTP 200');
  }

  return { skipped: false, deployId, url: liveUrl };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  let result = { agent: 'deploy-agent', status: 'failure', projectName: '', url: '', duration_ms: 0 };

  try {
    const input = await parseInput();
    const { projectName, target = 'github', description = 'Automated deploy' } = input;

    if (!projectName) throw new Error('projectName is required');

    result.projectName = projectName;
    const projectDir = path.join(WORKSPACE_ROOT, 'projects', projectName);

    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project directory not found: ${projectDir}`);
    }

    log(`Starting deploy for: ${projectName} — target: ${target}`);

    let url = '';
    let deployId = '';
    const targets = target.split(',').map((t) => t.trim().toLowerCase());

    // GitHub step
    if (targets.includes('github')) {
      deployGitHub(projectDir, description);
    }

    // Vercel step
    if (targets.includes('vercel')) {
      const vercelResult = await deployVercel(projectName, projectDir);
      if (!vercelResult.skipped) {
        url = vercelResult.url;
        deployId = vercelResult.deployId;
      }
    }

    // Update memory files
    updateDeploymentsFile(projectName, url, deployId, 'success');
    writeDailyNote(projectName, 'success', url, null);

    // Telegram success
    await sendTelegram(`🚀 Deployed ${projectName} → ${url || '(GitHub only)'}`);

    result.status = 'success';
    result.url = url;
  } catch (err) {
    log(`Deploy failed: ${err.message}`);
    writeDailyNote(result.projectName || 'unknown', 'failure', null, err.message);
    await sendTelegram(`❌ Deploy failed: ${err.message}`);
    result.status = 'failure';
  }

  result.duration_ms = Date.now() - startTime;

  // Structured result as last line to stdout
  process.stdout.write(JSON.stringify(result) + '\n');

  process.exit(result.status === 'success' ? 0 : 1);
}

main();
