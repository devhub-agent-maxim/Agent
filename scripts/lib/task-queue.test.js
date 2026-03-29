#!/usr/bin/env node
/**
 * Jest tests for task-queue.js
 * Comprehensive coverage of task queue operations, file persistence, and edge cases.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const taskQueue = require('./task-queue');

// Mock fs module
jest.mock('fs');

describe('task-queue', () => {
  const testFile = '/test/memory/TASKS.md';
  const emptyQueue =
    '# Task Queue\n\n' +
    '## 🔄 In Progress\n\n' +
    '## 📋 Pending\n\n' +
    '## ✅ Completed\n';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: file doesn't exist
    fs.existsSync.mockReturnValue(false);
  });

  describe('parseTasks', () => {
    it('should create file with empty queue if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      const result = taskQueue.parseTasks(testFile);

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(testFile), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(testFile, emptyQueue);
      expect(result).toEqual({ inProgress: [], pending: [], completed: [] });
    });

    it('should parse empty queue file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(emptyQueue);

      const result = taskQueue.parseTasks(testFile);

      expect(result).toEqual({ inProgress: [], pending: [], completed: [] });
    });

    it('should parse tasks in all sections', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature *(started: 2026-03-29 16:00)*\n' +
        '- [ ] TASK-002 | Fix bug\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-003 | [deploy] Deploy to production\n' +
        '- [ ] TASK-004 | Write tests\n\n' +
        '## ✅ Completed\n' +
        '- [x] TASK-000 | Setup project *(done: 2026-03-29 15:00)*\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.inProgress).toHaveLength(2);
      expect(result.pending).toHaveLength(2);
      expect(result.completed).toHaveLength(1);
      expect(result.inProgress[0].id).toBe('TASK-001');
      expect(result.inProgress[0].desc).toBe('Build feature');
      expect(result.pending[0].tag).toBe('deploy');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content =
        '# Task Queue\r\n\r\n' +
        '## 🔄 In Progress\r\n\r\n' +
        '## 📋 Pending\r\n' +
        '- [ ] TASK-001 | Test task\r\n\r\n' +
        '## ✅ Completed\r\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].id).toBe('TASK-001');
    });

    it('should extract project name from task description', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-001 | AgentTools: Add authentication\n' +
        '- [ ] TASK-002 | No project here\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.pending[0].projectName).toBe('AgentTools');
      expect(result.pending[1].projectName).toBeNull();
    });

    it('should strip metadata from task descriptions', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature *(started: 2026-03-29)*\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n' +
        '- [x] TASK-002 | Done task *(done: 2026-03-29)*\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.inProgress[0].desc).toBe('Build feature');
      expect(result.completed[0].desc).toBe('Done task');
    });
  });

  describe('addTask', () => {
    it('should create file and add first task', () => {
      fs.existsSync.mockReturnValue(false);
      fs.writeFileSync.mockImplementation(() => {});

      const taskId = taskQueue.addTask(testFile, 'New task');

      expect(taskId).toBe('TASK-001');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('- [ ] TASK-001 | New task')
      );
    });

    it('should add task to pending section with incremented ID', () => {
      const existingContent =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-005 | Existing task\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(existingContent);
      fs.writeFileSync.mockImplementation(() => {});

      const taskId = taskQueue.addTask(testFile, 'New task');

      expect(taskId).toBe('TASK-006');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('- [ ] TASK-006 | New task')
      );
    });

    it('should add task with explicit tag', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(emptyQueue);
      fs.writeFileSync.mockImplementation(() => {});

      taskQueue.addTask(testFile, 'Deploy to prod', 'deploy');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('- [ ] TASK-001 | [deploy] Deploy to prod')
      );
    });

    it('should not add tag if description already has one', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(emptyQueue);
      fs.writeFileSync.mockImplementation(() => {});

      taskQueue.addTask(testFile, '[qa] Test feature', 'deploy');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('- [ ] TASK-001 | [qa] Test feature')
      );
    });

    it('should ignore invalid tags', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(emptyQueue);
      fs.writeFileSync.mockImplementation(() => {});

      taskQueue.addTask(testFile, 'Some task', 'invalid');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('- [ ] TASK-001 | Some task')
      );
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        testFile,
        expect.stringContaining('[invalid]')
      );
    });
  });

  describe('markInProgress', () => {
    it('should move task from pending to in progress', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-001 | Build feature\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = { id: 'TASK-001', desc: 'Build feature', raw: '- [ ] TASK-001 | Build feature' };
      taskQueue.markInProgress(testFile, task);

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('## 🔄 In Progress\n- [ ] TASK-001 | Build feature *(started:');
      expect(writtenContent).not.toContain('## 📋 Pending\n- [ ] TASK-001');
    });

    it('should add timestamp to task', () => {
      const content = emptyQueue;
      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = { id: 'TASK-001', desc: 'Build feature', raw: '' };
      taskQueue.markInProgress(testFile, task);

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toMatch(/\*\(started: .+\)\*/);
    });
  });

  describe('markCompleted', () => {
    it('should move task from in progress to completed', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = { id: 'TASK-001', desc: 'Build feature' };
      taskQueue.markCompleted(testFile, task);

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('## ✅ Completed\n- [x] TASK-001 | Build feature *(done:');
      expect(writtenContent).not.toContain('## 🔄 In Progress\n- [ ] TASK-001');
    });

    it('should mark checkbox as completed', () => {
      const content = emptyQueue;
      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = { id: 'TASK-001', desc: 'Build feature' };
      taskQueue.markCompleted(testFile, task);

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toMatch(/- \[x\] TASK-001/);
      expect(writtenContent).toMatch(/\*\(done: .+\)\*/);
    });

    it('should preserve task tag when completing', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | [deploy] Deploy to production\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = { id: 'TASK-001', desc: '[deploy] Deploy to production' };
      taskQueue.markCompleted(testFile, task);

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('[deploy] Deploy to production');
    });
  });

  describe('markBlocked', () => {
    it('should annotate task with blocked reason', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = {
        id: 'TASK-001',
        desc: 'Build feature',
        raw: '- [ ] TASK-001 | Build feature'
      };
      taskQueue.markBlocked(testFile, task, 'waiting for API');

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toMatch(/\*\(blocked: waiting for API — .+\)\*/);
    });

    it('should leave task in current section when marking blocked', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = {
        id: 'TASK-001',
        desc: 'Build feature',
        raw: '- [ ] TASK-001 | Build feature'
      };
      taskQueue.markBlocked(testFile, task, 'waiting for API');

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('## 🔄 In Progress\n- [ ] TASK-001');
    });

    it('should handle task when raw line does not match', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Build feature *(started: 2026-03-29)*\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const task = {
        id: 'TASK-001',
        desc: 'Build feature',
        raw: '- [ ] TASK-001 | Build feature' // raw doesn't match actual line
      };
      taskQueue.markBlocked(testFile, task, 'waiting');

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toMatch(/TASK-001.*\*\(blocked: waiting/);
    });
  });

  describe('getNextPending', () => {
    it('should return first pending task', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-003 | First task\n' +
        '- [ ] TASK-004 | Second task\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const next = taskQueue.getNextPending(testFile);

      expect(next).not.toBeNull();
      expect(next.id).toBe('TASK-003');
      expect(next.desc).toBe('First task');
    });

    it('should return null when no pending tasks', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | In progress\n\n' +
        '## 📋 Pending\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const next = taskQueue.getNextPending(testFile);

      expect(next).toBeNull();
    });

    it('should return null for completely empty queue', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {});
      fs.writeFileSync.mockImplementation(() => {});

      const next = taskQueue.getNextPending(testFile);

      expect(next).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle tasks with special characters in description', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-001 | Fix bug: "quotes" & <brackets> (parentheses)\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.pending[0].desc).toContain('"quotes"');
      expect(result.pending[0].desc).toContain('&');
      expect(result.pending[0].desc).toContain('<brackets>');
    });

    it('should handle very large task IDs', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-999 | Existing\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);
      fs.writeFileSync.mockImplementation(() => {});

      const taskId = taskQueue.addTask(testFile, 'New task');

      expect(taskId).toBe('TASK-1000');
    });

    it('should handle multiple tasks with same description', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n' +
        '- [ ] TASK-001 | Fix bug\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-002 | Fix bug\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.inProgress).toHaveLength(1);
      expect(result.pending).toHaveLength(1);
      expect(result.inProgress[0].id).toBe('TASK-001');
      expect(result.pending[0].id).toBe('TASK-002');
    });

    it('should handle task with no description after ID', () => {
      const content =
        '# Task Queue\n\n' +
        '## 🔄 In Progress\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-001 |\n\n' +
        '## ✅ Completed\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      // Should not parse invalid task line
      expect(result.pending).toHaveLength(0);
    });

    it('should handle empty lines and whitespace', () => {
      const content =
        '# Task Queue\n\n\n' +
        '## 🔄 In Progress\n\n\n\n' +
        '## 📋 Pending\n' +
        '- [ ] TASK-001 | Task one\n' +
        '\n' +
        '- [ ] TASK-002 | Task two\n\n\n' +
        '## ✅ Completed\n\n';

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      const result = taskQueue.parseTasks(testFile);

      expect(result.pending).toHaveLength(2);
    });
  });

  describe('Task lifecycle integration', () => {
    it('should support full task lifecycle: add -> in progress -> completed', () => {
      let currentContent = emptyQueue;

      // Setup mocks to track file content changes
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => currentContent);
      fs.writeFileSync.mockImplementation((file, content) => {
        currentContent = content;
      });

      // Add task
      const taskId = taskQueue.addTask(testFile, 'Build feature');
      expect(taskId).toBe('TASK-001');

      // Parse to get task object
      let parsed = taskQueue.parseTasks(testFile);
      expect(parsed.pending).toHaveLength(1);

      // Mark in progress
      taskQueue.markInProgress(testFile, parsed.pending[0]);
      parsed = taskQueue.parseTasks(testFile);
      expect(parsed.inProgress).toHaveLength(1);
      expect(parsed.pending).toHaveLength(0);

      // Mark completed
      taskQueue.markCompleted(testFile, parsed.inProgress[0]);
      parsed = taskQueue.parseTasks(testFile);
      expect(parsed.completed).toHaveLength(1);
      expect(parsed.inProgress).toHaveLength(0);
    });

    it('should support blocking a task in progress', () => {
      let currentContent = emptyQueue;

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => currentContent);
      fs.writeFileSync.mockImplementation((file, content) => {
        currentContent = content;
      });

      // Add and start task
      taskQueue.addTask(testFile, 'Build feature');
      let parsed = taskQueue.parseTasks(testFile);
      taskQueue.markInProgress(testFile, parsed.pending[0]);

      // Block task
      parsed = taskQueue.parseTasks(testFile);
      taskQueue.markBlocked(testFile, parsed.inProgress[0], 'waiting for review');

      // Task should still be in progress but marked blocked
      const finalContent = currentContent;
      expect(finalContent).toContain('## 🔄 In Progress');
      expect(finalContent).toContain('*(blocked: waiting for review');
    });
  });
});
