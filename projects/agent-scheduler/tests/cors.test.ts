import request from 'supertest';
import { app } from '../src/index';
import { initDatabase, closeDatabase } from '../src/db/database';
import path from 'path';
import fs from 'fs';

describe('CORS Middleware', () => {
  const testDbPath = path.join(__dirname, 'test-cors-scheduler.db');

  beforeAll(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await initDatabase(testDbPath);
  });

  afterAll(async () => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('OPTIONS preflight requests', () => {
    it('should handle OPTIONS preflight for /schedules', async () => {
      const response = await request(app)
        .options('/schedules')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle OPTIONS preflight with custom headers', async () => {
      const response = await request(app)
        .options('/schedules')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });
  });

  describe('Allowed origins', () => {
    it('should allow requests from localhost:3000', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests from localhost:3001', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3001');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should allow requests from localhost:3002', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3002');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3002');
    });

    it('should allow requests from 127.0.0.1:3000', async () => {
      const response = await request(app)
        .get('/schedules')
        .set('Origin', 'http://127.0.0.1:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
    });

    it('should allow requests with no origin (curl, mobile apps)', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      // No origin header in response when no origin is sent
    });
  });

  describe('Rejected origins', () => {
    it('should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-site.com');

      // CORS error results in no response or error
      // The browser would block this, but in tests we just verify no CORS headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject requests from unauthorized port', async () => {
      const response = await request(app)
        .get('/schedules')
        .set('Origin', 'http://localhost:9999');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('CORS headers validation', () => {
    it('should include correct Access-Control-Allow-Methods', async () => {
      const response = await request(app)
        .options('/schedules')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-methods']).toContain('PUT');
      expect(response.headers['access-control-allow-methods']).toContain('DELETE');
      expect(response.headers['access-control-allow-methods']).toContain('PATCH');
      expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    });

    it('should include Access-Control-Max-Age for caching', async () => {
      const response = await request(app)
        .options('/schedules')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-max-age']).toBe('86400'); // 24 hours
    });

    it('should expose custom headers via Access-Control-Expose-Headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
    });
  });

  describe('Different HTTP methods', () => {
    it('should allow GET requests with CORS', async () => {
      const response = await request(app)
        .get('/schedules')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should allow POST requests with CORS', async () => {
      const response = await request(app)
        .post('/schedules')
        .set('Origin', 'http://localhost:3000')
        .send({
          name: 'CORS Test Schedule',
          cron_expression: '0 0 * * *',
          command: 'echo "test"'
        });

      expect(response.status).toBe(201);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });
});
