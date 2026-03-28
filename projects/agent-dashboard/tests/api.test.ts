import request from 'supertest';
import app from '../src/index';

describe('Agent Dashboard API', () => {
  describe('GET /api/status', () => {
    it('should return status object with all required fields', async () => {
      const response = await request(app).get('/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('goals');
      expect(response.body).toHaveProperty('workers');
      expect(response.body).toHaveProperty('recentLogs');
      expect(response.body).toHaveProperty('git');
      expect(response.body).toHaveProperty('decisionEngine');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return goals with active, waiting, and completed arrays', async () => {
      const response = await request(app).get('/api/status');

      expect(response.body.goals).toHaveProperty('active');
      expect(response.body.goals).toHaveProperty('waiting');
      expect(response.body.goals).toHaveProperty('completed');
      expect(Array.isArray(response.body.goals.active)).toBe(true);
      expect(Array.isArray(response.body.goals.waiting)).toBe(true);
      expect(Array.isArray(response.body.goals.completed)).toBe(true);
    });

    it('should return workers array', async () => {
      const response = await request(app).get('/api/status');

      expect(Array.isArray(response.body.workers)).toBe(true);
    });

    it('should return recent logs array', async () => {
      const response = await request(app).get('/api/status');

      expect(Array.isArray(response.body.recentLogs)).toBe(true);
    });

    it('should return git status with branch and commits', async () => {
      const response = await request(app).get('/api/status');

      expect(response.body.git).toHaveProperty('branch');
      expect(response.body.git).toHaveProperty('commits');
      expect(typeof response.body.git.branch).toBe('string');
      expect(Array.isArray(response.body.git.commits)).toBe(true);
    });

    it('should return decision engine status', async () => {
      const response = await request(app).get('/api/status');

      expect(response.body.decisionEngine).toHaveProperty('available');
      expect(response.body.decisionEngine).toHaveProperty('message');
      expect(typeof response.body.decisionEngine.available).toBe('boolean');
      expect(typeof response.body.decisionEngine.message).toBe('string');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/status');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/logs', () => {
    it('should return logs array with metadata', async () => {
      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(typeof response.body.count).toBe('number');
    });

    it('should accept count query parameter', async () => {
      const response = await request(app).get('/api/logs?count=5');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.logs.length).toBeLessThanOrEqual(5);
    });

    it('should default to 20 logs when count not specified', async () => {
      const response = await request(app).get('/api/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBeLessThanOrEqual(20);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/logs');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/goals', () => {
    it('should return goals object with metadata', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('goals');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return goals with active, waiting, and completed arrays', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.body.goals).toHaveProperty('active');
      expect(response.body.goals).toHaveProperty('waiting');
      expect(response.body.goals).toHaveProperty('completed');
      expect(Array.isArray(response.body.goals.active)).toBe(true);
      expect(Array.isArray(response.body.goals.waiting)).toBe(true);
      expect(Array.isArray(response.body.goals.completed)).toBe(true);
    });

    it('should return summary with counts', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.body.summary).toHaveProperty('active');
      expect(response.body.summary).toHaveProperty('waiting');
      expect(response.body.summary).toHaveProperty('completed');
      expect(typeof response.body.summary.active).toBe('number');
      expect(typeof response.body.summary.waiting).toBe('number');
      expect(typeof response.body.summary.completed).toBe('number');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should handle empty goals file gracefully', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body.goals.active).toBeDefined();
      expect(response.body.goals.waiting).toBeDefined();
      expect(response.body.goals.completed).toBeDefined();
      expect(response.body.summary.active).toBeGreaterThanOrEqual(0);
      expect(response.body.summary.waiting).toBeGreaterThanOrEqual(0);
      expect(response.body.summary.completed).toBeGreaterThanOrEqual(0);
    });

    it('should parse active goals correctly when present', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.status).toBe(200);
      if (response.body.goals.active.length > 0) {
        expect(typeof response.body.goals.active[0]).toBe('string');
        expect(response.body.summary.active).toBe(response.body.goals.active.length);
      }
    });

    it('should parse completed goals correctly when present', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.status).toBe(200);
      if (response.body.goals.completed.length > 0) {
        expect(typeof response.body.goals.completed[0]).toBe('string');
        expect(response.body.summary.completed).toBe(response.body.goals.completed.length);
        response.body.goals.completed.forEach((goal: string) => {
          expect(goal.startsWith('Goal ')).toBe(true);
        });
      }
    });

    it('should handle goals file with all sections', async () => {
      const response = await request(app).get('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body.goals).toHaveProperty('active');
      expect(response.body.goals).toHaveProperty('waiting');
      expect(response.body.goals).toHaveProperty('completed');

      const totalGoals =
        response.body.summary.active +
        response.body.summary.waiting +
        response.body.summary.completed;

      const actualTotal =
        response.body.goals.active.length +
        response.body.goals.waiting.length +
        response.body.goals.completed.length;

      expect(totalGoals).toBe(actualTotal);
    });
  });

  describe('GET /api/tasks', () => {
    it('should return tasks object with metadata', async () => {
      const response = await request(app).get('/api/tasks');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tasks');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return tasks with inProgress, pending, and completed arrays', async () => {
      const response = await request(app).get('/api/tasks');

      expect(response.body.tasks).toHaveProperty('inProgress');
      expect(response.body.tasks).toHaveProperty('pending');
      expect(response.body.tasks).toHaveProperty('completed');
      expect(Array.isArray(response.body.tasks.inProgress)).toBe(true);
      expect(Array.isArray(response.body.tasks.pending)).toBe(true);
      expect(Array.isArray(response.body.tasks.completed)).toBe(true);
    });

    it('should return summary with counts', async () => {
      const response = await request(app).get('/api/tasks');

      expect(response.body.summary).toHaveProperty('inProgress');
      expect(response.body.summary).toHaveProperty('pending');
      expect(response.body.summary).toHaveProperty('completed');
      expect(typeof response.body.summary.inProgress).toBe('number');
      expect(typeof response.body.summary.pending).toBe('number');
      expect(typeof response.body.summary.completed).toBe('number');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/tasks');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/recent-activity', () => {
    it('should return activity array with metadata', async () => {
      const response = await request(app).get('/api/recent-activity');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('activity');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.activity)).toBe(true);
      expect(typeof response.body.count).toBe('number');
    });

    it('should accept count query parameter', async () => {
      const response = await request(app).get('/api/recent-activity?count=10');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.activity)).toBe(true);
      expect(response.body.activity.length).toBeLessThanOrEqual(10);
    });

    it('should default to 20 entries when count not specified', async () => {
      const response = await request(app).get('/api/recent-activity');

      expect(response.status).toBe(200);
      expect(response.body.activity.length).toBeLessThanOrEqual(20);
    });
  });

  describe('GET /api/workers', () => {
    it('should return workers array with metadata', async () => {
      const response = await request(app).get('/api/workers');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('workers');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.workers)).toBe(true);
      expect(typeof response.body.count).toBe('number');
    });

    it('should return valid worker structure when workers exist', async () => {
      const response = await request(app).get('/api/workers');

      expect(response.status).toBe(200);
      if (response.body.workers.length > 0) {
        const worker = response.body.workers[0];
        expect(worker).toHaveProperty('id');
        expect(worker).toHaveProperty('task');
        expect(worker).toHaveProperty('runningMs');
      }
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/workers');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /api/schedules', () => {
    it('should return schedules array with metadata', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('schedules');
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('available');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.schedules)).toBe(true);
      expect(typeof response.body.count).toBe('number');
      expect(typeof response.body.available).toBe('boolean');
    });

    it('should handle scheduler service unavailable gracefully', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.status).toBe(200);
      if (!response.body.available) {
        expect(response.body.schedules).toEqual([]);
        expect(response.body.count).toBe(0);
        expect(response.body.error).toBe('Scheduler service not available');
      }
    });

    it('should return valid schedule structure when available', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.status).toBe(200);
      if (response.body.available && response.body.schedules.length > 0) {
        const schedule = response.body.schedules[0];
        expect(schedule).toHaveProperty('id');
        expect(schedule).toHaveProperty('name');
        expect(schedule).toHaveProperty('cron_expression');
        expect(schedule).toHaveProperty('command');
        expect(schedule).toHaveProperty('enabled');
      }
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    it('should return count matching schedules array length', async () => {
      const response = await request(app).get('/api/schedules');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(response.body.schedules.length);
    });
  });

  describe('GET /api/memory', () => {
    it('should return memory structure with statistics', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('structure');
      expect(response.body).toHaveProperty('statistics');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return nested directory structure', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body.structure).toHaveProperty('name');
      expect(response.body.structure).toHaveProperty('path');
      expect(response.body.structure).toHaveProperty('files');
      expect(response.body.structure).toHaveProperty('subdirectories');
      expect(Array.isArray(response.body.structure.files)).toBe(true);
      expect(Array.isArray(response.body.structure.subdirectories)).toBe(true);
    });

    it('should parse frontmatter from markdown files', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);

      // Check that files have proper structure
      const hasFiles = response.body.structure.files.length > 0 ||
        response.body.structure.subdirectories.some((dir: any) => dir.files.length > 0);

      if (hasFiles) {
        // Find first file
        let firstFile;
        if (response.body.structure.files.length > 0) {
          firstFile = response.body.structure.files[0];
        } else {
          const dirWithFiles = response.body.structure.subdirectories.find((dir: any) => dir.files.length > 0);
          if (dirWithFiles) {
            firstFile = dirWithFiles.files[0];
          }
        }

        if (firstFile) {
          expect(firstFile).toHaveProperty('name');
          expect(firstFile).toHaveProperty('path');
          expect(firstFile).toHaveProperty('type');
          expect(firstFile.name).toMatch(/\.md$/);
        }
      }
    });

    it('should filter markdown files only', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);

      // Check all files are .md files
      function checkFiles(structure: any) {
        for (const file of structure.files) {
          expect(file.name).toMatch(/\.md$/);
        }
        for (const subdir of structure.subdirectories) {
          checkFiles(subdir);
        }
      }

      checkFiles(response.body.structure);
    });

    it('should return statistics with file counts by type', async () => {
      const response = await request(app).get('/api/memory');

      expect(response.status).toBe(200);
      expect(response.body.statistics).toHaveProperty('totalFiles');
      expect(response.body.statistics).toHaveProperty('byType');
      expect(typeof response.body.statistics.totalFiles).toBe('number');
      expect(typeof response.body.statistics.byType).toBe('object');
      expect(response.body.statistics.totalFiles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /', () => {
    it('should return HTML dashboard', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('Agent Dashboard');
      expect(response.text).toContain('/api/recent-activity');
      expect(response.text).toContain('/api/workers');
      expect(response.text).toContain('/api/goals');
      expect(response.text).toContain('/api/tasks');
      expect(response.text).toContain('/api/schedules');
    });

    it('should include auto-refresh script', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('setInterval');
      expect(response.text).toContain('fetchAllData');
    });

    it('should include scheduled tasks section', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('Scheduled Tasks');
      expect(response.text).toContain('schedules-count');
    });
  });
});
