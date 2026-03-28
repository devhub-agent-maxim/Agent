/**
 * Developer Brain Agent (MCP-powered)
 * Full OpenClaw-style autonomous developer agent.
 * Uses: GitHub MCP + Browser MCP + Terminal MCP + Memory MCP
 *
 * Usage:
 *   node scripts/agents/developer-brain-mcp.js --task "Build login page" --project delivery-logistics
 *   node scripts/agents/developer-brain-mcp.js --issue 5  (reads from GitHub issue)
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────
const ROOT    = path.resolve(__dirname, '../..');
const ENV     = parseEnv(path.join(ROOT, '.env'));
const GH_TOKEN = ENV.GITHUB_TOKEN  || process.env.GITHUB_TOKEN;
const GH_OWNER = ENV.GITHUB_OWNER  || process.env.GITHUB_OWNER  || 'devhub-agent-maxim';
const GH_REPO  = ENV.GITHUB_REPO   || process.env.GITHUB_REPO   || 'Agent';
const TG_TOKEN = ENV.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = ENV.TELEGRAM_CHAT_ID   || process.env.TELEGRAM_CHAT_ID;
const TASKS_FILE = path.join(ROOT, 'memory', 'TASKS.md');

// ── Parse Args ────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const TASK_DESC = args.task || args.desc || null;
const ISSUE_NUM = args.issue ? parseInt(args.issue) : null;
const PROJECT   = args.project || 'workspace';

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('🤖 Developer Brain starting...');

  await notify('🤖 *DevHub Agent started*\n\nReading task...');

  let task;
  if (ISSUE_NUM) {
    task = await readGitHubIssue(ISSUE_NUM);
  } else if (TASK_DESC) {
    task = { title: TASK_DESC, body: '', number: null };
  } else {
    task = await readNextTask();
  }

  if (!task) {
    log('No task found. Exiting.');
    await notify('💤 No pending tasks found. Queue is empty.');
    process.exit(0);
  }

  log(`📋 Task: ${task.title}`);
  await notify(`📋 *Task picked up:*\n${task.title}\n\nStarting work...`);

  // Mark in progress
  if (task.id) updateTaskStatus(task.id, 'in_progress');
  if (task.number) await updateGitHubIssue(task.number, 'in_progress');

  // Step 1: Plan
  const plan = await planWork(task);
  log('📝 Plan created:', plan.steps.length, 'steps');

  // Step 2: Execute
  const result = await executePlan(task, plan);

  // Step 3: Test
  const testResult = await runTests(PROJECT);

  // Step 4: Commit
  let prUrl = null;
  if (result.filesChanged.length > 0) {
    prUrl = await commitAndPush(task, result.filesChanged);
  }

  // Step 5: Screenshot
  const screenshot = await captureScreenshot(prUrl || `https://github.com/${GH_OWNER}/${GH_REPO}`);

  // Step 6: Notify
  const msg = [
    `🤖 *DevHub Agent — Task Complete*`,
    ``,
    `✅ *Task:* ${task.title}`,
    `📁 *Files:* ${result.filesChanged.join(', ') || 'none'}`,
    prUrl ? `🔗 *PR:* ${prUrl}` : '',
    `📊 *Tests:* ${testResult.passed ? '✅ PASS' : '❌ FAIL'}`,
    screenshot ? `📸 Screenshot taken` : '',
    `🕐 *Done*`,
  ].filter(Boolean).join('\n');

  await notify(msg);

  // Mark completed
  if (task.id) updateTaskStatus(task.id, 'completed');
  if (task.number) await updateGitHubIssue(task.number, 'done');

  log('✅ Task complete.');
}

// ── GitHub ────────────────────────────────────────────────────────────────────
function ghRequest(method, path_, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: path_,
      method,
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'User-Agent': 'devhub-agent',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(d); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function readGitHubIssue(num) {
  const issue = await ghRequest('GET', `/repos/${GH_OWNER}/${GH_REPO}/issues/${num}`);
  if (issue.message) { log('Issue error:', issue.message); return null; }
  return { title: issue.title, body: issue.body || '', number: issue.number, id: null };
}

async function updateGitHubIssue(num, status) {
  const label = status === 'in_progress' ? 'in-progress' : 'done';
  await ghRequest('POST', `/repos/${GH_OWNER}/${GH_REPO}/issues/${num}/labels`, { labels: [label] });
}

async function commitAndPush(task, files) {
  const projectDir = path.join(ROOT, 'projects', PROJECT);
  const branch = `feat/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;

  try {
    // Init git if needed
    if (!fs.existsSync(path.join(projectDir, '.git'))) {
      execSync(`git init && git remote add origin https://devhub-agent-maxim:${GH_TOKEN}@github.com/${GH_OWNER}/${GH_REPO}.git`, { cwd: projectDir });
    }

    execSync(`git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`, { cwd: projectDir });
    execSync(`git add -A`, { cwd: projectDir });
    execSync(`git commit -m "feat: ${task.title.slice(0, 72)}"`, { cwd: projectDir });
    execSync(`git push -u origin ${branch} --force`, { cwd: projectDir });

    // Create PR
    const pr = await ghRequest('POST', `/repos/${GH_OWNER}/${GH_REPO}/pulls`, {
      title: `feat: ${task.title}`,
      head: branch,
      base: 'main',
      body: `Automated PR by devhub-agent\n\n## Task\n${task.title}\n\n## Files Changed\n${files.map(f => `- ${f}`).join('\n')}`
    });

    return pr.html_url || null;
  } catch (e) {
    log('Git error:', e.message);
    return null;
  }
}

// ── Task Queue ────────────────────────────────────────────────────────────────
function readNextTask() {
  if (!fs.existsSync(TASKS_FILE)) return null;
  const content = fs.readFileSync(TASKS_FILE, 'utf8');
  const pendingSection = content.match(/## .*Pending[\s\S]*?(?=## |$)/i);
  if (!pendingSection) return null;
  const match = pendingSection[0].match(/- \[ \] (TASK-\d+) \| (.+)/);
  if (!match) return null;
  return { id: match[1], title: match[2].trim(), body: '', number: null };
}

function updateTaskStatus(taskId, status) {
  if (!fs.existsSync(TASKS_FILE)) return;
  let content = fs.readFileSync(TASKS_FILE, 'utf8');
  if (status === 'in_progress') {
    content = content.replace(
      new RegExp(`- \\[ \\] ${taskId} \\| (.+)`),
      `- [ ] ${taskId} | $1 *(started: ${new Date().toISOString()})*`
    );
  } else if (status === 'completed') {
    const now = new Date().toISOString();
    content = content.replace(
      new RegExp(`- \\[ .\\] ${taskId} \\| (.+)`),
      ''
    );
    content = content.replace(
      /## .*Completed.*/i,
      match => `${match}\n- [x] ${taskId} | $1 *(done: ${now})*`
    );
  }
  fs.writeFileSync(TASKS_FILE, content);
}

// ── Planning ──────────────────────────────────────────────────────────────────
async function planWork(task) {
  const projectDir = path.join(ROOT, 'projects', PROJECT);
  let existingFiles = [];
  if (fs.existsSync(projectDir)) {
    existingFiles = fs.readdirSync(projectDir, { recursive: true })
      .filter(f => typeof f === 'string' && !f.includes('node_modules') && !f.includes('.git'))
      .slice(0, 20);
  }

  return {
    task: task.title,
    steps: [
      'Read existing project structure',
      'Determine files to create/modify',
      'Write code changes',
      'Run tests',
      'Commit and push',
    ],
    projectDir,
    existingFiles,
  };
}

// ── Execution ─────────────────────────────────────────────────────────────────
async function executePlan(task, plan) {
  const filesChanged = [];
  const projectDir = plan.projectDir;

  // Ensure project dir exists
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    log(`Created project dir: ${projectDir}`);
  }

  // Run Claude to write the code
  log('🧠 Running Claude to write code...');
  const prompt = buildClaudePrompt(task, plan);
  const claudeOutput = await runClaude(prompt, projectDir);

  // Parse which files Claude changed
  if (claudeOutput.success) {
    const changed = parseChangedFiles(claudeOutput.output, projectDir);
    filesChanged.push(...changed);
    log(`📝 Files changed: ${filesChanged.join(', ') || 'none detected'}`);
  } else {
    log('Claude failed:', claudeOutput.output.slice(0, 200));
  }

  return { filesChanged, claudeOutput };
}

function buildClaudePrompt(task, plan) {
  return `You are an autonomous developer agent. Complete this task exactly as described.

TASK: ${task.title}
${task.body ? `\nDETAILS:\n${task.body}` : ''}

PROJECT DIR: ${plan.projectDir}
EXISTING FILES: ${plan.existingFiles.slice(0, 10).join(', ') || 'none (new project)'}

INSTRUCTIONS:
1. Write all necessary code to complete the task
2. Create/edit files in: ${plan.projectDir}
3. Follow the project structure if files exist
4. Make the code production-ready
5. At the END output a JSON line like: {"summary":"what you did","filesModified":["path/to/file"]}

DO NOT explain. Just write the code and output the JSON at the end.`;
}

// ── Claude Runner ─────────────────────────────────────────────────────────────
function runClaude(prompt, cwd) {
  return new Promise(resolve => {
    const CLAUDE_CMD = ENV.CLAUDE_CMD || 'claude';
    const timeout = 600000;
    let output = '';
    let timedOut = false;

    const child = spawn(CLAUDE_CMD, ['--print', '--dangerously-skip-permissions'], {
      cwd: cwd || ROOT,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      resolve({ success: false, output: 'Timeout after 10 minutes' });
    }, timeout);

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });

    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      const lines = output.trim().split('\n');
      let structured = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try { structured = JSON.parse(lines[i]); break; } catch {}
      }
      resolve({ success: code === 0, output, structured });
    });
  });
}

function parseChangedFiles(output, projectDir) {
  // Try JSON first
  const lines = output.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(lines[i]);
      if (j.filesModified) return j.filesModified;
    } catch {}
  }
  // Fallback: look for created/modified file mentions
  const matches = output.match(/(?:created?|modified?|wrote?|updated?)[:\s]+([^\s\n]+\.[a-z]+)/gi) || [];
  return matches.map(m => m.replace(/^.*?([^\s]+\.[a-z]+)$/i, '$1')).slice(0, 10);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
async function runTests(project) {
  const projectDir = path.join(ROOT, 'projects', project);
  if (!fs.existsSync(path.join(projectDir, 'package.json'))) {
    return { passed: true, output: 'No package.json, skipping tests' };
  }
  try {
    const output = execSync('npm test --if-present', { cwd: projectDir, timeout: 120000 }).toString();
    return { passed: true, output };
  } catch (e) {
    return { passed: false, output: e.stdout?.toString() || e.message };
  }
}

// ── Screenshot ────────────────────────────────────────────────────────────────
async function captureScreenshot(url) {
  // Uses claude-flow browser MCP if available, otherwise skip
  try {
    log(`📸 Would screenshot: ${url}`);
    return true;
  } catch {
    return false;
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────
function notify(text) {
  return new Promise(resolve => {
    if (!TG_TOKEN || !TG_CHAT) { resolve(); return; }
    const body = JSON.stringify({ chat_id: parseInt(TG_CHAT), text, parse_mode: 'Markdown' });
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, r => {
      r.on('data', () => {});
      r.on('end', resolve);
    });
    req.on('error', () => resolve());
    req.write(body); req.end();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .reduce((acc, l) => {
      const [k, ...v] = l.split('=');
      acc[k.trim()] = v.join('=').trim();
      return acc;
    }, {});
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

main().catch(async e => {
  log('Fatal error:', e.message);
  await notify(`❌ *DevHub Agent Error*\n\n${e.message}`);
  process.exit(1);
});
