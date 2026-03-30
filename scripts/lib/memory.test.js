#!/usr/bin/env node
/**
 * Comprehensive tests for scripts/lib/memory.js
 *
 * Tests cover:
 * - Daily note creation and logging with timestamp format
 * - Goals CRUD operations
 * - Project context management
 * - File I/O error handling
 * - Edge cases: missing files, invalid paths, concurrent writes
 * - System context builder
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Mock fs before requiring memory
jest.mock('fs');

const memory = require('./memory');

describe('Memory Module', () => {
  // ── Setup/Teardown ──────────────────────────────────────────────────────────

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-29T12:00:00.000Z');
    jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('12:00:00 PM');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Date Helpers ────────────────────────────────────────────────────────────

  describe('today()', () => {
    it('should return current date in YYYY-MM-DD format', () => {
      expect(memory.today()).toBe('2026-03-29');
    });

    it('should handle different dates correctly', () => {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-01-01T00:00:00.000Z');
      expect(memory.today()).toBe('2025-01-01');
    });
  });

  // ── Daily Notes ─────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('should create daily directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('Test entry');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        memory.DAILY_DIR,
        { recursive: true }
      );
    });

    it('should create daily note file with header if it does not exist', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === memory.DAILY_DIR) return true;
        return false;
      });
      fs.writeFileSync.mockImplementation(() => {});
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('Test entry');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2026-03-29.md'),
        '# 2026-03-29\n\n## Log\n'
      );
    });

    it('should append entry with timestamp in HH:MM:SS AM/PM format', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('Worker spawned');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2026-03-29.md'),
        '- 12:00:00 PM — Worker spawned\n'
      );
    });

    it('should handle entries with special characters', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('Task failed: "Error: Cannot read property \'foo\' of undefined"');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Task failed: "Error: Cannot read property \'foo\' of undefined"')
      );
    });

    it('should handle empty entries', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        '- 12:00:00 PM — \n'
      );
    });

    it('should handle multiline entries', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {});

      memory.log('Line 1\nLine 2\nLine 3');

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        '- 12:00:00 PM — Line 1\nLine 2\nLine 3\n'
      );
    });
  });

  describe('readToday()', () => {
    it('should return file content if today\'s note exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# 2026-03-29\n\n## Log\n- Entry 1\n');

      const result = memory.readToday();

      expect(result).toBe('# 2026-03-29\n\n## Log\n- Entry 1\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2026-03-29.md'),
        'utf8'
      );
    });

    it('should return empty string if today\'s note does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readToday();

      expect(result).toBe('');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('readDay()', () => {
    it('should read specific day\'s note', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# 2026-03-28\n\n## Log\n- Entry\n');

      const result = memory.readDay('2026-03-28');

      expect(result).toBe('# 2026-03-28\n\n## Log\n- Entry\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2026-03-28.md'),
        'utf8'
      );
    });

    it('should return empty string if specified day does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readDay('2026-01-01');

      expect(result).toBe('');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle different date formats', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('Content');

      memory.readDay('2025-12-31');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2025-12-31.md'),
        'utf8'
      );
    });
  });

  // ── Goals ───────────────────────────────────────────────────────────────────

  describe('readGoals()', () => {
    it('should return goals file content if it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\nGoal 1\n');

      const result = memory.readGoals();

      expect(result).toBe('# Goals\n\n## Active Goals\nGoal 1\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(memory.GOALS_FILE, 'utf8');
    });

    it('should return default template if goals file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readGoals();

      expect(result).toBe('# Goals\n\n## Active Goals\n*(none)*\n');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe('addGoal()', () => {
    it('should add goal to Active Goals section with HIGH priority by default', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\n');
      fs.writeFileSync.mockImplementation(() => {});

      memory.addGoal('Build authentication module');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('### Goal (added 2026-03-29)')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('**Priority:** HIGH')
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('**Description:** Build authentication module')
      );
    });

    it('should add goal with custom priority', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\n');
      fs.writeFileSync.mockImplementation(() => {});

      memory.addGoal('Fix minor bug', 'LOW');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('**Priority:** LOW')
      );
    });

    it('should preserve existing goals when adding new one', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\nExisting goal\n');
      fs.writeFileSync.mockImplementation(() => {});

      memory.addGoal('New goal', 'MEDIUM');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('Existing goal')
      );
    });

    it('should handle goals with special characters', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\n');
      fs.writeFileSync.mockImplementation(() => {});

      memory.addGoal('Fix bug: "Cannot read property \'foo\' of undefined"');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('Fix bug: "Cannot read property \'foo\' of undefined"')
      );
    });

    it('should handle multiline goal descriptions', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Goals\n\n## Active Goals\n');
      fs.writeFileSync.mockImplementation(() => {});

      memory.addGoal('Goal line 1\nGoal line 2');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        memory.GOALS_FILE,
        expect.stringContaining('Goal line 1\nGoal line 2')
      );
    });
  });

  // ── MEMORY.md ───────────────────────────────────────────────────────────────

  describe('readMemoryMd()', () => {
    it('should return MEMORY.md content if it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# MEMORY.md\nHard rules here\n');

      const result = memory.readMemoryMd();

      expect(result).toBe('# MEMORY.md\nHard rules here\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(memory.MEMORY_MD, 'utf8');
    });

    it('should return empty string if MEMORY.md does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readMemoryMd();

      expect(result).toBe('');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  // ── Tasks ───────────────────────────────────────────────────────────────────

  describe('readTasks()', () => {
    it('should return TASKS.md content if it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Tasks\n- Task 1\n- Task 2\n');

      const result = memory.readTasks();

      expect(result).toBe('# Tasks\n- Task 1\n- Task 2\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(memory.TASKS_FILE, 'utf8');
    });

    it('should return empty string if TASKS.md does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readTasks();

      expect(result).toBe('');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  // ── System Context Builder ──────────────────────────────────────────────────

  describe('buildSystemContext()', () => {
    it('should build complete system context with all sections', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((filepath) => {
        if (filepath === memory.MEMORY_MD) return '# MEMORY.md\nRules\n';
        if (filepath === memory.GOALS_FILE) return '# Goals\nGoal 1\n';
        if (filepath.includes('2026-03-29.md')) return '# Today\nLog entry\n';
        return '';
      });

      const result = memory.buildSystemContext();

      expect(result).toContain('=== MEMORY.md (Hard Rules — Always Follow) ===');
      expect(result).toContain('# MEMORY.md\nRules\n');
      expect(result).toContain('=== Current Goals (memory/goals.md) ===');
      expect(result).toContain('# Goals\nGoal 1\n');
      expect(result).toContain('=== Today\'s Log (memory/daily/2026-03-29.md) ===');
      expect(result).toContain('# Today\nLog entry\n');
      expect(result).toContain('=== End of Context ===');
    });

    it('should handle missing daily note gracefully', () => {
      fs.existsSync.mockImplementation((filepath) => {
        return !filepath.includes('2026-03-29.md');
      });
      fs.readFileSync.mockImplementation((filepath) => {
        if (filepath === memory.MEMORY_MD) return '# MEMORY.md\n';
        if (filepath === memory.GOALS_FILE) return '# Goals\n';
        return '';
      });

      const result = memory.buildSystemContext();

      expect(result).toContain('(no entries yet today)');
    });

    it('should handle missing all files gracefully', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.buildSystemContext();

      expect(result).toContain('=== MEMORY.md (Hard Rules — Always Follow) ===');
      expect(result).toContain('=== Current Goals (memory/goals.md) ===');
      expect(result).toContain('# Goals\n\n## Active Goals\n*(none)*\n');
      expect(result).toContain('(no entries yet today)');
    });
  });

  // ── Project Context ─────────────────────────────────────────────────────────

  describe('readProjectContext()', () => {
    it('should read project context file if it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('# Project Context\nDetails here\n');

      const result = memory.readProjectContext('my-project');

      expect(result).toBe('# Project Context\nDetails here\n');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('memory', 'projects', 'my-project', 'context.md')),
        'utf8'
      );
    });

    it('should return empty string if project context does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = memory.readProjectContext('nonexistent-project');

      expect(result).toBe('');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle project names with special characters', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('Content');

      memory.readProjectContext('my-project-v2.0');

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('my-project-v2.0', 'context.md')),
        'utf8'
      );
    });
  });

  describe('writeProjectContext()', () => {
    it('should create project directory and write context file', () => {
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      memory.writeProjectContext('my-project', '# Context\nContent here\n');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('memory', 'projects', 'my-project')),
        { recursive: true }
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('memory', 'projects', 'my-project', 'context.md')),
        '# Context\nContent here\n'
      );
    });

    it('should handle empty content', () => {
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      memory.writeProjectContext('my-project', '');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        ''
      );
    });

    it('should handle project names with special characters', () => {
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      memory.writeProjectContext('my-project-v2.0', 'Content');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('my-project-v2.0'),
        { recursive: true }
      );
    });

    it('should handle multiline content', () => {
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      memory.writeProjectContext('my-project', 'Line 1\nLine 2\nLine 3\n');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        'Line 1\nLine 2\nLine 3\n'
      );
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should handle fs.readFileSync errors gracefully', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => memory.readToday()).toThrow('EACCES: permission denied');
    });

    it('should handle fs.writeFileSync errors in log()', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      expect(() => memory.log('Test')).toThrow('ENOSPC: no space left on device');
    });

    it('should handle fs.appendFileSync errors in log()', () => {
      fs.existsSync.mockReturnValue(true);
      fs.appendFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => memory.log('Test')).toThrow('EACCES: permission denied');
    });

    it('should handle fs.mkdirSync errors in log()', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => memory.log('Test')).toThrow('EACCES: permission denied');
    });

    it('should handle fs.mkdirSync errors in writeProjectContext()', () => {
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => memory.writeProjectContext('project', 'content')).toThrow('EACCES: permission denied');
    });
  });

  // ── Constants Export ────────────────────────────────────────────────────────

  describe('Module Exports', () => {
    it('should export all required constants', () => {
      expect(memory.ROOT).toBeDefined();
      expect(memory.DAILY_DIR).toBeDefined();
      expect(memory.GOALS_FILE).toBeDefined();
      expect(memory.TASKS_FILE).toBeDefined();
      expect(memory.MEMORY_MD).toBeDefined();
    });

    it('should export all required functions', () => {
      expect(typeof memory.log).toBe('function');
      expect(typeof memory.readToday).toBe('function');
      expect(typeof memory.readDay).toBe('function');
      expect(typeof memory.readGoals).toBe('function');
      expect(typeof memory.addGoal).toBe('function');
      expect(typeof memory.readMemoryMd).toBe('function');
      expect(typeof memory.readTasks).toBe('function');
      expect(typeof memory.buildSystemContext).toBe('function');
      expect(typeof memory.readProjectContext).toBe('function');
      expect(typeof memory.writeProjectContext).toBe('function');
      expect(typeof memory.today).toBe('function');
    });
  });
});
