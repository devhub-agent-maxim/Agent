#!/usr/bin/env node
/**
 * Jira REST API integration.
 *
 * Reads from .env:
 *   JIRA_URL          = https://yourcompany.atlassian.net
 *   JIRA_USER         = your@email.com
 *   JIRA_TOKEN        = your-api-token
 *   JIRA_PROJECT_KEY  = DEV (or your project key)
 *
 * Usage:
 *   const jira = require('./lib/jira');
 *   if (jira.isConfigured()) {
 *     await jira.createIssue('Fix auth bug', 'Description...');
 *     await jira.addComment('DEV-42', 'Worker completed this task');
 *   }
 */

'use strict';

const https = require('https');
const http  = require('http');

require('./config'); // ensure .env is loaded

const JIRA_URL   = process.env.JIRA_URL         || '';
const JIRA_USER  = process.env.JIRA_USER         || '';
const JIRA_TOKEN = process.env.JIRA_TOKEN        || '';
const JIRA_KEY   = process.env.JIRA_PROJECT_KEY  || 'DEV';

// ── Config check ─────────────────────────────────────────────────────────────

function isConfigured() {
  return !!(JIRA_URL && JIRA_USER && JIRA_TOKEN);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function jiraRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url    = new URL(endpoint, JIRA_URL);
    const lib    = url.protocol === 'https:' ? https : http;
    const auth   = Buffer.from(`${JIRA_USER}:${JIRA_TOKEN}`).toString('base64');
    const data   = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = lib.request(opts, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {} });
        } catch {
          resolve({ status: res.statusCode, body: d });
        }
      });
    });

    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Jira request timed out')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Issues ────────────────────────────────────────────────────────────────────

/**
 * Create a new Jira issue (Story type by default).
 * @param {string} summary
 * @param {string} description
 * @param {string} [issueType] - 'Story' | 'Bug' | 'Task'
 * @returns {Promise<{key: string, url: string} | null>}
 */
async function createIssue(summary, description, issueType = 'Task') {
  if (!isConfigured()) return null;
  try {
    const res = await jiraRequest('POST', '/rest/api/3/issue', {
      fields: {
        project:     { key: JIRA_KEY },
        summary:     summary.slice(0, 250),
        description: {
          type:    'doc',
          version: 1,
          content: [{
            type:    'paragraph',
            content: [{ type: 'text', text: description.slice(0, 4000) }],
          }],
        },
        issuetype: { name: issueType },
      },
    });

    if (res.status === 201 && res.body?.key) {
      return {
        key: res.body.key,
        url: `${JIRA_URL}/browse/${res.body.key}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Add a plain-text comment to an existing issue.
 * @param {string} issueKey  - e.g. "DEV-42"
 * @param {string} text
 */
async function addComment(issueKey, text) {
  if (!isConfigured()) return false;
  try {
    const res = await jiraRequest('POST', `/rest/api/3/issue/${issueKey}/comment`, {
      body: {
        type:    'doc',
        version: 1,
        content: [{
          type:    'paragraph',
          content: [{ type: 'text', text: text.slice(0, 4000) }],
        }],
      },
    });
    return res.status === 201;
  } catch {
    return false;
  }
}

/**
 * Get open issues in the project (for decider context).
 * Returns array of { key, summary, status }.
 */
async function getOpenIssues(maxResults = 10) {
  if (!isConfigured()) return [];
  try {
    const res = await jiraRequest(
      'GET',
      `/rest/api/3/search?jql=project=${JIRA_KEY}+AND+resolution=Unresolved+ORDER+BY+updated+DESC&maxResults=${maxResults}&fields=summary,status`
    );
    if (res.status !== 200 || !res.body?.issues) return [];
    return res.body.issues.map(i => ({
      key:     i.key,
      summary: i.fields?.summary || '',
      status:  i.fields?.status?.name || '',
    }));
  } catch {
    return [];
  }
}

module.exports = { isConfigured, createIssue, addComment, getOpenIssues };
