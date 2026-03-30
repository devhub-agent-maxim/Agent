import { SchedulerWorker } from '../src/workers/scheduler-worker';
import { initDatabase, closeDatabase } from '../src/db/database';
import { SchedulesRepository } from '../src/db/schedules-repository';
import fs from 'fs';
import path from 'path';

describe('SchedulerWorker', () => {
  const testDbPath = path.join(__dirname, 'test-worker-scheduler.db');
  let worker: SchedulerWorker;
  let repository: SchedulesRepository;

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await initDatabase(testDbPath);
    repository = new SchedulesRepository();
    worker = new SchedulerWorker();
  });

  afterEach(() => {
    worker.stop();
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('start and stop', () => {
    it('should start without errors', () => {
      expect(() => worker.start()).not.toThrow();
    });

    it('should stop without errors', () => {
      worker.start();
      expect(() => worker.stop()).not.toThrow();
    });

    it('should have 0 active tasks initially', () => {
      worker.start();
      expect(worker.getActiveTaskCount()).toBe(0);
    });
  });

  describe('schedule loading', () => {
    it('should load enabled schedules', (done) => {
      // Create an enabled schedule
      repository.create({
        name: 'Enabled Schedule',
        cron_expression: '* * * * *', // Every minute
        command: 'echo "test"',
        enabled: 1,
      });

      worker.start();

      // Give it a moment to load schedules
      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(1);
        done();
      }, 100);
    });

    it('should not load disabled schedules', (done) => {
      // Create a disabled schedule
      repository.create({
        name: 'Disabled Schedule',
        cron_expression: '* * * * *',
        command: 'echo "test"',
        enabled: 0,
      });

      worker.start();

      // Give it a moment to load schedules
      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(0);
        done();
      }, 100);
    });

    it('should load multiple enabled schedules', (done) => {
      repository.create({
        name: 'Schedule 1',
        cron_expression: '* * * * *',
        command: 'echo "1"',
        enabled: 1,
      });

      repository.create({
        name: 'Schedule 2',
        cron_expression: '0 * * * *',
        command: 'echo "2"',
        enabled: 1,
      });

      repository.create({
        name: 'Schedule 3 (disabled)',
        cron_expression: '0 0 * * *',
        command: 'echo "3"',
        enabled: 0,
      });

      worker.start();

      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(2);
        done();
      }, 100);
    });

    it('should skip schedules with invalid cron expressions', (done) => {
      repository.create({
        name: 'Invalid Cron',
        cron_expression: 'not a valid cron',
        command: 'echo "test"',
        enabled: 1,
      });

      worker.start();

      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(0);
        done();
      }, 100);
    });
  });

  describe('getActiveTaskIds', () => {
    it('should return empty array when no tasks are active', () => {
      worker.start();
      expect(worker.getActiveTaskIds()).toEqual([]);
    });

    it('should return IDs of active tasks', (done) => {
      const task1 = repository.create({
        name: 'Task 1',
        cron_expression: '* * * * *',
        command: 'echo "1"',
        enabled: 1,
      });

      const task2 = repository.create({
        name: 'Task 2',
        cron_expression: '0 * * * *',
        command: 'echo "2"',
        enabled: 1,
      });

      worker.start();

      setTimeout(() => {
        const activeIds = worker.getActiveTaskIds();
        expect(activeIds).toContain(task1.id);
        expect(activeIds).toContain(task2.id);
        expect(activeIds).toHaveLength(2);
        done();
      }, 100);
    });
  });

  describe('schedule updates', () => {
    it('should remove cron task when schedule is disabled', (done) => {
      const task = repository.create({
        name: 'Toggle Task',
        cron_expression: '* * * * *',
        command: 'echo "test"',
        enabled: 1,
      });

      worker.start();

      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(1);

        // Disable the task
        repository.setEnabled(task.id, false);

        // Manually trigger reload (in real app, this happens every minute)
        worker.stop();
        worker.start();

        setTimeout(() => {
          expect(worker.getActiveTaskCount()).toBe(0);
          done();
        }, 100);
      }, 100);
    });

    it('should add cron task when new enabled schedule is created', (done) => {
      worker.start();

      setTimeout(() => {
        expect(worker.getActiveTaskCount()).toBe(0);

        // Create a new enabled schedule
        repository.create({
          name: 'New Schedule',
          cron_expression: '* * * * *',
          command: 'echo "new"',
          enabled: 1,
        });

        // Manually trigger reload
        worker.stop();
        worker.start();

        setTimeout(() => {
          expect(worker.getActiveTaskCount()).toBe(1);
          done();
        }, 100);
      }, 100);
    });
  });
});
