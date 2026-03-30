/**
 * Tests for decider.js
 *
 * Coverage:
 * - decide() with various repo states (worker capacity, GitHub Issues, orphaned tasks, queued tasks)
 * - decide() autonomous decision-making via Claude
 * - Claude output parsing (JSON in code fences, malformed JSON, timeout errors)
 * - Fallback behavior when Claude fails
 * - Decision object structure validation
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Mock dependencies before requiring the module
jest.mock('fs');
jest.mock('../lib/task-queue');
jest.mock('../lib/claude-runner');
jest.mock('../lib/memory');
jest.mock('../lib/git-ops');
jest.mock('../lib/github-issues');
jest.mock('../lib/sprint-manager');

// Mock config with proper structure
jest.mock('../lib/config', () => ({
  config: {
    claude: {
      cmd: 'claude',
    },
  },
}));

const { parseTasks } = require('../lib/task-queue');
const { runClaude } = require('../lib/claude-runner');
const memory = require('../lib/memory');
const gitOps = require('../lib/git-ops');
const gh = require('../lib/github-issues');
const sprintMgr = require('../lib/sprint-manager');

// Load the decider module (after mocks are set up)
const { decide } = require('./decider');

describe('decide() - worker capacity management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
    gh.isConfigured = jest.fn().mockReturnValue(false);
  });

  test('returns wait when at worker capacity (2 workers)', async () => {
    const activeWorkers = [
      { id: 'AUTO-111', desc: 'Task 1' },
      { id: 'AUTO-222', desc: 'Task 2' },
    ];

    const result = await decide(activeWorkers);

    expect(result.action).toBe('wait');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toBeNull();
    expect(result.reason).toContain('2 workers running');
    expect(result.reason).toContain('max 2');
  });

  test('returns wait when at worker capacity (3 workers, over limit)', async () => {
    const activeWorkers = [
      { id: 'AUTO-111', desc: 'Task 1' },
      { id: 'AUTO-222', desc: 'Task 2' },
      { id: 'AUTO-333', desc: 'Task 3' },
    ];

    const result = await decide(activeWorkers);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('3 workers running');
  });

  test('proceeds to check for work when under capacity (1 worker)', async () => {
    const activeWorkers = [{ id: 'AUTO-111', desc: 'Task 1' }];

    // Mock autonomous decision to return wait (no work found)
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'wait', prompt: null, reason: 'No work identified' },
      output: '{"action":"wait","prompt":null,"reason":"No work identified"}',
    });

    const result = await decide(activeWorkers);

    // Should not return capacity wait, should proceed to autonomous decision
    expect(result.reason).not.toContain('workers running');
  });
});

describe('decide() - GitHub Issues backlog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
  });

  test('picks first issue from GitHub backlog when available', async () => {
    gh.isConfigured = jest.fn().mockReturnValue(true);
    gh.getBacklog = jest.fn().mockResolvedValue([
      { number: 42, title: 'Add rate limiting to API', url: 'https://github.com/user/repo/issues/42' },
      { number: 43, title: 'Fix database connection bug', url: 'https://github.com/user/repo/issues/43' },
    ]);
    sprintMgr.listSprintableProjects = jest.fn().mockReturnValue(['agent-tools', 'agent-dashboard']);
    sprintMgr.readProjectBrief = jest.fn().mockReturnValue(null);

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBe('ISSUE-42');
    expect(result.prompt).toContain('Add rate limiting to API');
    expect(result.prompt).toContain('GitHub Issue: #42');
    expect(result.prompt).toContain('all tests must pass');
    expect(result.reason).toContain('GitHub Issue #42');
  });

  test('includes project brief context when project name matches', async () => {
    gh.isConfigured = jest.fn().mockReturnValue(true);
    gh.getBacklog = jest.fn().mockResolvedValue([
      { number: 50, title: 'agent-tools: Add authentication', url: 'https://github.com/user/repo/issues/50' },
    ]);
    sprintMgr.listSprintableProjects = jest.fn().mockReturnValue(['agent-tools', 'agent-dashboard']);
    sprintMgr.readProjectBrief = jest.fn().mockReturnValue(`
## Current Sprint Goal
Build production-ready TODO API

## Stack
TypeScript, Express, Jest, SQLite

## Constraints
- All endpoints must have tests
- Follow RESTful conventions
`);

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBe('ISSUE-50');
    expect(result.prompt).toContain('Project: projects/agent-tools');
    expect(result.prompt).toContain('Sprint goal: Build production-ready TODO API');
    expect(result.prompt).toContain('Stack: TypeScript, Express, Jest, SQLite');
    expect(result.prompt).toContain('Constraints:');
    expect(result.prompt).toContain('All endpoints must have tests');
  });

  test('continues to next decision step when GitHub Issues not configured', async () => {
    gh.isConfigured = jest.fn().mockReturnValue(false);
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'wait', prompt: null, reason: 'No work found' },
      output: '{"action":"wait","prompt":null,"reason":"No work found"}',
    });

    const result = await decide([]);

    expect(gh.getBacklog).not.toHaveBeenCalled();
    expect(result.action).toBe('wait');
  });

  test('handles GitHub Issues API error gracefully', async () => {
    gh.isConfigured = jest.fn().mockReturnValue(true);
    gh.getBacklog = jest.fn().mockRejectedValue(new Error('API rate limit exceeded'));
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'wait', prompt: null, reason: 'No work found' },
      output: '{"action":"wait","prompt":null,"reason":"No work found"}',
    });

    const result = await decide([]);

    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('GitHub Issues check failed'));
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('API rate limit exceeded'));
    // Should continue to autonomous decision
    expect(runClaude).toHaveBeenCalled();
  });
});

describe('decide() - orphaned and queued tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    gh.isConfigured = jest.fn().mockReturnValue(false);
  });

  test('resumes orphaned in-progress task when no active worker for it', async () => {
    parseTasks.mockReturnValue({
      pending: [
        { id: 'TASK-005', desc: 'Pending task that is queued' },
      ],
      inProgress: [
        { id: 'TASK-003', desc: 'Orphaned task that was started but worker died' },
        { id: 'AUTO-111', desc: 'Task with active worker' },
      ],
    });

    const activeWorkers = [{ id: 'AUTO-111', desc: 'Active task' }];

    const result = await decide(activeWorkers);

    expect(result.action).toBe('work');
    expect(result.taskId).toBe('TASK-003');
    expect(result.prompt).toBe('Orphaned task that was started but worker died');
    expect(result.reason).toContain('Resuming orphaned task TASK-003');
  });

  test('picks next pending task when no orphaned tasks', async () => {
    parseTasks.mockReturnValue({
      pending: [
        { id: 'TASK-010', desc: 'First pending task with highest priority' },
        { id: 'TASK-011', desc: 'Second pending task' },
      ],
      inProgress: [],
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBe('TASK-010');
    expect(result.prompt).toBe('First pending task with highest priority');
    expect(result.reason).toContain('Next queued task: TASK-010');
  });

  test('proceeds to autonomous decision when no queued tasks', async () => {
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
    runClaude.mockResolvedValue({
      success: true,
      structured: {
        action: 'work',
        prompt: 'Add comprehensive tests to scripts/lib/git-ops.js',
        reason: 'Critical infrastructure needs test coverage',
      },
      output: '{"action":"work","prompt":"Add comprehensive tests to scripts/lib/git-ops.js","reason":"Critical infrastructure needs test coverage"}',
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toContain('git-ops.js');
    expect(runClaude).toHaveBeenCalled();
  });
});

describe('decide() - autonomous Claude-powered decisions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    gh.isConfigured = jest.fn().mockReturnValue(false);
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
  });

  test('parses Claude decision with structured output (work action)', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: {
        action: 'work',
        prompt: 'Create comprehensive error handling tests for scripts/lib/memory.js',
        reason: 'Memory module is critical infrastructure without test coverage',
      },
      output: '{"action":"work","prompt":"Create comprehensive error handling tests for scripts/lib/memory.js","reason":"Memory module is critical infrastructure without test coverage"}',
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toContain('error handling tests');
    expect(result.prompt).toContain('memory.js');
    expect(result.reason).toContain('critical infrastructure');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('autonomous decision — work'));
  });

  test('parses Claude decision with structured output (wait action)', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: {
        action: 'wait',
        prompt: null,
        reason: 'All critical systems are working well, no urgent improvements identified',
      },
      output: '{"action":"wait","prompt":null,"reason":"All critical systems are working well"}',
    });

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toBeNull();
    expect(result.reason).toContain('critical systems are working well');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('autonomous decision — wait'));
  });

  test('parses JSON from markdown code fence when structured parsing fails', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: `Based on the context, I recommend the following task:

\`\`\`json
{"action":"work","prompt":"Add rate limiting middleware to all API endpoints in projects/agent-tools/","reason":"Production APIs need protection against abuse"}
\`\`\`

This task will improve the production-readiness of the API.`,
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.prompt).toContain('rate limiting middleware');
    expect(result.reason).toContain('protection against abuse');
  });

  test('extracts JSON from middle of response when no structured output', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: `Looking at the current state of the repository and recent activity, I believe the most valuable task right now is:

{"action":"work","prompt":"Implement CORS configuration for agent-dashboard to enable cross-origin requests","reason":"Security feature needed for production deployment"}

This will prepare the dashboard for production use.`,
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.prompt).toContain('CORS configuration');
    expect(result.reason).toContain('Security feature');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('parsed JSON from output — work'));
  });

  test('handles malformed JSON gracefully with fallback', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: '{"action":"work","prompt":"Add tests", invalid json here}',
    });

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Could not parse decision output');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('JSON parse failed'));
  });

  test('handles missing prompt in work action as invalid', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'work', prompt: null, reason: 'Some reason' },
      output: '{"action":"work","prompt":null,"reason":"Some reason"}',
    });

    const result = await decide([]);

    // Should be rejected because work action requires a prompt
    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Could not parse decision output');
  });
});

describe('decide() - Claude failure scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    gh.isConfigured = jest.fn().mockReturnValue(false);
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
  });

  test('returns wait when runClaude fails with error', async () => {
    runClaude.mockResolvedValue({
      success: false,
      output: 'Task timed out after 2 minutes.',
    });

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Decision engine error');
    expect(result.reason).toContain('timed out');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('runClaude failed'));
  });

  test('returns wait when runClaude throws exception', async () => {
    runClaude.mockRejectedValue(new Error('Connection refused'));

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Decision engine exception');
    expect(result.reason).toContain('Connection refused');
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('exception — Connection refused'));
  });

  test('returns wait when runClaude returns no output', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: '',
    });

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Could not parse decision output');
    expect(result.reason).toContain('0 chars');
  });

  test('returns wait when output is too short to be valid', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: null,
      output: 'Error',
    });

    const result = await decide([]);

    expect(result.action).toBe('wait');
    expect(result.reason).toContain('Could not parse decision output');
  });
});

describe('decide() - decision object structure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('Clean working tree');
    gh.isConfigured = jest.fn().mockReturnValue(false);
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'wait', prompt: null, reason: 'No work' },
      output: '{"action":"wait","prompt":null,"reason":"No work"}',
    });
  });

  test('always returns object with required fields', async () => {
    const result = await decide([]);

    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('taskId');
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('reason');
    expect(['work', 'wait']).toContain(result.action);
  });

  test('work action includes taskId and prompt', async () => {
    parseTasks.mockReturnValue({
      pending: [{ id: 'TASK-123', desc: 'Test task description' }],
      inProgress: [],
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBe('TASK-123');
    expect(result.prompt).toBe('Test task description');
    expect(result.reason).toBeTruthy();
  });

  test('wait action has null taskId and prompt', async () => {
    const activeWorkers = [
      { id: 'AUTO-111', desc: 'Task 1' },
      { id: 'AUTO-222', desc: 'Task 2' },
    ];

    const result = await decide(activeWorkers);

    expect(result.action).toBe('wait');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toBeNull();
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });

  test('autonomous work action has null taskId but valid prompt', async () => {
    runClaude.mockResolvedValue({
      success: true,
      structured: {
        action: 'work',
        prompt: 'Autonomous task description',
        reason: 'Autonomous reasoning',
      },
      output: '{"action":"work","prompt":"Autonomous task description","reason":"Autonomous reasoning"}',
    });

    const result = await decide([]);

    expect(result.action).toBe('work');
    expect(result.taskId).toBeNull();
    expect(result.prompt).toBe('Autonomous task description');
    expect(result.reason).toBe('Autonomous reasoning');
  });
});

describe('decide() - context gathering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memory.readToday = jest.fn().mockReturnValue('');
    memory.readGoals = jest.fn().mockReturnValue('## Active Goals\n*(No active goals at the moment)*');
    memory.log = jest.fn();
    memory.buildSystemContext = jest.fn().mockReturnValue('System context');
    gitOps.getRepoContext = jest.fn().mockReturnValue('On branch main\nnothing to commit, working tree clean');
    gh.isConfigured = jest.fn().mockReturnValue(false);
    parseTasks.mockReturnValue({ pending: [], inProgress: [] });
    runClaude.mockResolvedValue({
      success: true,
      structured: { action: 'wait', prompt: null, reason: 'Test reason' },
      output: '{"action":"wait","prompt":null,"reason":"Test reason"}',
    });
  });

  test('includes repo context in Claude prompt', async () => {
    await decide([]);

    expect(runClaude).toHaveBeenCalled();
    const claudePrompt = runClaude.mock.calls[0][0];
    expect(claudePrompt).toContain('=== REPO STATE ===');
    expect(claudePrompt).toContain('working tree clean');
  });

  test('includes projects information when projects exist', async () => {
    fs.existsSync = jest.fn((path) => {
      if (path.includes('projects')) return true;
      if (path.includes('agent-tools')) return true;
      return false;
    });
    fs.readdirSync = jest.fn((path) => {
      if (path.includes('projects')) return ['_template', 'agent-tools'];
      return [];
    });
    fs.statSync = jest.fn(() => ({ isDirectory: () => true }));
    fs.readFileSync = jest.fn(() => JSON.stringify({
      name: 'agent-tools',
      description: 'REST API for agent task management',
    }));

    await decide([]);

    const claudePrompt = runClaude.mock.calls[0][0];
    expect(claudePrompt).toContain('=== ACTIVE PROJECTS ===');
    expect(claudePrompt).toContain('agent-tools');
    expect(claudePrompt).toContain('REST API for agent task management');
  });

  test('includes recent log entries in context', async () => {
    memory.readToday = jest.fn().mockReturnValue(`
## Log

- 3:00 pm — Worker spawned: AUTO-123 — Build API tests
- 3:05 pm — Worker done: AUTO-123 — Added 50 tests for API endpoints
- 3:10 pm — Commit: feat: add comprehensive API tests
`);

    await decide([]);

    const claudePrompt = runClaude.mock.calls[0][0];
    expect(claudePrompt).toContain('TODAY\'S LOG');
    expect(claudePrompt).toContain('Worker spawned');
    expect(claudePrompt).toContain('Worker done');
  });

  test('includes pending tasks in context when they exist', async () => {
    parseTasks.mockReturnValue({
      pending: [
        { id: 'TASK-050', desc: 'Implement authentication middleware' },
        { id: 'TASK-051', desc: 'Add comprehensive logging' },
      ],
      inProgress: [
        { id: 'AUTO-999', desc: 'Currently running task' },
      ],
    });

    const result = await decide([{ id: 'AUTO-999', desc: 'Active' }]);

    // Should pick the pending task before calling Claude
    expect(result.action).toBe('work');
    expect(result.taskId).toBe('TASK-050');
    expect(runClaude).not.toHaveBeenCalled();
  });

  test('logs Claude CLI path being used', async () => {
    await decide([]);

    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('using Claude CLI at'));
    expect(memory.log).toHaveBeenCalledWith(expect.stringContaining('claude'));
  });
});
