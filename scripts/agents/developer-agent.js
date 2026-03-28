#!/usr/bin/env node
/**
 * Developer Agent — autonomous build/fix/test loop
 * Usage: node scripts/agents/developer-agent.js --task "TASK-016" --desc "Build login form" --project delivery-logistics
 * Or:    echo '{"taskId":"TASK-016","desc":"Build login form","projectName":"delivery-logistics"}' | node scripts/agents/developer-agent.js
 */

'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT  = path.resolve(__dirname, '..', '..');
const CLAUDE_CMD    = 'C:\\Users\\maxim\\AppData\\Roaming\\npm\\claude.cmd';
const NOTIFY_SCRIPT = path.join(__dirname, '..', 'notify.js');
const MAX_RETRIES   = 3;
const CLAUDE_TIMEOUT_MS = 600000; // 10 min

// ── Helpers ───────────────────────────────────────────────────────────────────
function notify(msg) {
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "${msg.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_ROOT, timeout: 10000,
    });
  } catch (_) {}
}
function writeDailyNote(entry) {
  const dailyDir = path.join(PROJECT_ROOT, 'memory', 'daily');
  if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(dailyDir, `${today}.md`);
  fs.appendFileSync(file, `\n- ${new Date().toLocaleTimeString()} — ${entry}`);
}
function writeBuildLog(projectName, entry) {
  const logDir = path.join(PROJECT_ROOT, 'memory', 'projects', projectName);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, 'build-log.md');
  const ts = new Date().toISOString();
  fs.appendFileSync(file, `\n## ${ts}\n${entry}\n`);
}
function loadContext(projectName) {
  const ctxFile = path.join(PROJECT_ROOT, 'memory', 'projects', projectName, 'context.md');
  if (fs.existsSync(ctxFile)) return fs.readFileSync(ctxFile, 'utf8').slice(0, 1500);
  return '(no project context file found)';
}

function loadClaudeRules() {
  const claudeMd = path.join(PROJECT_ROOT, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) return '';
  return fs.readFileSync(claudeMd, 'utf8').split('\n').slice(0, 50).join('\n');
}

// ── Claude runner (inline fallback; prefers lib/claude-runner if present)
let runClaude;
try {
  runClaude = require('../lib/claude-runner').run;
} catch (_) {
  runClaude = (prompt, projectDir) => new Promise((resolve) => {
    let out = '', err = '', timedOut = false;
    const child = spawn(CLAUDE_CMD, ['--print', '--dangerously-skip-permissions', '--no-session-persistence'], {
      cwd: projectDir || PROJECT_ROOT,
      env: { ...process.env },
      windowsHide: true,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      resolve({ success: false, output: 'Claude timed out after 10 minutes.' });
    }, CLAUDE_TIMEOUT_MS);

    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      const output = out.trim() || err.trim() || `(exited ${code}, no output)`;
      resolve({ success: code === 0 || out.trim().length > 0, output });
    });

    child.on('error', e => {
      clearTimeout(timer);
      resolve({ success: false, output: `Could not start Claude: ${e.message}` });
    });
  });
}

// ── Prompt builders
function buildInitialPrompt(desc, projectDir, projectContext, claudeRules) {
  return `You are running as an autonomous developer agent.

WORKSPACE RULES (first 50 lines of CLAUDE.md):
${claudeRules}

PROJECT CONTEXT:
${projectContext}

TASK:
${desc}

PROJECT DIRECTORY: ${projectDir}

Instructions:
- Work autonomously. Make actual file changes in the project directory.
- Follow the workspace rules above.
- Read existing code before editing it.
- After completing, output a JSON object as the LAST LINE of your response in this exact format:
{"status":"done","summary":"<2-3 sentence summary>","filesModified":["<path>","..."]}`;
}

function buildRetryPrompt(desc, prevOutput, qaErrors, projectDir) {
  const failureLines = qaErrors.map(e => `- [${e.test}]: ${e.message}`).join('\n');
  return `You previously attempted this task and the tests failed.

ORIGINAL TASK: ${desc}

YOUR PREVIOUS CODE CHANGES: ${prevOutput.slice(0, 800)}

TEST FAILURES:
${failureLines}

Fix ONLY the failing tests. Do not rewrite working code.
The project is in: ${projectDir}
Read CLAUDE.md for rules.
Make the fixes now.
After fixing, output a JSON object as the LAST LINE of your response:
{"status":"done","summary":"<what you fixed>","filesModified":["<path>","..."]}`;
}
function parseClaudeResult(output) {
  const lines = output.trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
  }
  return { summary: output.slice(-300), filesModified: [] };
}
function inferNextAction(desc) {
  return /deploy|ship|launch|release/i.test(desc) ? 'deploy' : 'none';
}

// ── Main
async function main() {
  const start = Date.now();

  // --- Input: CLI args or stdin JSON ---
  let taskId, desc, projectName;
  const args = process.argv.slice(2);

  if (args.includes('--task')) {
    taskId = args[args.indexOf('--task') + 1] || 'TASK-000';
    desc = args[args.indexOf('--desc') + 1] || '';
    projectName = args[args.indexOf('--project') + 1] || '';
  } else {
    const raw = fs.readFileSync('/dev/stdin', 'utf8').trim();
    ({ taskId, desc, projectName } = JSON.parse(raw));
  }

  if (!desc || !projectName) {
    console.error('Error: --desc and --project are required');
    process.exit(1);
  }

  const projectDir = path.join(PROJECT_ROOT, 'projects', projectName);
  const projectContext = loadContext(projectName);
  const claudeRules = loadClaudeRules();

  notify(`Starting task ${taskId}: ${desc.slice(0, 80)}`);
  writeDailyNote(`developer-agent started: ${taskId} — ${desc.slice(0, 80)}`);

  let retries = 0, claudeResult = null, qaResult = null;
  let finalStatus = 'failure', summary = '', filesModified = [];
  const { run: runQA } = require('./qa-agent');

  while (retries <= MAX_RETRIES) {
    const prompt = retries === 0
      ? buildInitialPrompt(desc, projectDir, projectContext, claudeRules)
      : buildRetryPrompt(desc, claudeResult.output, qaResult.errors, projectDir);

    claudeResult = await runClaude(prompt, projectDir);
    if (!claudeResult.success) {
      summary = `Claude invocation failed: ${claudeResult.output.slice(0, 200)}`;
      break;
    }

    const parsed = parseClaudeResult(claudeResult.output);
    summary = parsed.summary || '';
    filesModified = parsed.filesModified || [];
    qaResult = runQA(projectDir);

    if (qaResult.status !== 'FAIL') {
      finalStatus = 'success';
      break;
    }

    retries++;
    if (retries > MAX_RETRIES) {
      summary = `Tests still failing after ${MAX_RETRIES} retries. Last failure: ${qaResult.errors[0]?.message || 'unknown'}`;
      break;
    }
  }

  if (qaResult && (qaResult.status === 'PASS' || qaResult.status === 'NO_TESTS')) finalStatus = 'success';

  const duration_ms = Date.now() - start;
  const nextAction = inferNextAction(desc);

  const result = {
    agent: 'developer-agent',
    taskId,
    status: finalStatus,
    summary,
    filesModified,
    retries,
    nextAction,
    duration_ms,
  };

  const logEntry = `**${taskId}** — ${finalStatus.toUpperCase()}\nDesc: ${desc}\nSummary: ${summary}\nRetries: ${retries}\nDuration: ${duration_ms}ms\nFiles: ${filesModified.join(', ') || 'none'}`;
  writeBuildLog(projectName, logEntry);
  writeDailyNote(`developer-agent ${finalStatus}: ${taskId} — ${summary.slice(0, 100)}`);
  const notifMsg = finalStatus === 'success'
    ? `Task ${taskId} complete. ${summary.slice(0, 200)}`
    : `Task ${taskId} failed after ${retries} retries. ${summary.slice(0, 200)}`;
  notify(notifMsg);

  console.log('--- DEVELOPER RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  process.exit(finalStatus === 'success' ? 0 : 1);
}

main().catch(err => {
  console.error(`developer-agent fatal error: ${err.message}`);
  process.exit(1);
});
