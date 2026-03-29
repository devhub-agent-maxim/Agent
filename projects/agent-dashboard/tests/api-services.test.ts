/**
 * API Services Endpoint Tests
 */

import request from 'supertest';
import app from '../src/index';

describe('Service Health API Endpoints', () => {
  describe('GET /health', () => {
    test('should return 200 status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });

    test('should return healthy status', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('healthy');
    });

    test('should include service name', async () => {
      const response = await request(app).get('/health');
      expect(response.body.service).toBe('agent-dashboard');
    });

    test('should include timestamp', async () => {
      const response = await request(app).get('/health');
      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('GET /api/services', () => {
    test('should return 200 status', async () => {
      const response = await request(app).get('/api/services');
      expect(response.status).toBe(200);
    });

    test('should return services array', async () => {
      const response = await request(app).get('/api/services');
      expect(response.body.services).toBeDefined();
      expect(Array.isArray(response.body.services)).toBe(true);
    });

    test('should include all three services', async () => {
      const response = await request(app).get('/api/services');
      expect(response.body.services).toHaveLength(3);

      const serviceNames = response.body.services.map((s: any) => s.name);
      expect(serviceNames).toContain('Agent Tools');
      expect(serviceNames).toContain('Agent Dashboard');
      expect(serviceNames).toContain('Agent Scheduler');
    });

    test('should include service status for each service', async () => {
      const response = await request(app).get('/api/services');

      response.body.services.forEach((service: any) => {
        expect(service.name).toBeDefined();
        expect(service.url).toBeDefined();
        expect(service.status).toBeDefined();
        expect(['healthy', 'slow', 'down']).toContain(service.status);
        expect(service.timestamp).toBeDefined();
      });
    });

    test('should include response time for healthy/slow services', async () => {
      const response = await request(app).get('/api/services');

      response.body.services.forEach((service: any) => {
        if (service.status === 'healthy' || service.status === 'slow') {
          expect(service.responseTimeMs).toBeGreaterThan(0);
        }
      });
    });

    test('should include error message for down services', async () => {
      const response = await request(app).get('/api/services');

      const downServices = response.body.services.filter((s: any) => s.status === 'down');
      downServices.forEach((service: any) => {
        expect(service.error).toBeDefined();
        expect(typeof service.error).toBe('string');
      });
    });

    test('should include summary statistics', async () => {
      const response = await request(app).get('/api/services');

      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.total).toBe(3);
      expect(response.body.summary.healthy).toBeGreaterThanOrEqual(0);
      expect(response.body.summary.slow).toBeGreaterThanOrEqual(0);
      expect(response.body.summary.down).toBeGreaterThanOrEqual(0);

      // Total should equal sum of all statuses
      const { healthy, slow, down, total } = response.body.summary;
      expect(healthy + slow + down).toBe(total);
    });

    test('should include timestamp', async () => {
      const response = await request(app).get('/api/services');
      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    test('should complete in reasonable time (< 10 seconds)', async () => {
      const startTime = Date.now();
      await request(app).get('/api/services');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
    });
  });
});
