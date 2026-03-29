#!/usr/bin/env node
/**
 * Change Validator — runs after every worker completes.
 *
 * Flow:
 *   1. Check git status — any new/modified files?
 *   2. Run tests if available (npm test in changed project dirs)
 *   3. Ask Sonnet to review the diff and score it 1-10
 *   4. Generate 3 specific suggestions for what to work on next
 *   5. Auto-commit + push if changes look good (score ≥ 6 or tests pass)
 *   6. Create GitHub Issue (in-progress → done) for task tracking
 *   7. Send structured standup to Telegram with issue link
 *
 * Called by agent.js worker completion handler.
 * Returns { committed, sha, score, suggestions, issueUrl }
 */

'use strict';

require('../lib/config');

const { execSync }  = require('child_process');
const path          = require('path');
const fs            = require('fs');

const gitOps        = require('../lib/git-ops');
const gh            = require('../lib/github-issues');
const { runClaude } = require('../lib/claude-runner');
const memory        = require('../lib/memory');

const ROOT = path.resolve(__dirname, '..', '..');

function log(msg) {
  console.log(`[validator] ${new Date().toLocaleTimeString()} ${msg}`);
}

// ── Run tests ─────────────────────────────────────────────────────────────────

/**
 * Find project dirs that have a package.json and run npm test there.
 * Returns { passed: boolean, output: string }.
 */
function runTests(changedFiles) {
  // Find unique project roots that have changes
  const projectRoots = new Set();
  for (const { file } of changedFiles) {
    const parts = file.split('/');
    if (parts[0] === 'projects' && parts[1] && parts[1] !== '_template') {
      const projectRoot = path.join(ROOT, 'projects', parts[1]);
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        projectRoots.add(projectRoot);
      }
    }
  }

  if (projectRoots.size === 0) {
    // Check root package.json
    if (fs.existsSync(path.join(ROOT, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      if (pkg.scripts?.test && !pkg.scripts.test.includes('no test')) {
        projectRoots.add(ROOT);
      }
    }
  }

  if (projectRoots.size === 0) return { passed: true, output: '(no tests configured)' };

  let allPassed = true;
  const outputs = [];

  for (const projectRoot of projectRoots) {
    try {
      const out = execSync('npm test --if-present', {
        cwd:      projectRoot,
        encoding: 'utf8',
        stdio:    'pipe',
        timeout:  120000,
      });
      outputs.push(`✅ Tests passed in ${path.relative(ROOT, projectRoot) || 'root'}`);
    } catch (e) {
      allPassed = false;
      const errOut = (e.stdout || e.stderr || e.message).slice(0, 500);
      outputs.push(`❌ Tests failed in ${path.relative(ROOT, projectRoot) || 'root'}:\n${errOut}`);
    }
  }

  return { passed: allPassed, output: outputs.join('\n') };
}

// ── AI review ─────────────────────────────────────────────────────────────────

/**
 * Ask Sonnet to review the diff and generate:
 *   - quality score (1-10)
 *   - one-line summary of what changed
 *   - 3 specific suggestions for what to build next
 *
 * Returns { score, summary, suggestions: string[] } or null on failure.
 */
async function reviewWithClaude(diff, workerId, workerOutput) {
  if (!diff || diff.length < 50) return null;

  const prompt = [
    'You are a senior engineer reviewing code changes made by an autonomous agent.',
    '',
    `Worker ID: ${workerId}`,
    `Worker output summary: ${workerOutput.slice(0, 300)}`,
    '',
    '=== Git Diff ===',
    diff.slice(0, 6000),
    '=== End Diff ===',
    '',
    'Review these changes and respond ONLY with a JSON object on the last line:',
    '{',
    '  "score": <1-10, where 10=excellent production-ready code>,',
    '  "summary": "<one sentence: what was built/changed and why it matters>",',
    '  "valid": <true if score >= 6 and no obvious bugs/security issues>,',
    '  "issues": "<any serious issues found, or null>",',
    '  "suggestions": [',
    '    "<specific next thing to build that directly extends this work>",',
    '    "<specific improvement or test to add>",',
    '    "<specific feature or integration to tackle next>"',
    '  ]',
    '}',
  ].join('\n');

  const result = await runClaude(prompt, { timeoutMs: 60000, model: 'sonnet' });
  if (!result.structured) return null;

  return {
    score:       result.structured.score       || 5,
    summary:     result.structured.summary     || 'Changes made',
    valid:       result.structured.valid       !== false,
    issues:      result.structured.issues      || null,
    suggestions: result.structured.suggestions || [],
  };
}

// ── Extract worker completion message from daily log ─────────────────────────

/**
 * Extract the actual "Worker done:" message from today's daily log.
 * Returns the summary portion after the workerId, or null if not found.
 *
 * @param {string} workerId - Worker ID to find (e.g., "AUTO-1774768974469")
 * @returns {string|null}
 */
function extractWorkerMessage(workerId) {
  const today = new Date().toISOString().slice(0, 10);
  const dailyFile = path.join(ROOT, 'memory', 'daily', `${today}.md`);

  if (!fs.existsSync(dailyFile)) {
    console.log(`[extractWorkerMessage] Daily file not found: ${dailyFile}`);
    return null;
  }

  const content = fs.readFileSync(dailyFile, 'utf8');

  // Find the line with the worker completion message
  // Format: "- HH:MM am/pm — Worker done: AUTO-1774768974469 — <summary>"
  const lines = content.split('\n');
  const workerLine = lines.find(l => l.includes(`Worker done: ${workerId}`));

  if (!workerLine) {
    console.log(`[extractWorkerMessage] Worker line not found for: ${workerId}`);
    return null;
  }

  console.log(`[extractWorkerMessage] Found line: ${workerLine.substring(0, 100)}...`);

  // Split by "Worker done: <workerId> " and extract the summary after the separator
  const parts = workerLine.split(`Worker done: ${workerId} `);
  if (parts.length < 2) {
    console.log(`[extractWorkerMessage] Failed to split line for: ${workerId}`);
    return null;
  }

  // Remove leading separator (em dash or similar) and trim
  const message = parts[1].replace(/^[—\-–\s]+/, '').trim();

  console.log(`[extractWorkerMessage] Extracted: ${message.substring(0, 100)}...`);
  console.log(`[extractWorkerMessage] Message length: ${message.length}`);

  return message;
}

// ── Generate commit message ───────────────────────────────────────────────────

async function generateCommitMessage(diff, workerSummary, workerId) {
  // First, try to extract the actual worker completion message from daily log
  const workerMessage = extractWorkerMessage(workerId);

  // If we have a worker message, use it directly to create a commit message
  if (workerMessage && workerMessage.length > 20 && !workerMessage.includes('timed out')) {
    // Extract the key action from the message
    // Examples:
    // "Added 500+ line Deployment Guide..." → "feat: add deployment guide to README"
    // "Created PR #2 merging claude/serene-lamarr..." → "feat: create PR for production API stack"
    // "Fixed analytics test failures..." → "fix: analytics test timezone handling"

    const msg = workerMessage.slice(0, 200).toLowerCase();
    let type = 'chore';

    if (msg.match(/^(added|add|created|create|implemented?|built?|scaffold)/)) type = 'feat';
    else if (msg.match(/^(fixed?|fix|resolved?|corrected?)/)) type = 'fix';
    else if (msg.match(/^(refactor|restructur|reorganiz)/)) type = 'refactor';
    else if (msg.match(/^(updat|modif|chang|enhanc|improv)/)) type = 'feat';
    else if (msg.match(/^(test|verified?|validated?)/)) type = 'test';
    else if (msg.match(/^(document|doc|added.*documentation)/)) type = 'docs';

    // Create a concise version of the worker message
    let summary = workerMessage
      .replace(/^(Added|Created|Fixed|Updated|Modified|Changed|Enhanced|Improved|Tested|Verified|Validated|Implemented|Built|Scaffolded)\s+/i, '')
      .replace(/\s+to\s+projects\/[^\s]+/g, '')  // Remove "to projects/X"
      .replace(/\s+in\s+projects\/[^\s]+/g, '')  // Remove "in projects/X"
      .replace(/\s+with\s+\d+\s+tests/gi, '')    // Remove "with N tests"
      .replace(/✅/g, '')
      .trim();

    // Truncate and lowercase
    if (summary.length > 65) {
      summary = summary.slice(0, 65).replace(/\s+\S*$/, ''); // Remove partial word at end
    }

    const commitMsg = `${type}: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
    return commitMsg.slice(0, 72);
  }

  // Fallback: use Claude to generate commit message (with timeout protection)
  const prompt = [
    'Generate a concise git commit message for these changes.',
    'Format: "<type>: <what was done>"',
    'Types: feat, fix, refactor, chore, docs, test',
    'Max 72 characters. Be specific about what changed.',
    '',
    `Worker summary: ${workerSummary.slice(0, 200)}`,
    '',
    'Diff (truncated):',
    diff.slice(0, 3000),
    '',
    'Output ONLY the commit message text on the last line, nothing else.',
  ].join('\n');

  const result = await runClaude(prompt, { timeoutMs: 30000, model: 'sonnet' });

  // Check if Claude timed out or failed
  if (!result.success || result.output.includes('timed out')) {
    // Use worker summary as fallback
    const summary = (workerSummary || 'completed work').slice(0, 50).toLowerCase();
    return `chore: ${summary}`;
  }

  const lines = (result.output || '').split('\n').filter(l => l.trim());
  const msg = lines[lines.length - 1]?.trim() || `chore: worker ${Date.now()} completed`;
  // Strip quotes if Claude wrapped it
  return msg.replace(/^["']|["']$/g, '').slice(0, 72);
}

// ── Main validate function ────────────────────────────────────────────────────

/**
 * @param {string} workerId       - ID of the completed worker
 * @param {string} workerOutput   - Full text output from the worker
 * @param {object} notifyFns      - { notifyMain, notifyIntel } from agent.js
 * @returns {Promise<{committed: boolean, sha: string|null, score: number, suggestions: string[], issueUrl: string|null}>}
 */
async function validate(workerId, workerOutput, notifyFns = {}) {
  const { notifyMain } = notifyFns;

  log(`Validating changes for worker: ${workerId}`);

  const changedFiles = gitOps.getStatus();

  // No changes — nothing to do
  if (changedFiles.length === 0) {
    log('No file changes detected — skipping validation');
    return { committed: false, sha: null, score: null, suggestions: [], issueUrl: null };
  }

  log(`${changedFiles.length} file(s) changed: ${changedFiles.map(f => f.file).join(', ')}`);

  // Step 1: Get diff for review
  const diff = gitOps.getDiff();

  // Step 2: Run tests
  const testResult = runTests(changedFiles);
  log(`Tests: ${testResult.passed ? 'passed' : 'failed'}`);

  // Step 3: AI review
  const review = await reviewWithClaude(diff, workerId, workerOutput);
  const score  = review?.score || 6;
  const valid  = review?.valid !== false && (testResult.passed || review?.score >= 7);

  log(`Review score: ${score}/10 — valid: ${valid}`);

  // Step 4: Commit if valid
  let committed = false;
  let sha       = null;
  let commitMsg = '';

  if (valid) {
    try {
      commitMsg = await generateCommitMessage(diff, workerOutput.slice(0, 300), workerId);
      const commitResult = gitOps.commitAll(
        `${commitMsg}\n\nWorker: ${workerId}\nScore: ${score}/10\n\nCo-Authored-By: claude-flow <ruv@ruv.net>`
      );

      if (commitResult.success) {
        log(`Committed: ${commitResult.sha} — "${commitMsg}"`);
        const pushResult = gitOps.push();
        if (pushResult.success) {
          log(`Pushed to ${gitOps.getBranch()}`);
        } else {
          log(`Push failed: ${pushResult.error}`);
        }
        committed = true;
        sha = commitResult.sha;
        memory.log(`Auto-committed ${workerId}: ${commitMsg} (score: ${score}/10, SHA: ${sha})`);
      } else {
        log(`Commit failed: ${commitResult.error}`);
      }
    } catch (err) {
      log(`Commit/push error: ${err.message}`);
    }
  } else {
    log(`Skipping commit — score ${score}/10 or tests failed`);
    memory.log(`Worker ${workerId} changes NOT committed: score ${score}/10, tests: ${testResult.passed}`);
  }

  // Step 5: GitHub Issue tracking
  let issueUrl  = null;
  let issueNum  = null;
  const suggestions = review?.suggestions || [];

  if (gh.isConfigured()) {
    try {
      const issueTitle = commitMsg || review?.summary || `Agent sprint: ${workerId}`;
      const issueBody  = [
        review?.summary || workerOutput.slice(0, 300),
        '',
        `**Files changed:** ${changedFiles.length}`,
        testResult.output !== '(no tests configured)' ? `**Tests:** ${testResult.output.slice(0, 200)}` : '',
      ].filter(Boolean).join('\n');

      const issue = await gh.createIssue(issueTitle, issueBody, workerId);
      if (issue) {
        issueNum = issue.number;
        issueUrl = issue.url;
        log(`GitHub Issue #${issueNum} created`);

        if (committed) {
          // Count passing tests from output
          const testMatch = testResult.output.match(/(\d+)\s+pass/i);
          const testCount = testMatch ? testMatch[1] : null;
          await gh.closeIssue(issueNum, sha, review?.summary || 'Completed', score, testCount);
          log(`GitHub Issue #${issueNum} closed as done`);
        } else {
          await gh.blockIssue(issueNum, `Score ${score}/10 — changes not committed`);
        }
      }
    } catch (err) {
      log(`GitHub Issues error: ${err.message}`);
    }
  }

  // Step 6: Structured Telegram standup
  if (notifyMain) {
    const scoreEmoji  = score >= 8 ? '🟢' : score >= 6 ? '🟡' : '🔴';
    const timeStr     = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
    const branch      = gitOps.getBranch();
    const testLine    = testResult.passed
      ? `✅ Tests: ${testResult.output.replace(/\n.*/s, '').slice(0, 60)}`
      : `❌ Tests failed`;

    const lines = [
      committed
        ? `🤖 *Sprint Complete* — ${timeStr}`
        : `⚠️ *Sprint Not Committed* — ${timeStr}`,
      '━━━━━━━━━━━━━━━━━━━',
      review?.summary ? `📦 ${review.summary}` : '',
      `${scoreEmoji} Score: ${score}/10  |  ${testLine}`,
      sha ? `🔀 \`${sha}\` → \`${branch}\`` : '',
      issueUrl ? `📋 [Issue #${issueNum}](${issueUrl})` : '',
      '━━━━━━━━━━━━━━━━━━━',
    ];

    if (!testResult.passed) {
      lines.push(`\`\`\`\n${testResult.output.slice(0, 300)}\n\`\`\``);
    }

    if (review?.issues) {
      lines.push(`⚠️ ${review.issues}`);
    }

    if (suggestions.length > 0) {
      lines.push('💡 *Next:*');
      suggestions.slice(0, 3).forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }

    lines.push(`📊 [Board](${gh.boardUrl()})`);

    await notifyMain(lines.filter(l => l !== undefined && l !== '').join('\n'));
  }

  return { committed, sha, score, suggestions, issueUrl };
}

module.exports = { validate };
