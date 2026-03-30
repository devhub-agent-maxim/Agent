#!/usr/bin/env node
/**
 * GitHub Issues task tracker.
 *
 * Auto-creates a GitHub Issue for every orchestrator task.
 * Moves the label (Backlog → In Progress → Done / Blocked) as task progresses.
 * Uses the milestone "Sprint 001" for grouping.
 *
 * Requires: GITHUB_TOKEN with repo scope (already set).
 * Repo:     devhub-agent-maxim/Agent
 *
 * Usage (called automatically by orchestrator):
 *   const tracker = require('./lib/github-tracker');
 *   await tracker.syncTask({ id, prompt, stage, summary });
 */

'use strict';

const REPO  = 'devhub-agent-maxim/Agent';
const BASE  = 'https://api.github.com';

// Stage → label name (matches what we created)
const STAGE_LABEL = {
  queued:           'Backlog',
  working:          'In Progress',
  review:           'In Review',
  done:             'Done',
  blocked:          'Blocked',
};

// All stage labels — used to strip old ones before adding new
const ALL_LABELS = Object.values(STAGE_LABEL);

function getToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
}

function isConfigured() {
  return !!getToken();
}

async function ghFetch(method, path, body = null) {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/vnd.github.v3+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub ${method} ${path} → ${err.message || res.status}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ── Cache: taskId → issueNumber ──────────────────────────────────────────────
const issueCache = new Map();

async function findIssue(taskId) {
  if (issueCache.has(taskId)) return issueCache.get(taskId);

  // Search by title prefix
  const results = await ghFetch('GET',
    `/search/issues?q=repo:${REPO}+in:title+%5B${encodeURIComponent(taskId)}%5D+is:issue&per_page=5`
  ).catch(() => null);

  const match = results?.items?.find(i => i.title.startsWith(`[${taskId}]`));
  if (match) {
    issueCache.set(taskId, match.number);
    return match.number;
  }
  return null;
}

async function getMilestoneNumber() {
  const milestones = await ghFetch('GET', `/repos/${REPO}/milestones?state=open&per_page=10`).catch(() => []);
  const sprint = (milestones || []).find(m => m.title.startsWith('Sprint'));
  return sprint?.number || null;
}

// ── Create issue ──────────────────────────────────────────────────────────────

async function createIssue(taskId, prompt, stage) {
  const label = STAGE_LABEL[stage] || 'Backlog';
  const milestone = await getMilestoneNumber();

  const body = await ghFetch('POST', `/repos/${REPO}/issues`, {
    title:     `[${taskId}] ${prompt.slice(0, 120)}`,
    body:      `**Task:** ${prompt}\n\n**Pipeline:** \`archaeologist → specialist → code-reviewer → performance-optimizer\`\n\n---\n_Auto-created by agent orchestrator_`,
    labels:    [label],
    milestone: milestone || undefined,
  });

  if (body?.number) {
    issueCache.set(taskId, body.number);
    return body.number;
  }
  return null;
}

// ── Update issue labels ───────────────────────────────────────────────────────

async function setStageLabel(issueNumber, stage) {
  // Get current labels
  const current = await ghFetch('GET', `/repos/${REPO}/issues/${issueNumber}/labels`).catch(() => []);
  const currentNames = (current || []).map(l => l.name);

  // Remove all stage labels
  for (const lbl of ALL_LABELS) {
    if (currentNames.includes(lbl)) {
      await ghFetch('DELETE', `/repos/${REPO}/issues/${issueNumber}/labels/${encodeURIComponent(lbl)}`).catch(() => {});
    }
  }

  // Add new stage label
  const newLabel = STAGE_LABEL[stage];
  if (newLabel) {
    await ghFetch('POST', `/repos/${REPO}/issues/${issueNumber}/labels`, { labels: [newLabel] }).catch(() => {});
  }

  // Close issue if done
  if (stage === 'done') {
    await ghFetch('PATCH', `/repos/${REPO}/issues/${issueNumber}`, { state: 'closed' }).catch(() => {});
  }
}

// ── Add comment with summary ──────────────────────────────────────────────────

async function addComment(issueNumber, stage, summary) {
  if (!summary) return;
  const emoji = { queued: '📋', working: '⚡', review: '🔍', done: '✅', blocked: '🚫' }[stage] || '•';
  await ghFetch('POST', `/repos/${REPO}/issues/${issueNumber}/comments`, {
    body: `${emoji} **${stage.toUpperCase()}**\n\n${summary.slice(0, 1000)}`,
  }).catch(() => {});
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function syncTask({ id, prompt, stage, summary }) {
  if (!isConfigured()) return;

  try {
    let issueNumber = await findIssue(id);

    if (!issueNumber) {
      issueNumber = await createIssue(id, prompt || id, stage);
      if (!issueNumber) return;
    } else {
      await setStageLabel(issueNumber, stage);
    }

    if (summary) {
      await addComment(issueNumber, stage, summary);
    }

    const url = `https://github.com/${REPO}/issues/${issueNumber}`;
    require('./memory').log(`GitHub tracker: ${id} → ${stage} (issue #${issueNumber})`);
    return url;
  } catch (err) {
    // Non-fatal — tracker failure never blocks pipeline
    require('./memory').log(`GitHub tracker error (${id}): ${err.message}`);
  }
}

module.exports = { syncTask, isConfigured };
