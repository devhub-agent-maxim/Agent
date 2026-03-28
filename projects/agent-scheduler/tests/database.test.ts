import { initDatabase, getDatabase, closeDatabase } from '../src/db/database';
import { SchedulesRepository } from '../src/db/schedules-repository';
import fs from 'fs';
import path from 'path';

describe('Database', () => {
  const testDbPath = path.join(__dirname, 'test-scheduler.db');

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await initDatabase(testDbPath);
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize database and create tables', () => {
    const db = getDatabase();
    expect(db).toBeDefined();

    // Check that the scheduled_tasks table exists
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].values.length).toBe(1);
  });

  it('should throw error when getting database before initialization', () => {
    closeDatabase();
    expect(() => getDatabase()).toThrow('Database not initialized');
  });
});

describe('SchedulesRepository', () => {
  const testDbPath = path.join(__dirname, 'test-scheduler.db');
  let repository: SchedulesRepository;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await initDatabase(testDbPath);
    repository = new SchedulesRepository();
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('create', () => {
    it('should create a new scheduled task', () => {
      const task = repository.create({
        name: 'Test Task',
        cron_expression: '0 * * * *',
        command: 'echo "test"',
      });

      expect(task.id).toBeDefined();
      expect(task.name).toBe('Test Task');
      expect(task.cron_expression).toBe('0 * * * *');
      expect(task.command).toBe('echo "test"');
      expect(task.enabled).toBe(1);
      expect(task.created_at).toBeDefined();
    });

    it('should create a disabled task when enabled is 0', () => {
      const task = repository.create({
        name: 'Disabled Task',
        cron_expression: '0 * * * *',
        command: 'echo "disabled"',
        enabled: 0,
      });

      expect(task.enabled).toBe(0);
    });
  });

  describe('findAll', () => {
    it('should return empty array when no tasks exist', () => {
      const tasks = repository.findAll();
      expect(tasks).toEqual([]);
    });

    it('should return all tasks', () => {
      repository.create({
        name: 'Task 1',
        cron_expression: '0 * * * *',
        command: 'echo "1"',
      });
      repository.create({
        name: 'Task 2',
        cron_expression: '0 0 * * *',
        command: 'echo "2"',
      });

      const tasks = repository.findAll();
      expect(tasks).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent task', () => {
      const task = repository.findById(999);
      expect(task).toBeNull();
    });

    it('should return task by id', () => {
      const created = repository.create({
        name: 'Find Me',
        cron_expression: '0 * * * *',
        command: 'echo "found"',
      });

      const found = repository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled tasks', () => {
      repository.create({
        name: 'Enabled 1',
        cron_expression: '0 * * * *',
        command: 'echo "1"',
        enabled: 1,
      });
      repository.create({
        name: 'Disabled',
        cron_expression: '0 0 * * *',
        command: 'echo "2"',
        enabled: 0,
      });
      repository.create({
        name: 'Enabled 2',
        cron_expression: '0 0 0 * *',
        command: 'echo "3"',
        enabled: 1,
      });

      const enabled = repository.findEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled.every((t) => t.enabled === 1)).toBe(true);
    });
  });

  describe('delete', () => {
    it('should return false when deleting non-existent task', () => {
      const deleted = repository.delete(999);
      expect(deleted).toBe(false);
    });

    it('should delete task and return true', () => {
      const created = repository.create({
        name: 'Delete Me',
        cron_expression: '0 * * * *',
        command: 'echo "delete"',
      });

      const deleted = repository.delete(created.id);
      expect(deleted).toBe(true);

      const found = repository.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('updateLastRun', () => {
    it('should update last run timestamp', () => {
      const created = repository.create({
        name: 'Update Last Run',
        cron_expression: '0 * * * *',
        command: 'echo "test"',
      });

      const timestamp = Math.floor(Date.now() / 1000);
      repository.updateLastRun(created.id, timestamp);

      const updated = repository.findById(created.id);
      expect(updated!.last_run).toBe(timestamp);
    });
  });

  describe('updateNextRun', () => {
    it('should update next run timestamp', () => {
      const created = repository.create({
        name: 'Update Next Run',
        cron_expression: '0 * * * *',
        command: 'echo "test"',
      });

      const timestamp = Math.floor(Date.now() / 1000) + 3600;
      repository.updateNextRun(created.id, timestamp);

      const updated = repository.findById(created.id);
      expect(updated!.next_run).toBe(timestamp);
    });
  });

  describe('setEnabled', () => {
    it('should enable a disabled task', () => {
      const created = repository.create({
        name: 'Toggle Task',
        cron_expression: '0 * * * *',
        command: 'echo "test"',
        enabled: 0,
      });

      const updated = repository.setEnabled(created.id, true);
      expect(updated).toBe(true);

      const task = repository.findById(created.id);
      expect(task!.enabled).toBe(1);
    });

    it('should disable an enabled task', () => {
      const created = repository.create({
        name: 'Toggle Task',
        cron_expression: '0 * * * *',
        command: 'echo "test"',
        enabled: 1,
      });

      const updated = repository.setEnabled(created.id, false);
      expect(updated).toBe(true);

      const task = repository.findById(created.id);
      expect(task!.enabled).toBe(0);
    });

    it('should return false for non-existent task', () => {
      const updated = repository.setEnabled(999, true);
      expect(updated).toBe(false);
    });
  });
});
