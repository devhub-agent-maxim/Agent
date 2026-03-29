#!/usr/bin/env node
/**
 * Comprehensive Jest tests for scripts/lib/git-ops.js
 *
 * Tests cover:
 * - getStatus() with various git states
 * - getBranch() and branch detection
 * - commitAll() with success/failure scenarios
 * - getDiff() with staged/unstaged changes
 * - getRecentLog() with different commit counts
 * - push() with upstream configuration
 * - Edge cases: failures, empty repos, blocked files
 */

'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

// Mock dependencies before requiring git-ops
jest.mock('child_process');
jest.mock('fs');

const gitOps = require('./git-ops');

describe('git-ops', () => {
  let execSyncMock;
  let spawnSyncMock;
  let existsSyncMock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock execSync
    execSyncMock = jest.spyOn(childProcess, 'execSync');

    // Mock spawnSync
    spawnSyncMock = jest.spyOn(childProcess, 'spawnSync');

    // Mock fs.existsSync
    existsSyncMock = jest.spyOn(fs, 'existsSync');
    existsSyncMock.mockReturnValue(true); // Default: all files exist
  });

  // ── getStatus() ────────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should return empty array for clean working tree', () => {
      execSyncMock.mockReturnValue('');

      const status = gitOps.getStatus();

      expect(status).toEqual([]);
      expect(execSyncMock).toHaveBeenCalledWith(
        'git status --porcelain',
        expect.objectContaining({ encoding: 'utf8' })
      );
    });

    it('should parse modified files', () => {
      execSyncMock.mockReturnValue(' M  scripts/agent.js\n M  memory/daily/2026-03-29.md');

      const status = gitOps.getStatus();

      expect(status).toEqual([
        { status: 'M', file: 'scripts/agent.js' },
        { status: 'M', file: 'memory/daily/2026-03-29.md' },
      ]);
    });

    it('should parse untracked files', () => {
      execSyncMock.mockReturnValue('?? new-file.js\n?? test.md');

      const status = gitOps.getStatus();

      expect(status).toEqual([
        { status: '??', file: 'new-file.js' },
        { status: '??', file: 'test.md' },
      ]);
    });

    it('should parse deleted files', () => {
      execSyncMock.mockReturnValue(' D  old-file.js');

      const status = gitOps.getStatus();

      expect(status).toEqual([
        { status: 'D', file: 'old-file.js' },
      ]);
    });

    it('should filter out .env files', () => {
      execSyncMock.mockReturnValue(' M  .env\n M  .env.local\n M  .env.production\n M  config.js');
      existsSyncMock.mockReturnValue(true);

      const status = gitOps.getStatus();

      // Should only include config.js, not any .env files
      expect(status.length).toBe(1);
      expect(status[0].file).toBe('config.js');
    });

    it('should filter out node_modules', () => {
      execSyncMock.mockReturnValue(' M  node_modules/package/index.js\n M  src/index.js');
      existsSyncMock.mockReturnValue(true);

      const status = gitOps.getStatus();

      expect(status.length).toBe(1);
      expect(status[0].file).toBe('src/index.js');
    });

    it('should filter out garbage artifact files', () => {
      execSyncMock.mockReturnValue('?? {,\n?? (i.relevanceScore\n?? scripts/agent.js');
      existsSyncMock.mockReturnValue(true);

      const status = gitOps.getStatus();

      expect(status.length).toBe(1);
      expect(status[0].file).toBe('scripts/agent.js');
    });

    it('should handle quoted file paths', () => {
      execSyncMock.mockReturnValue(' M  "path with spaces/file.js"');

      const status = gitOps.getStatus();

      expect(status).toEqual([
        { status: 'M', file: 'path with spaces/file.js' },
      ]);
    });

    it('should filter out non-existent files', () => {
      execSyncMock.mockReturnValue(' M  real-file.js\n M  ghost-file.js');
      existsSyncMock.mockImplementation((filePath) => {
        return !filePath.includes('ghost-file.js');
      });

      const status = gitOps.getStatus();

      expect(status.length).toBe(1);
      expect(status[0].file).toBe('real-file.js');
    });
  });

  // ── hasChanges() ───────────────────────────────────────────────────────────────

  describe('hasChanges()', () => {
    it('should return false for clean working tree', () => {
      execSyncMock.mockReturnValue('');

      expect(gitOps.hasChanges()).toBe(false);
    });

    it('should return true when there are changes', () => {
      execSyncMock.mockReturnValue(' M scripts/agent.js');

      expect(gitOps.hasChanges()).toBe(true);
    });
  });

  // ── getDiff() ──────────────────────────────────────────────────────────────────

  describe('getDiff()', () => {
    it('should return empty string when no changes', () => {
      execSyncMock.mockReturnValue('');

      const diff = gitOps.getDiff();

      expect(diff).toBe('');
      expect(execSyncMock).toHaveBeenCalledWith('git diff --cached', expect.any(Object));
      expect(execSyncMock).toHaveBeenCalledWith('git diff', expect.any(Object));
    });

    it('should return staged changes', () => {
      execSyncMock
        .mockReturnValueOnce('diff --git a/file.js b/file.js\n+console.log("test");')
        .mockReturnValueOnce('');

      const diff = gitOps.getDiff();

      expect(diff).toContain('diff --git a/file.js');
      expect(diff).toContain('+console.log("test");');
    });

    it('should return unstaged changes', () => {
      execSyncMock
        .mockReturnValueOnce('')
        .mockReturnValueOnce('diff --git a/file.js b/file.js\n+console.log("unstaged");');

      const diff = gitOps.getDiff();

      expect(diff).toContain('diff --git a/file.js');
      expect(diff).toContain('+console.log("unstaged");');
    });

    it('should combine staged and unstaged changes', () => {
      execSyncMock
        .mockReturnValueOnce('diff --git a/staged.js\n+staged change')
        .mockReturnValueOnce('diff --git a/unstaged.js\n+unstaged change');

      const diff = gitOps.getDiff();

      expect(diff).toContain('staged.js');
      expect(diff).toContain('unstaged.js');
    });

    it('should truncate diff at 8000 characters', () => {
      const longDiff = 'a'.repeat(10000);
      execSyncMock.mockReturnValue(longDiff);

      const diff = gitOps.getDiff();

      expect(diff.length).toBe(8000);
    });
  });

  // ── getRecentLog() ─────────────────────────────────────────────────────────────

  describe('getRecentLog()', () => {
    it('should return recent commits with default count', () => {
      execSyncMock.mockReturnValue('abc123 feat: add feature\ndef456 fix: bug fix');

      const log = gitOps.getRecentLog();

      expect(log).toContain('abc123 feat: add feature');
      expect(execSyncMock).toHaveBeenCalledWith('git log --oneline -5', expect.any(Object));
    });

    it('should respect custom commit count', () => {
      execSyncMock.mockReturnValue('abc123 commit 1\ndef456 commit 2\nghi789 commit 3');

      gitOps.getRecentLog(3);

      expect(execSyncMock).toHaveBeenCalledWith('git log --oneline -3', expect.any(Object));
    });

    it('should return empty string for new repository', () => {
      execSyncMock.mockReturnValue('');

      const log = gitOps.getRecentLog();

      expect(log).toBe('');
    });

    it('should handle single commit', () => {
      execSyncMock.mockReturnValue('abc123 Initial commit');

      const log = gitOps.getRecentLog(10);

      expect(log).toBe('abc123 Initial commit');
    });
  });

  // ── getBranch() ────────────────────────────────────────────────────────────────

  describe('getBranch()', () => {
    it('should return current branch name', () => {
      execSyncMock.mockReturnValue('main');

      const branch = gitOps.getBranch();

      expect(branch).toBe('main');
      expect(execSyncMock).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        expect.any(Object)
      );
    });

    it('should return feature branch name', () => {
      execSyncMock.mockReturnValue('claude/serene-lamarr');

      const branch = gitOps.getBranch();

      expect(branch).toBe('claude/serene-lamarr');
    });

    it('should handle detached HEAD', () => {
      execSyncMock.mockReturnValue('HEAD');

      const branch = gitOps.getBranch();

      expect(branch).toBe('HEAD');
    });
  });

  // ── commitAll() ────────────────────────────────────────────────────────────────

  describe('commitAll()', () => {
    beforeEach(() => {
      // Default mocks for successful commit
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) {
          return ' M  scripts/agent.js';
        }
        if (cmd.includes('git diff --cached --name-only')) {
          return 'scripts/agent.js';
        }
        if (cmd.includes('git rev-parse --short HEAD')) {
          return 'abc123';
        }
        if (cmd.includes('git add')) {
          return '';
        }
        return '';
      });

      spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    });

    it('should commit changes successfully', () => {
      const result = gitOps.commitAll('test: commit message');

      expect(result.success).toBe(true);
      expect(result.sha).toBe('abc123');
      expect(result.files).toEqual(['scripts/agent.js']);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'git',
        ['commit', '-m', 'test: commit message'],
        expect.any(Object)
      );
    });

    it('should return error when no changes', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) return '';
        return '';
      });

      const result = gitOps.commitAll('test: commit');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No changes to commit');
    });

    it('should return error when nothing staged after filtering', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) {
          return ' M  .env';
        }
        if (cmd.includes('git diff --cached --name-only')) {
          return '';
        }
        return '';
      });

      const result = gitOps.commitAll('test: commit');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nothing staged after filtering');
    });

    it('should handle commit hook failure', () => {
      spawnSyncMock.mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'pre-commit hook failed',
      });

      const result = gitOps.commitAll('test: commit');

      expect(result.success).toBe(false);
      expect(result.error).toContain('pre-commit hook failed');
    });

    it('should stage multiple files', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) {
          return ' M  file1.js\n M  file2.js';
        }
        if (cmd.includes('git diff --cached --name-only')) {
          return 'file1.js\nfile2.js';
        }
        if (cmd.includes('git rev-parse --short HEAD')) {
          return 'abc123';
        }
        return '';
      });

      const result = gitOps.commitAll('test: multi-file commit');

      expect(result.success).toBe(true);
      expect(result.files).toEqual(['file1.js', 'file2.js']);
    });

    it('should filter blocked files before staging', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) {
          return ' M  .env\n M  config.js';
        }
        if (cmd.includes('git add')) {
          // Only config.js should be added, not .env
          expect(cmd).not.toContain('.env');
          return '';
        }
        if (cmd.includes('git diff --cached --name-only')) {
          return 'config.js';
        }
        if (cmd.includes('git rev-parse --short HEAD')) {
          return 'abc123';
        }
        return '';
      });

      const result = gitOps.commitAll('test: filtered commit');

      expect(result.success).toBe(true);
      expect(result.files).toEqual(['config.js']);
    });

    it('should handle commit with stdout message', () => {
      spawnSyncMock.mockReturnValue({
        status: 1,
        stdout: 'nothing to commit, working tree clean',
        stderr: '',
      });

      const result = gitOps.commitAll('test: commit');

      expect(result.success).toBe(false);
      expect(result.error).toContain('nothing to commit');
    });
  });

  // ── push() ─────────────────────────────────────────────────────────────────────

  describe('push()', () => {
    beforeEach(() => {
      execSyncMock.mockReturnValue('main');
    });

    it('should push successfully', () => {
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });

      const result = gitOps.push();

      expect(result.success).toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'git',
        ['push', 'origin', 'main'],
        expect.any(Object)
      );
    });

    it('should handle push failure', () => {
      spawnSyncMock.mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error: failed to push',
      });

      const result = gitOps.push();

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed to push');
    });

    it('should auto-set upstream when no upstream configured', () => {
      spawnSyncMock
        .mockReturnValueOnce({
          status: 1,
          stderr: 'fatal: The current branch has no upstream branch',
        })
        .mockReturnValueOnce({
          status: 0,
          stdout: '',
          stderr: '',
        });

      const result = gitOps.push();

      expect(result.success).toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'git',
        ['push', '--set-upstream', 'origin', 'main'],
        expect.any(Object)
      );
    });

    it('should handle upstream set failure', () => {
      spawnSyncMock
        .mockReturnValueOnce({
          status: 1,
          stderr: 'fatal: no upstream branch',
        })
        .mockReturnValueOnce({
          status: 1,
          stderr: 'error: failed to set upstream',
        });

      const result = gitOps.push();

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed to set upstream');
    });

    it('should push feature branch', () => {
      execSyncMock.mockReturnValue('claude/serene-lamarr');
      spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });

      gitOps.push();

      expect(spawnSyncMock).toHaveBeenCalledWith(
        'git',
        ['push', 'origin', 'claude/serene-lamarr'],
        expect.any(Object)
      );
    });
  });

  // ── getRepoContext() ───────────────────────────────────────────────────────────

  describe('getRepoContext()', () => {
    beforeEach(() => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) {
          return ' M  scripts/agent.js';
        }
        if (cmd.includes('git log --oneline')) {
          return 'abc123 feat: add feature\ndef456 fix: bug';
        }
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) {
          return 'main';
        }
        return '';
      });

      jest.spyOn(fs, 'readdirSync').mockReturnValue(['agent-tools', 'agent-dashboard']);
    });

    it('should return complete repo context', () => {
      const context = gitOps.getRepoContext();

      expect(context).toContain('Branch: main');
      expect(context).toContain('abc123 feat: add feature');
      expect(context).toContain('M scripts/agent.js');
      expect(context).toContain('agent-tools, agent-dashboard');
    });

    it('should handle no changes', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) return '';
        if (cmd.includes('git log --oneline')) return 'abc123 commit';
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) return 'main';
        return '';
      });

      const context = gitOps.getRepoContext();

      expect(context).toContain('Changed files: (none)');
    });

    it('should handle no commits', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git status --porcelain')) return '';
        if (cmd.includes('git log --oneline')) return '';
        if (cmd.includes('git rev-parse --abbrev-ref HEAD')) return 'main';
        return '';
      });

      const context = gitOps.getRepoContext();

      expect(context).toContain('Recent commits:\n(none)');
    });

    it('should handle no projects', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const context = gitOps.getRepoContext();

      expect(context).toContain('Projects: (none yet)');
    });

    it('should filter out _template project', () => {
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['_template', 'agent-tools']);

      const context = gitOps.getRepoContext();

      expect(context).toContain('agent-tools');
      expect(context).not.toContain('_template');
    });

    it('should handle missing projects directory', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const context = gitOps.getRepoContext();

      expect(context).toContain('Projects: (none yet)');
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle git command timeout', () => {
      execSyncMock.mockImplementation(() => {
        const error = new Error('Command timed out');
        error.stdout = 'partial output';
        throw error;
      });

      const status = gitOps.getStatus();

      // Should return empty array on error
      expect(status).toEqual([]);
    });

    it('should handle empty repository (no commits)', () => {
      execSyncMock.mockImplementation((cmd) => {
        if (cmd.includes('git log')) return '';
        if (cmd.includes('git status')) return '';
        if (cmd.includes('git rev-parse')) return 'main';
        return '';
      });

      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);

      expect(() => gitOps.getRecentLog()).not.toThrow();
      expect(() => gitOps.getRepoContext()).not.toThrow();
    });

    it('should handle merge conflict state', () => {
      execSyncMock.mockReturnValue('UU conflict-file.js\n M normal-file.js');

      const status = gitOps.getStatus();

      expect(status).toContainEqual({ status: 'UU', file: 'conflict-file.js' });
      expect(status).toContainEqual({ status: 'M', file: 'normal-file.js' });
    });

    it('should handle special characters in file names', () => {
      execSyncMock.mockReturnValue(' M  "file with spaces.js"\n M  file-with-dashes.js');

      const status = gitOps.getStatus();

      expect(status).toContainEqual({ status: 'M', file: 'file with spaces.js' });
      expect(status).toContainEqual({ status: 'M', file: 'file-with-dashes.js' });
    });

    it('should handle extremely long file paths', () => {
      const longPath = 'a/'.repeat(50) + 'file.js';
      execSyncMock.mockReturnValue(` M ${longPath}`);

      const status = gitOps.getStatus();

      expect(status).toContainEqual({ status: 'M', file: longPath });
    });
  });
});
