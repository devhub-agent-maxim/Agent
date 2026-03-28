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
 *   6. Create/update Jira ticket
 *   7. Send formatted change report to Telegram (what changed, score, suggestions)
 *
 * Called by agent.js worker completion handler.
 * Returns { committed, sha, score, suggestions, jiraKey }
 */

'use strict';

require('../lib/config');

const { execSync }  = require('child_process');
const path          = require('path');
const fs            = require('fs');

const gitOps        = require('../lib/git-ops');
const jira          = require('../lib/jira');
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

// ── Generate commit message ───────────────────────────────────────────────────

async function generateCommitMessage(diff, workerSummary) {
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
 * @returns {Promise<{committed: boolean, sha: string|null, score: number, suggestions: string[], jiraKey: string|null}>}
 */
async function validate(workerId, workerOutput, notifyFns = {}) {
  const { notifyMain } = notifyFns;

  log(`Validating changes for worker: ${workerId}`);

  const changedFiles = gitOps.getStatus();

  // No changes — nothing to do
  if (changedFiles.length === 0) {
    log('No file changes detected — skipping validation');
    return { committed: false, sha: null, score: null, suggestions: [], jiraKey: null };
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
      commitMsg = await generateCommitMessage(diff, workerOutput.slice(0, 300));
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

  // Step 5: Jira
  let jiraKey = null;
  if (committed && jira.isConfigured()) {
    try {
      const issue = await jira.createIssue(
        commitMsg || `Agent work: ${workerId}`,
        [
          `Worker: ${workerId}`,
          `Commit: ${sha || 'n/a'}`,
          `Score: ${score}/10`,
          '',
          review?.summary || workerOutput.slice(0, 300),
          '',
          testResult.output,
        ].join('\n')
      );
      if (issue?.key) {
        jiraKey = issue.key;
        log(`Jira ticket created: ${issue.key} — ${issue.url}`);
      }
    } catch (err) {
      log(`Jira error: ${err.message}`);
    }
  }

  // Step 6: Send Telegram report
  const suggestions = review?.suggestions || [];
  if (notifyMain) {
    const scoreEmoji = score >= 8 ? '🟢' : score >= 6 ? '🟡' : '🔴';
    const lines = [
      committed
        ? `✅ *Changes committed & pushed*`
        : `⚠️ *Changes NOT committed* (score too low or tests failed)`,
      '',
      `🔧 *Worker:* \`${workerId}\``,
      `${scoreEmoji} *Quality score:* ${score}/10`,
      review?.summary ? `📝 *What changed:* ${review.summary}` : '',
      sha ? `🔀 *Commit:* \`${sha}\` → \`${gitOps.getBranch()}\`` : '',
      jiraKey ? `🎫 *Jira:* \`${jiraKey}\`` : '',
      '',
      '*Changed files:*',
      changedFiles.slice(0, 8).map(f => `  • \`${f.file}\``).join('\n'),
      '',
    ];

    if (!testResult.passed) {
      lines.push(`❌ *Tests failed:*\n\`\`\`\n${testResult.output.slice(0, 400)}\n\`\`\``, '');
    }

    if (review?.issues) {
      lines.push(`⚠️ *Issues found:* ${review.issues}`, '');
    }

    if (suggestions.length > 0) {
      lines.push('💡 *Suggestions for next work:*');
      suggestions.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }

    await notifyMain(lines.filter(l => l !== undefined).join('\n'));
  }

  return { committed, sha, score, suggestions, jiraKey };
}

module.exports = { validate };
