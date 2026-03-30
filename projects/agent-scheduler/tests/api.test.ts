import request from 'supertest';
import { initDatabase, closeDatabase } from '../src/db/database';
import express, { Express } from 'express';
import schedulesRouter from '../src/routes/schedules';
import fs from 'fs';
import path from 'path';

describe('Schedules API', () => {
  let app: Express;
  const testDbPath = path.join(__dirname, 'test-api-scheduler.db');

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/schedules', schedulesRouter);
  });

  beforeEach(async () => {
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

  describe('POST /schedules', () => {
    it('should create a new schedule', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Test Schedule',
          cron_expression: '0 * * * *',
          command: 'echo "test"',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('Test Schedule');
      expect(response.body.cron_expression).toBe('0 * * * *');
      expect(response.body.command).toBe('echo "test"');
      expect(response.body.enabled).toBe(1);
    });

    it('should create a disabled schedule when enabled is false', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Disabled Schedule',
          cron_expression: '0 * * * *',
          command: 'echo "disabled"',
          enabled: false,
        })
        .expect(201);

      expect(response.body.enabled).toBe(0);
    });

    it('should trim whitespace from inputs', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: '  Trimmed  ',
          cron_expression: '  0 * * * *  ',
          command: '  echo "test"  ',
        })
        .expect(201);

      expect(response.body.name).toBe('Trimmed');
      expect(response.body.cron_expression).toBe('0 * * * *');
      expect(response.body.command).toBe('echo "test"');
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          cron_expression: '0 * * * *',
          command: 'echo "test"',
        })
        .expect(400);

      expect(response.body.error).toContain('Name is required');
    });

    it('should return 400 when name is empty string', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: '   ',
          cron_expression: '0 * * * *',
          command: 'echo "test"',
        })
        .expect(400);

      expect(response.body.error).toContain('Name is required');
    });

    it('should return 400 when cron_expression is missing', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Test',
          command: 'echo "test"',
        })
        .expect(400);

      expect(response.body.error).toContain('Cron expression is required');
    });

    it('should return 400 for invalid cron expression format', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Test',
          cron_expression: 'invalid cron',
          command: 'echo "test"',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid cron expression');
    });

    it('should return 400 when command is missing', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Test',
          cron_expression: '0 * * * *',
        })
        .expect(400);

      expect(response.body.error).toContain('Command is required');
    });

    it('should return 400 when command is empty string', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Test',
          cron_expression: '0 * * * *',
          command: '   ',
        })
        .expect(400);

      expect(response.body.error).toContain('Command is required');
    });

    it('should accept 6-field cron expression', async () => {
      const response = await request(app)
        .post('/schedules')
        .send({
          name: 'Six Field Cron',
          cron_expression: '0 0 * * * *',
          command: 'echo "test"',
        })
        .expect(201);

      expect(response.body.cron_expression).toBe('0 0 * * * *');
    });
  });

  describe('GET /schedules', () => {
    it('should return empty array when no schedules exist', async () => {
      const response = await request(app).get('/schedules').expect(200);

      expect(response.body.schedules).toEqual([]);
      expect(response.body.count).toBe(0);
    });

    it('should return all schedules', async () => {
      // Create two schedules
      await request(app).post('/schedules').send({
        name: 'Schedule 1',
        cron_expression: '0 * * * *',
        command: 'echo "1"',
      });

      await request(app).post('/schedules').send({
        name: 'Schedule 2',
        cron_expression: '0 0 * * *',
        command: 'echo "2"',
      });

      const response = await request(app).get('/schedules').expect(200);

      expect(response.body.schedules).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });
  });

  describe('GET /schedules/:id', () => {
    it('should return 400 for invalid ID', async () => {
      const response = await request(app).get('/schedules/invalid').expect(400);

      expect(response.body.error).toContain('Invalid schedule ID');
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app).get('/schedules/999').expect(404);

      expect(response.body.error).toContain('Schedule not found');
    });

    it('should return schedule by ID', async () => {
      const created = await request(app)
        .post('/schedules')
        .send({
          name: 'Find Me',
          cron_expression: '0 * * * *',
          command: 'echo "found"',
        })
        .expect(201);

      const response = await request(app).get(`/schedules/${created.body.id}`).expect(200);

      expect(response.body.name).toBe('Find Me');
      expect(response.body.id).toBe(created.body.id);
    });
  });

  describe('DELETE /schedules/:id', () => {
    it('should return 400 for invalid ID', async () => {
      const response = await request(app).delete('/schedules/invalid').expect(400);

      expect(response.body.error).toContain('Invalid schedule ID');
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app).delete('/schedules/999').expect(404);

      expect(response.body.error).toContain('Schedule not found');
    });

    it('should delete schedule by ID', async () => {
      const created = await request(app)
        .post('/schedules')
        .send({
          name: 'Delete Me',
          cron_expression: '0 * * * *',
          command: 'echo "delete"',
        })
        .expect(201);

      await request(app).delete(`/schedules/${created.body.id}`).expect(204);

      // Verify it's deleted
      await request(app).get(`/schedules/${created.body.id}`).expect(404);
    });
  });

  describe('PATCH /schedules/:id/toggle', () => {
    it('should return 400 for invalid ID', async () => {
      const response = await request(app)
        .patch('/schedules/invalid/toggle')
        .send({ enabled: true })
        .expect(400);

      expect(response.body.error).toContain('Invalid schedule ID');
    });

    it('should return 400 when enabled is missing', async () => {
      const response = await request(app).patch('/schedules/1/toggle').send({}).expect(400);

      expect(response.body.error).toContain('Enabled must be a boolean or number');
    });

    it('should return 404 for non-existent schedule', async () => {
      const response = await request(app)
        .patch('/schedules/999/toggle')
        .send({ enabled: true })
        .expect(404);

      expect(response.body.error).toContain('Schedule not found');
    });

    it('should enable a disabled schedule', async () => {
      const created = await request(app)
        .post('/schedules')
        .send({
          name: 'Toggle Me',
          cron_expression: '0 * * * *',
          command: 'echo "toggle"',
          enabled: false,
        })
        .expect(201);

      const response = await request(app)
        .patch(`/schedules/${created.body.id}/toggle`)
        .send({ enabled: true })
        .expect(200);

      expect(response.body.enabled).toBe(1);
    });

    it('should disable an enabled schedule', async () => {
      const created = await request(app)
        .post('/schedules')
        .send({
          name: 'Toggle Me',
          cron_expression: '0 * * * *',
          command: 'echo "toggle"',
          enabled: true,
        })
        .expect(201);

      const response = await request(app)
        .patch(`/schedules/${created.body.id}/toggle`)
        .send({ enabled: false })
        .expect(200);

      expect(response.body.enabled).toBe(0);
    });

    it('should accept number for enabled field', async () => {
      const created = await request(app)
        .post('/schedules')
        .send({
          name: 'Toggle Me',
          cron_expression: '0 * * * *',
          command: 'echo "toggle"',
          enabled: 0,
        })
        .expect(201);

      const response = await request(app)
        .patch(`/schedules/${created.body.id}/toggle`)
        .send({ enabled: 1 })
        .expect(200);

      expect(response.body.enabled).toBe(1);
    });
  });
});
