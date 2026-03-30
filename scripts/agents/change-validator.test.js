/**
 * Tests for change-validator.js
 *
 * Coverage:
 * - extractWorkerMessage() - message extraction from daily logs
 * - generateCommitMessage() - commit message generation
 * - reviewWithClaude() - AI review scoring
 * - validate() - main validation workflow
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Mock dependencies before requiring the module
jest.mock('fs');
jest.mock('../lib/git-ops');
jest.mock('../lib/github-issues');
jest.mock('../lib/memory');

// Mock config with proper structure
jest.mock('../lib/config', () => ({
  config: {
    claude: {
      cmd: 'claude',
    },
    telegram: {
      enabled: false,
    },
  },
}));

// Mock claude-runner to avoid spawning actual processes
jest.mock('../lib/claude-runner', () => ({
  runClaude: jest.fn(),
}));

const gitOps = require('../lib/git-ops');
const gh = require('../lib/github-issues');
const { runClaude } = require('../lib/claude-runner');
const memory = require('../lib/memory');

// Load the validator module (after mocks are set up)
const validator = require('./change-validator');

describe('extractWorkerMessage', () => {
  const workerId = 'AUTO-1774768974469';
  const today = new Date().toISOString().slice(0, 10);

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fs.readFileSync mock
    fs.readFileSync = jest.fn();
    fs.existsSync = jest.fn();
  });

  test('successfully extracts worker summary from daily log', () => {
    const logContent = `# 2026-03-29

## Log

- 3:25:39 pm — Worker done: ${workerId} — Added 500+ line Deployment Guide to README.md with local setup, Docker Compose, production options
- 3:26:50 pm — Auto-committed ${workerId}: feat: add deployment guide (score: 8/10, SHA: 54e4a50)
`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = validator._extractWorkerMessage(workerId);

    expect(result).toBe('Added 500+ line Deployment Guide to README.md with local setup, Docker Compose, production options');
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).toHaveBeenCalled();
    const calledPath = fs.existsSync.mock.calls[0][0];
    // Normalize path for cross-platform testing (handles both / and \)
    const normalizedPath = calledPath.replace(/\\/g, '/');
    expect(normalizedPath).toMatch(/memory\/daily\/\d{4}-\d{2}-\d{2}\.md$/);
  });

  test('handles missing daily log file', () => {
    fs.existsSync.mockReturnValue(false);

    const result = validator._extractWorkerMessage(workerId);

    expect(result).toBeNull();
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  test('handles worker ID not found in log', () => {
    const logContent = `# 2026-03-29

## Log

- 3:25:39 pm — Worker done: AUTO-9999999999999 — Some other worker
`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = validator._extractWorkerMessage(workerId);

    expect(result).toBeNull();
  });

  test('handles malformed log entries', () => {
    const logContent = `# 2026-03-29

## Log

- 3:25:39 pm — Worker done: ${workerId}
- Incomplete entry
`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = validator._extractWorkerMessage(workerId);

    // Returns empty string when message part is missing, which is falsy
    expect(result).toBeFalsy();
  });

  test('strips leading separators (em dash, hyphen, spaces)', () => {
    const logContent = `# 2026-03-29

## Log

- 3:25:39 pm — Worker done: ${workerId} —   Test message with separators
`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = validator._extractWorkerMessage(workerId);

    expect(result).toBe('Test message with separators');
  });
});

describe('generateCommitMessage', () => {
  const workerId = 'AUTO-1774768974469';
  const diff = 'diff --git a/test.js...\n+ added line';
  const workerSummary = 'Added comprehensive tests';

  beforeEach(() => {
    jest.clearAllMocks();
    fs.readFileSync = jest.fn();
    fs.existsSync = jest.fn();
    runClaude.mockReset();
  });

  test('uses extracted worker message for feat commit', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Added 500+ line Deployment Guide to README.md`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^feat:/);
    expect(result).toMatch(/deployment guide/i);
    expect(result.length).toBeLessThanOrEqual(72);
  });

  test('detects fix commit type from worker message', async () => {
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Fixed analytics test failures by switching from UTC to local date`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^fix:/);
    expect(result.length).toBeLessThanOrEqual(72);
  });

  test('detects refactor commit type', async () => {
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Refactored authentication middleware for better reusability`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^refactor:/);
  });

  test('detects test commit type', async () => {
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Tested all API endpoints with comprehensive integration tests`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^test:/);
  });

  test('detects docs commit type', async () => {
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Documented API endpoints with OpenAPI specification`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^docs:/);
  });

  test('truncates long messages to 72 characters', async () => {
    const longMessage = 'A'.repeat(100);
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Added ${longMessage}`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result.length).toBeLessThanOrEqual(72);
  });

  test('removes project path references', async () => {
    const logContent = `- 3:25:39 pm — Worker done: ${workerId} — Added tests to projects/agent-tools with 50 test cases`;

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(logContent);

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).not.toMatch(/projects\/agent-tools/);
    // The regex in change-validator.js removes "with N tests" but our test has "test cases"
    // Just verify the result is reasonable
    expect(result.length).toBeLessThanOrEqual(72);
  });

  test('falls back to Claude when worker message not found', async () => {
    fs.existsSync.mockReturnValue(false);
    runClaude.mockResolvedValue({
      success: true,
      output: 'feat: add new feature\n',
    });

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toBe('feat: add new feature');
    expect(runClaude).toHaveBeenCalled();
  });

  test('handles Claude timeout gracefully', async () => {
    fs.existsSync.mockReturnValue(false);
    runClaude.mockResolvedValue({
      success: false,
      output: 'Task timed out after 30 seconds',
    });

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^chore:/);
    expect(result).toContain(workerSummary.slice(0, 50).toLowerCase());
  });

  test('handles empty Claude response', async () => {
    fs.existsSync.mockReturnValue(false);
    runClaude.mockResolvedValue({
      success: true,
      output: '',
    });

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toMatch(/^chore:/);
    expect(result).toMatch(/worker \d+ completed/);
  });

  test('strips quotes from Claude response', async () => {
    fs.existsSync.mockReturnValue(false);
    runClaude.mockResolvedValue({
      success: true,
      output: '"feat: add feature"\n',
    });

    const result = await validator._generateCommitMessage(diff, workerSummary, workerId);

    expect(result).toBe('feat: add feature');
    expect(result).not.toMatch(/['"]/);
  });
});

describe('validate - main workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    gitOps.getStatus = jest.fn();
    gitOps.getDiff = jest.fn();
    gitOps.commitAll = jest.fn();
    gitOps.push = jest.fn();
    gitOps.getBranch = jest.fn();

    gh.isConfigured = jest.fn();
    gh.createIssue = jest.fn();
    gh.closeIssue = jest.fn();
    gh.blockIssue = jest.fn();
    gh.boardUrl = jest.fn();

    memory.log = jest.fn();

    fs.existsSync = jest.fn();
    fs.readFileSync = jest.fn();

    // Reset runClaude and set default implementation
    runClaude.mockReset();
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: 'chore: changes made\n',
    });
  });

  test('returns early when no file changes detected', async () => {
    gitOps.getStatus.mockReturnValue([]);

    const result = await validator.validate('AUTO-123', 'test output');

    expect(result).toEqual({
      committed: false,
      sha: null,
      score: null,
      suggestions: [],
      issueUrl: null,
    });
    expect(gitOps.getDiff).not.toHaveBeenCalled();
  });

  test('skips validation when only memory/log files changed', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'memory/daily/2026-03-30.md', status: 'M' },
      { file: 'memory/usage-log.jsonl', status: 'M' },
    ]);

    const result = await validator.validate('ISSUE-23', 'Verified security fix');

    expect(result).toEqual({
      committed: false,
      sha: null,
      score: null,
      suggestions: [],
      issueUrl: null,
    });
    expect(gitOps.getDiff).not.toHaveBeenCalled();
    expect(memory.log).toHaveBeenCalledWith(
      'Worker ISSUE-23 changes skipped: only memory/log updates, no code changes'
    );
  });

  test('runs tests when changes detected in project directory', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'projects/agent-tools/src/index.ts', status: 'M' },
    ]);
    gitOps.getDiff.mockReturnValue('diff content');
    gitOps.getBranch.mockReturnValue('main');

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      scripts: { test: 'jest' }
    }));

    runClaude.mockResolvedValue({
      success: true,
      structured: {
        score: 8,
        summary: 'Added feature',
        valid: true,
        suggestions: [],
      },
    });

    await validator.validate('AUTO-123', 'Added feature');

    expect(gitOps.getStatus).toHaveBeenCalled();
    expect(gitOps.getDiff).toHaveBeenCalled();
  });

  test('commits changes when score >= 6 and tests pass', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'test.js', status: 'M' },
    ]);
    // Diff must be at least 50 chars for reviewWithClaude to work
    gitOps.getDiff.mockReturnValue('diff --git a/test.js b/test.js\n+added line 1\n+added line 2\n+added line 3');
    gitOps.commitAll.mockReturnValue({
      success: true,
      sha: 'abc123',
    });
    gitOps.push.mockReturnValue({ success: true });
    gitOps.getBranch.mockReturnValue('main');

    // Mock fs for extractWorkerMessage (called from generateCommitMessage)
    // Return false so it falls back to Claude for commit message
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('');

    // Mock both runClaude calls (review and commit message generation)
    runClaude
      .mockResolvedValueOnce({
        success: true,
        structured: {
          score: 8,
          summary: 'Added feature',
          valid: true,
          suggestions: ['Add tests', 'Add docs', 'Add monitoring'],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'feat: add feature\n',
      });

    const result = await validator.validate('AUTO-123', 'Added feature');

    expect(result.committed).toBe(true);
    expect(result.sha).toBe('abc123');
    expect(result.score).toBe(8);
    expect(gitOps.commitAll).toHaveBeenCalled();
    expect(gitOps.push).toHaveBeenCalled();
    expect(memory.log).toHaveBeenCalled();
  });

  test('skips commit when score < 6', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'test.js', status: 'M' },
    ]);
    // Diff must be at least 50 chars for reviewWithClaude to work
    gitOps.getDiff.mockReturnValue('diff --git a/test.js b/test.js\n+bad change line\n-old line');

    fs.existsSync.mockReturnValue(false);

    runClaude.mockResolvedValue({
      success: true,
      structured: {
        score: 4,
        summary: 'Poor quality changes',
        valid: false,
        issues: 'Security issues found',
        suggestions: [],
      },
    });

    const result = await validator.validate('AUTO-123', 'Made changes');

    expect(result.committed).toBe(false);
    expect(result.sha).toBeNull();
    expect(result.score).toBe(4);
    expect(gitOps.commitAll).not.toHaveBeenCalled();
  });

  test('creates and closes GitHub issue on successful commit', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'test.js', status: 'M' },
    ]);
    // Diff must be at least 50 chars for reviewWithClaude to work
    gitOps.getDiff.mockReturnValue('diff --git a/test.js b/test.js\n+added line 1\n+added line 2\n+added line 3');
    gitOps.commitAll.mockReturnValue({
      success: true,
      sha: 'abc123',
    });
    gitOps.push.mockReturnValue({ success: true });
    gitOps.getBranch.mockReturnValue('main');

    fs.existsSync.mockReturnValue(false);

    gh.isConfigured.mockReturnValue(true);
    gh.createIssue.mockResolvedValue({
      number: 42,
      url: 'https://github.com/user/repo/issues/42',
    });
    gh.boardUrl.mockReturnValue('https://github.com/user/repo/issues');

    // Mock both runClaude calls
    runClaude
      .mockResolvedValueOnce({
        success: true,
        structured: {
          score: 8,
          summary: 'Added feature',
          valid: true,
          suggestions: [],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'feat: add feature\n',
      });

    const result = await validator.validate('AUTO-123', 'Added feature');

    expect(gh.createIssue).toHaveBeenCalled();
    expect(gh.closeIssue).toHaveBeenCalled();
    expect(result.issueUrl).toBe('https://github.com/user/repo/issues/42');
  });

  test('blocks GitHub issue when changes not committed', async () => {
    gitOps.getStatus.mockReturnValue([
      { file: 'test.js', status: 'M' },
    ]);
    // Diff must be at least 50 chars for reviewWithClaude to work
    gitOps.getDiff.mockReturnValue('diff --git a/test.js b/test.js\n+bad change 1\n+bad change 2');

    fs.existsSync.mockReturnValue(false);

    gh.isConfigured.mockReturnValue(true);
    gh.createIssue.mockResolvedValue({
      number: 42,
      url: 'https://github.com/user/repo/issues/42',
    });
    gh.boardUrl.mockReturnValue('https://github.com/user/repo/issues');

    runClaude.mockResolvedValue({
      success: true,
      structured: {
        score: 4,
        summary: 'Poor changes',
        valid: false,
        issues: 'Quality issues found',
        suggestions: [],
      },
    });

    const result = await validator.validate('AUTO-123', 'Made changes');

    expect(gh.createIssue).toHaveBeenCalled();
    expect(gh.blockIssue).toHaveBeenCalled();
    expect(gh.blockIssue.mock.calls[0][1]).toMatch(/Score 4\/10/);
    expect(gh.closeIssue).not.toHaveBeenCalled();
  });

  test('sends Telegram notification when notifyMain provided', async () => {
    const notifyMain = jest.fn().mockResolvedValue(undefined);

    gitOps.getStatus.mockReturnValue([
      { file: 'test.js', status: 'M' },
    ]);
    // Diff must be at least 50 chars for reviewWithClaude to work
    gitOps.getDiff.mockReturnValue('diff --git a/test.js b/test.js\n+added stuff line 1\n+added stuff line 2');
    gitOps.commitAll.mockReturnValue({
      success: true,
      sha: 'abc123',
    });
    gitOps.push.mockReturnValue({ success: true });
    gitOps.getBranch.mockReturnValue('main');

    fs.existsSync.mockReturnValue(false);

    gh.isConfigured.mockReturnValue(false);
    gh.boardUrl.mockReturnValue('https://github.com/user/repo/issues');

    // Mock both runClaude calls
    runClaude
      .mockResolvedValueOnce({
        success: true,
        structured: {
          score: 8,
          summary: 'Added feature',
          valid: true,
          suggestions: ['Next step 1', 'Next step 2'],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        output: 'feat: add feature\n',
      });

    await validator.validate('AUTO-123', 'Added feature', { notifyMain });

    expect(notifyMain).toHaveBeenCalled();
    const notifyCall = notifyMain.mock.calls[0][0];
    expect(notifyCall).toMatch(/Sprint Complete|Added feature/);
    expect(notifyCall).toMatch(/Score: 8\/10/);
    expect(notifyCall).toMatch(/Next:/);
    expect(notifyCall).toMatch(/Next step 1/);
  });
});
