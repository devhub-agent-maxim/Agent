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

  describe('GET /', () => {
    it('should return HTML dashboard', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('Agent Dashboard');
      expect(response.text).toContain('/api/status');
    });

    it('should include auto-refresh script', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('setInterval');
      expect(response.text).toContain('fetchStatus');
    });
  });
});
