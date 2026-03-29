#!/usr/bin/env node
/**
 * GitHub Issues — agent task board integration.
 *
 * Replaces Jira for task tracking. Uses GitHub Issues with labels as a Kanban:
 *   backlog → in-progress → in-review → done
 *
 * Reads from .env:
 *   GITHUB_TOKEN  — personal access token (repo scope)
 *   GITHUB_OWNER  — e.g. devhub-agent-maxim
 *   GITHUB_REPO   — e.g. Agent
 *
 * Usage:
 *   const gh = require('./lib/github-issues');
 *   if (gh.isConfigured()) {
 *     const issue = await gh.createIssue('Add rate limiting', 'Details...');
 *     await gh.closeIssue(issue.number, 'abc1234', 'Completed in sprint 3');
 *   }
 */

'use strict';

const https = require('https');

try { require('./config'); } catch (_) {}

const TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = process.env.GITHUB_OWNER || 'devhub-agent-maxim';
const REPO  = process.env.GITHUB_REPO  || 'Agent';

// ── Config ────────────────────────────────────────────────────────────────────

function isConfigured() {
  return !!(TOKEN && OWNER && REPO);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      port:     443,
      path:     `/repos/${OWNER}/${REPO}${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept':        'application/vnd.github+json',
        'User-Agent':    'devhub-agent/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    if (data) {
      opts.headers['Content-Type']   = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Label management ──────────────────────────────────────────────────────────

const KANBAN_LABELS = ['backlog', 'in-progress', 'in-review', 'done'];

async function setLabel(issueNumber, label) {
  // Remove all kanban labels first
  for (const l of KANBAN_LABELS) {
    try {
      await apiRequest('DELETE', `/issues/${issueNumber}/labels/${l}`);
    } catch (_) {}
  }
  // Add the new one
  await apiRequest('POST', `/issues/${issueNumber}/labels`, { labels: [label, 'agent-task'] });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new GitHub Issue for a sprint task.
 * Opens it as "in-progress" immediately.
 *
 * @param {string} title   - Short title (becomes issue title)
 * @param {string} body    - Markdown body with context
 * @param {string} [workerId] - Agent worker ID for cross-reference
 * @returns {Promise<{number: number, url: string}|null>}
 */
async function createIssue(title, body = '', workerId = null) {
  if (!isConfigured()) return null;
  try {
    const fullBody = [
      body,
      '',
      workerId ? `**Agent worker:** \`${workerId}\`` : '',
      `**Started:** ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
    ].filter(Boolean).join('\n');

    const res = await apiRequest('POST', '/issues', {
      title,
      body: fullBody,
      labels: ['in-progress', 'agent-task'],
    });

    if (res.status === 201) {
      return { number: res.body.number, url: res.body.html_url };
    }
    console.error(`[gh-issues] createIssue failed: ${res.status}`, res.body?.message);
    return null;
  } catch (err) {
    console.error(`[gh-issues] createIssue error: ${err.message}`);
    return null;
  }
}

/**
 * Mark an issue as done — adds commit comment, moves to done, closes it.
 *
 * @param {number} issueNumber
 * @param {string} commitSha  - Short commit SHA
 * @param {string} summary    - What was done
 * @param {number} [score]    - Quality score 1-10
 * @param {number} [tests]    - Number of tests passing
 */
async function closeIssue(issueNumber, commitSha, summary, score = null, tests = null) {
  if (!isConfigured() || !issueNumber) return;
  try {
    const commentLines = [
      '## ✅ Sprint Complete',
      '',
      summary,
      '',
      commitSha ? `**Commit:** \`${commitSha}\`` : '',
      score    ? `**Quality score:** ${score}/10` : '',
      tests    ? `**Tests passing:** ${tests}` : '',
      `**Completed:** ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
    ].filter(l => l !== '').join('\n');

    await apiRequest('POST', `/issues/${issueNumber}/comments`, { body: commentLines });
    await setLabel(issueNumber, 'done');
    await apiRequest('PATCH', `/issues/${issueNumber}`, { state: 'closed' });
  } catch (err) {
    console.error(`[gh-issues] closeIssue error: ${err.message}`);
  }
}

/**
 * Mark an issue as blocked / failed — adds error comment, moves back to backlog.
 */
async function blockIssue(issueNumber, reason) {
  if (!isConfigured() || !issueNumber) return;
  try {
    await apiRequest('POST', `/issues/${issueNumber}/comments`, {
      body: `## ⚠️ Blocked\n\n${reason}\n\n**Time:** ${new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
    });
    await setLabel(issueNumber, 'backlog');
  } catch (err) {
    console.error(`[gh-issues] blockIssue error: ${err.message}`);
  }
}

/**
 * Get open issues (backlog) for the agent to pick up next.
 * Returns array of { number, title, url }
 */
async function getBacklog() {
  if (!isConfigured()) return [];
  try {
    const res = await apiRequest('GET', '/issues?labels=backlog&state=open&per_page=10');
    if (res.status === 200 && Array.isArray(res.body)) {
      return res.body.map(i => ({ number: i.number, title: i.title, url: i.html_url }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Get recently closed (done) issues from the last N hours.
 */
async function getRecentlyDone(hours = 12) {
  if (!isConfigured()) return [];
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const res = await apiRequest('GET', `/issues?labels=done&state=closed&since=${since}&per_page=20`);
    if (res.status === 200 && Array.isArray(res.body)) {
      return res.body.map(i => ({ number: i.number, title: i.title, url: i.html_url }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Quick link to the issues board.
 */
function boardUrl() {
  return `https://github.com/${OWNER}/${REPO}/issues?q=label%3Aagent-task`;
}

module.exports = { isConfigured, createIssue, closeIssue, blockIssue, getBacklog, getRecentlyDone, boardUrl };
