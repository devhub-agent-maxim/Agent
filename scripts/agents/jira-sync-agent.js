#!/usr/bin/env node
/**
 * Jira/Linear Sync Agent — two-way task sync
 * Supports: Jira Cloud (REST v3) and Linear (GraphQL)
 * Schedule: Every 2 hours via Windows Task Scheduler
 *
 * Environment variables:
 *   LINEAR_API_KEY   — Linear personal API key (takes priority over Jira)
 *   JIRA_BASE_URL    — e.g. https://yourorg.atlassian.net
 *   JIRA_USER_EMAIL  — Atlassian account email
 *   JIRA_API_TOKEN   — Atlassian API token
 *   JIRA_PROJECT_KEY — e.g. DEV
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — optional notifications
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const MEMORY_DIR = path.join(WORKSPACE_ROOT, 'memory');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const GLOBAL_TASKS_FILE = path.join(MEMORY_DIR, 'TASKS.md');

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function log(msg) {
  process.stderr.write(`[jira-sync-agent] ${msg}\n`);
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
// HTTPS helpers
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

// ---------------------------------------------------------------------------
// Telegram notification
// ---------------------------------------------------------------------------
function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return Promise.resolve();

  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text: message });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Daily note append
// ---------------------------------------------------------------------------
function appendDailyNote(entry) {
  ensureDir(DAILY_DIR);
  const file = path.join(DAILY_DIR, `${todayDateStr()}.md`);
  const line = `- ${nowISO()} | jira-sync-agent | ${entry}\n`;
  if (fs.existsSync(file)) {
    fs.appendFileSync(file, line);
  } else {
    fs.writeFileSync(file, `# Daily Note — ${todayDateStr()}\n\n## Jira Sync Log\n${line}`);
  }
}

// ---------------------------------------------------------------------------
// TASKS.md helpers
// ---------------------------------------------------------------------------
function readAllTasksFiles() {
  const files = [];
  // Global memory tasks
  if (fs.existsSync(GLOBAL_TASKS_FILE)) files.push(GLOBAL_TASKS_FILE);
  // Per-project tasks
  const projectsDir = path.join(WORKSPACE_ROOT, 'projects');
  if (fs.existsSync(projectsDir)) {
    for (const project of fs.readdirSync(projectsDir)) {
      const taskFile = path.join(projectsDir, project, 'TASKS.md');
      if (fs.existsSync(taskFile)) files.push(taskFile);
    }
  }
  // Per-project memory tasks
  const memProjectsDir = path.join(MEMORY_DIR, 'projects');
  if (fs.existsSync(memProjectsDir)) {
    for (const project of fs.readdirSync(memProjectsDir)) {
      const taskFile = path.join(memProjectsDir, project, 'TASKS.md');
      if (fs.existsSync(taskFile)) files.push(taskFile);
    }
  }
  return files;
}

function isIssueAlreadyInTasks(issueId) {
  for (const file of readAllTasksFiles()) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(issueId)) return true;
  }
  return false;
}

function appendTaskToFile(taskLine) {
  ensureDir(path.dirname(GLOBAL_TASKS_FILE));
  if (!fs.existsSync(GLOBAL_TASKS_FILE)) {
    fs.writeFileSync(
      GLOBAL_TASKS_FILE,
      '# Tasks\n\n## 📋 Todo\n\n## 🔄 In Progress\n\n## ✅ Completed\n'
    );
  }
  const content = fs.readFileSync(GLOBAL_TASKS_FILE, 'utf8');
  // Insert after the ## 📋 Todo heading
  const updated = content.replace(/(## 📋 Todo\n)/, `$1${taskLine}\n`);
  fs.writeFileSync(GLOBAL_TASKS_FILE, updated);
}

/**
 * Return array of { issueId, taskLine } from completed sections in all TASKS.md files.
 * Matches both [JIRA-XXX] and [LIN-XXX] style IDs.
 */
function getCompletedTaskIds() {
  const results = [];
  const idPattern = /\[((?:JIRA|LIN|[A-Z]+-)\d+)\]/g;

  for (const file of readAllTasksFiles()) {
    const content = fs.readFileSync(file, 'utf8');
    const completedMatch = content.match(/## ✅ Completed([\s\S]*?)(?=\n## |$)/);
    if (!completedMatch) continue;

    const completedSection = completedMatch[1];
    const lines = completedSection.split('\n').filter((l) => l.trim().startsWith('- [x]'));
    for (const line of lines) {
      let match;
      while ((match = idPattern.exec(line)) !== null) {
        results.push({ issueId: match[1], taskLine: line });
      }
      idPattern.lastIndex = 0;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Jira functions
// ---------------------------------------------------------------------------
function jiraAuthHeader() {
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

async function jiraPullNewIssues(baseUrl, projectKey) {
  const jql = encodeURIComponent(
    `project=${projectKey} AND status=Todo AND assignee=currentUser() ORDER BY created DESC`
  );
  const urlPath = `/rest/api/3/search?jql=${jql}&maxResults=10`;
  const url = new URL(baseUrl + urlPath);

  const res = await httpsRequest(
    {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: jiraAuthHeader(),
        Accept: 'application/json',
      },
    },
    null
  );

  if (res.status !== 200) {
    throw new Error(`Jira search failed: HTTP ${res.status} — ${JSON.stringify(res.body)}`);
  }

  const issues = (res.body.issues || []);
  let pulled = 0;

  for (const issue of issues) {
    const id = issue.key;
    if (isIssueAlreadyInTasks(id)) continue;

    const title = issue.fields.summary;
    const taskLine = `- [ ] TASK-${id} | [dev] [${id}] ${title}`;
    appendTaskToFile(taskLine);
    log(`Added new Jira issue: ${id} — ${title}`);
    pulled++;
  }

  return pulled;
}

async function jiraGetTransitionId(baseUrl, issueKey, statusName) {
  const url = new URL(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`);
  const res = await httpsRequest(
    {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { Authorization: jiraAuthHeader(), Accept: 'application/json' },
    },
    null
  );
  if (res.status !== 200) return null;
  const transitions = res.body.transitions || [];
  const match = transitions.find(
    (t) => t.name.toLowerCase() === statusName.toLowerCase() || t.to?.name?.toLowerCase() === statusName.toLowerCase()
  );
  return match ? match.id : null;
}

async function jiraPushCompleted(baseUrl) {
  const completed = getCompletedTaskIds().filter((t) => /^[A-Z]+-\d+$/.test(t.issueId) && !t.issueId.startsWith('LIN-'));
  let pushed = 0;

  for (const { issueId } of completed) {
    const transitionId = await jiraGetTransitionId(baseUrl, issueId, 'Done');
    if (!transitionId) {
      log(`No 'Done' transition found for ${issueId} — skipping`);
      continue;
    }

    const payload = JSON.stringify({ transition: { id: transitionId } });
    const url = new URL(`${baseUrl}/rest/api/3/issue/${issueId}/transitions`);

    const res = await httpsRequest(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          Authorization: jiraAuthHeader(),
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      payload
    );

    if (res.status === 204 || res.status === 200) {
      log(`Marked ${issueId} as Done in Jira`);
      pushed++;
    } else {
      log(`Failed to update ${issueId}: HTTP ${res.status}`);
    }
  }

  return pushed;
}

// ---------------------------------------------------------------------------
// Linear functions
// ---------------------------------------------------------------------------
async function linearGraphQL(query, variables) {
  const apiKey = process.env.LINEAR_API_KEY;
  const payload = JSON.stringify({ query, variables });

  const res = await httpsRequest(
    {
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload
  );

  if (res.status !== 200) {
    throw new Error(`Linear GraphQL error: HTTP ${res.status}`);
  }
  if (res.body.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(res.body.errors)}`);
  }
  return res.body.data;
}

async function linearPullNewIssues() {
  const query = `
    query {
      issues(filter: { state: { name: { eq: "Todo" } } }, first: 10) {
        nodes {
          id
          identifier
          title
          description
        }
      }
    }
  `;

  const data = await linearGraphQL(query, {});
  const issues = data?.issues?.nodes || [];
  let pulled = 0;

  for (const issue of issues) {
    const id = issue.identifier;
    if (isIssueAlreadyInTasks(id)) continue;

    const taskLine = `- [ ] TASK-${id} | [dev] [${id}] ${issue.title}`;
    appendTaskToFile(taskLine);
    log(`Added new Linear issue: ${id} — ${issue.title}`);
    pulled++;
  }

  return pulled;
}

async function linearGetDoneStateId() {
  const query = `
    query {
      workflowStates(filter: { name: { eq: "Done" } }) {
        nodes { id name }
      }
    }
  `;
  const data = await linearGraphQL(query, {});
  return data?.workflowStates?.nodes?.[0]?.id || null;
}

async function linearGetIssueNodeId(identifier) {
  const query = `
    query($identifier: String!) {
      issue(id: $identifier) {
        id
      }
    }
  `;
  try {
    const data = await linearGraphQL(query, { identifier });
    return data?.issue?.id || null;
  } catch {
    return null;
  }
}

async function linearPushCompleted() {
  const completed = getCompletedTaskIds().filter((t) => t.issueId.match(/^[A-Z]+-\d+$/));
  if (completed.length === 0) return 0;

  const doneStateId = await linearGetDoneStateId();
  if (!doneStateId) {
    log('Could not find Linear "Done" state — skipping push');
    return 0;
  }

  let pushed = 0;
  for (const { issueId } of completed) {
    const nodeId = await linearGetIssueNodeId(issueId);
    if (!nodeId) {
      log(`Could not resolve Linear node ID for ${issueId} — skipping`);
      continue;
    }

    const mutation = `
      mutation($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
        }
      }
    `;
    try {
      const data = await linearGraphQL(mutation, { id: nodeId, stateId: doneStateId });
      if (data?.issueUpdate?.success) {
        log(`Marked ${issueId} as Done in Linear`);
        pushed++;
      }
    } catch (err) {
      log(`Failed to update Linear issue ${issueId}: ${err.message}`);
    }
  }

  return pushed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const linearKey = process.env.LINEAR_API_KEY;
  const jiraBaseUrl = process.env.JIRA_BASE_URL;
  const jiraProjectKey = process.env.JIRA_PROJECT_KEY || 'DEV';

  if (!linearKey && !jiraBaseUrl) {
    log('No tracker configured — set LINEAR_API_KEY or JIRA_BASE_URL to enable sync');
    log('LINEAR_API_KEY:  Linear personal API key from https://linear.app/settings/api');
    log('JIRA_BASE_URL:   e.g. https://yourorg.atlassian.net');
    log('JIRA_USER_EMAIL: your Atlassian account email');
    log('JIRA_API_TOKEN:  from https://id.atlassian.com/manage-profile/security/api-tokens');
    log('JIRA_PROJECT_KEY: e.g. DEV');
    process.exit(0);
  }

  let pulled = 0;
  let pushed = 0;
  let tracker = '';

  try {
    if (linearKey) {
      tracker = 'Linear';
      log('Using Linear as task tracker');
      pulled = await linearPullNewIssues();
      pushed = await linearPushCompleted();
    } else {
      tracker = 'Jira';
      log(`Using Jira as task tracker — project: ${jiraProjectKey}`);
      pulled = await jiraPullNewIssues(jiraBaseUrl, jiraProjectKey);
      pushed = await jiraPushCompleted(jiraBaseUrl);
    }

    const summary = `${tracker} sync: pulled ${pulled} new, pushed ${pushed} completed`;
    log(summary);
    appendDailyNote(`✅ ${summary}`);
    await sendTelegram(`🔄 ${summary}`);

    process.stdout.write(
      JSON.stringify({ agent: 'jira-sync-agent', status: 'success', tracker, pulled, pushed }) + '\n'
    );
    process.exit(0);
  } catch (err) {
    log(`Sync failed: ${err.message}`);
    appendDailyNote(`❌ ${tracker} sync failed: ${err.message}`);
    await sendTelegram(`❌ ${tracker} sync failed: ${err.message}`);
    process.stdout.write(
      JSON.stringify({ agent: 'jira-sync-agent', status: 'failure', error: err.message }) + '\n'
    );
    process.exit(1);
  }
}

main();
