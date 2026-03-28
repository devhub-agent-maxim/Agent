import { parseDailyLog, getWeeklyMetrics, formatDuration } from '../src/lib/analytics';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Analytics', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-test-'));
    fs.mkdirSync(path.join(tempDir, 'memory', 'daily'), { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('parseDailyLog', () => {
    it('should parse empty log file', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      fs.writeFileSync(logPath, '# 2026-03-28\n\n## Log\n\n', 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.date).toBe('2026-03-28');
      expect(metrics.tasksCompleted).toBe(0);
      expect(metrics.workerSpawned).toBe(0);
      expect(metrics.workerSuccess).toBe(0);
      expect(metrics.workerFailure).toBe(0);
      expect(metrics.workLoopTicks).toBe(0);
      expect(metrics.commits).toBe(0);
    });

    it('should count work loop ticks', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:16:58 am — Work loop tick — 0 workers running
- 1:19:36 am — Work loop tick — 0 workers running
- 1:26:58 am — Work loop tick — 0 workers running
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.workLoopTicks).toBe(3);
    });

    it('should detect decision engine unavailability', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:17:38 am — Work loop: waiting — No actionable work identified (decision engine unavailable)
- 1:20:17 am — Work loop: waiting — No actionable work identified (decision engine unavailable)
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.decisionEngineAvailable).toBe(false);
    });

    it('should count worker spawns and completions', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:27:33 am — Spawning worker: AUTO-1774718853254 — Add a complete TODO API
- 1:27:33 am — Worker spawned: AUTO-1774718853254 — Add a complete TODO API
- 1:30:15 am — Worker AUTO-1774718853254 completed: TODO API fully implemented
- 1:30:13 am — Worker done: AUTO-1774718853254 — Complete TODO API implemented
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.workerSpawned).toBe(2); // Both "Spawning" and "Worker spawned" lines
      expect(metrics.workerSuccess).toBe(2); // Both completion entries
      expect(metrics.tasksCompleted).toBeGreaterThan(0);
    });

    it('should calculate task duration correctly', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:27:33 am — Spawning worker: AUTO-1774718853254 — Add a complete TODO API
- 1:30:15 am — Worker done: AUTO-1774718853254 — Complete TODO API implemented
- 3:10:38 am — Spawning worker: AUTO-1774725038906 — Add GitHub Actions CI/CD
- 3:11:52 am — Worker done: AUTO-1774725038906 — Created GitHub Actions workflow
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.tasksCompleted).toBe(2);
      expect(metrics.totalTaskDurationMs).toBeGreaterThan(0);
      expect(metrics.avgTaskDurationMs).toBeGreaterThan(0);
      // First task: ~2m 42s = ~162s = ~162000ms
      // Second task: ~1m 14s = ~74s = ~74000ms
      // Average: ~118s = ~118000ms
      expect(metrics.avgTaskDurationMs).toBeGreaterThan(50000); // At least 50 seconds
      expect(metrics.avgTaskDurationMs).toBeLessThan(200000); // Less than 200 seconds
    });

    it('should count commits', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:31:30 am — Committed: 342a52f - feat: add TODO CRUD API
- 2:01:42 am — Auto-committed AUTO-1774720673152: chore: update daily notes (score: 6/10, SHA: b532085)
- 3:12:56 am — Auto-committed AUTO-1774725038906: chore: add GitHub Actions CI/CD (SHA: 303c084)
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = parseDailyLog(logPath, '2026-03-28');

      expect(metrics.commits).toBe(3);
    });

    it('should return empty metrics for non-existent file', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', 'nonexistent.md');

      const metrics = parseDailyLog(logPath, '2026-03-30');

      expect(metrics.date).toBe('2026-03-30');
      expect(metrics.tasksCompleted).toBe(0);
      expect(metrics.workerSpawned).toBe(0);
    });
  });

  describe('getWeeklyMetrics', () => {
    it('should aggregate metrics for multiple days', () => {
      // Create multiple daily logs
      const dates = ['2026-03-25', '2026-03-26', '2026-03-27'];

      dates.forEach((date, index) => {
        const logPath = path.join(tempDir, 'memory', 'daily', `${date}.md`);
        const content = `# ${date}
- 1:27:33 am — Spawning worker: AUTO-${100 + index} — Task ${index}
- 1:30:15 am — Worker done: AUTO-${100 + index} — Task completed
- 2:00:00 am — Committed: abc123 - feat: something
`;
        fs.writeFileSync(logPath, content, 'utf8');
      });

      const metrics = getWeeklyMetrics(tempDir, 7);

      expect(metrics.days.length).toBe(7); // Should have 7 days of data
      expect(metrics.summary.totalTasks).toBeGreaterThan(0);
      expect(metrics.summary.totalWorkers).toBeGreaterThan(0);
      expect(metrics.summary.commits).toBeGreaterThan(0);
    });

    it('should calculate success rate correctly', () => {
      const logPath = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');
      const content = `# 2026-03-28
- 1:27:33 am — Spawning worker: AUTO-1001 — Task 1
- 1:30:15 am — Worker done: AUTO-1001 — Task completed
- 2:27:33 am — Spawning worker: AUTO-1002 — Task 2
- 2:30:15 am — Worker done: AUTO-1002 — Task completed
- 3:27:33 am — Spawning worker: AUTO-1003 — Task 3
- 3:30:15 am — Worker done: AUTO-1003 — Task completed
`;
      fs.writeFileSync(logPath, content, 'utf8');

      const metrics = getWeeklyMetrics(tempDir, 1);

      expect(metrics.summary.totalWorkers).toBe(3);
      expect(metrics.summary.totalTasks).toBe(3);
      expect(metrics.summary.successRate).toBe(100.0);
    });

    it('should calculate average tasks per day', () => {
      // Create 3 days with different task counts
      const day1 = path.join(tempDir, 'memory', 'daily', '2026-03-26.md');
      const day2 = path.join(tempDir, 'memory', 'daily', '2026-03-27.md');
      const day3 = path.join(tempDir, 'memory', 'daily', '2026-03-28.md');

      fs.writeFileSync(day1, `# 2026-03-26
- 1:27:33 am — Spawning worker: AUTO-1001 — Task 1
- 1:30:15 am — Worker done: AUTO-1001 — Task completed
`, 'utf8');

      fs.writeFileSync(day2, `# 2026-03-27
- 1:27:33 am — Spawning worker: AUTO-1002 — Task 2
- 1:30:15 am — Worker done: AUTO-1002 — Task completed
- 2:27:33 am — Spawning worker: AUTO-1003 — Task 3
- 2:30:15 am — Worker done: AUTO-1003 — Task completed
`, 'utf8');

      fs.writeFileSync(day3, `# 2026-03-28
- 1:27:33 am — Spawning worker: AUTO-1004 — Task 4
- 1:30:15 am — Worker done: AUTO-1004 — Task completed
- 2:27:33 am — Spawning worker: AUTO-1005 — Task 5
- 2:30:15 am — Worker done: AUTO-1005 — Task completed
- 3:27:33 am — Spawning worker: AUTO-1006 — Task 6
- 3:30:15 am — Worker done: AUTO-1006 — Task completed
`, 'utf8');

      const metrics = getWeeklyMetrics(tempDir, 3);

      // 6 total tasks / 3 days = 2 tasks per day
      expect(metrics.summary.totalTasks).toBe(6);
      expect(metrics.summary.avgTasksPerDay).toBe(2.0);
    });

    it('should handle empty date range', () => {
      const metrics = getWeeklyMetrics(tempDir, 7);

      expect(metrics.days.length).toBe(7);
      expect(metrics.summary.totalTasks).toBe(0);
      expect(metrics.summary.successRate).toBe(0);
      expect(metrics.summary.avgCompletionTimeMs).toBe(0);
    });
  });

  describe('formatDuration', () => {
    it('should format zero duration', () => {
      expect(formatDuration(0)).toBe('0s');
    });

    it('should format seconds only', () => {
      expect(formatDuration(45000)).toBe('45s');
      expect(formatDuration(5000)).toBe('5s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(125000)).toBe('2m 5s');
      expect(formatDuration(60000)).toBe('1m 0s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3665000)).toBe('1h 1m');
      expect(formatDuration(7200000)).toBe('2h 0m');
    });

    it('should handle large durations', () => {
      expect(formatDuration(86400000)).toBe('24h 0m');
    });
  });
});
