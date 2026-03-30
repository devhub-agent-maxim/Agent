/**
 * Service Health Monitoring Tests
 */

import { checkServiceHealth, checkAllServices } from '../src/lib/service-health';
import express from 'express';
import { Server } from 'http';

describe('Service Health Monitoring', () => {
  let testServer: Server;
  let testPort: number;

  beforeAll((done) => {
    // Create test server for health checks
    const app = express();

    // Fast endpoint (< 500ms)
    app.get('/health-fast', (req, res) => {
      res.json({ status: 'healthy' });
    });

    // Slow endpoint (500-2000ms)
    app.get('/health-slow', (req, res) => {
      setTimeout(() => {
        res.json({ status: 'healthy' });
      }, 600);
    });

    // Very slow endpoint (> 2000ms)
    app.get('/health-very-slow', (req, res) => {
      setTimeout(() => {
        res.json({ status: 'healthy' });
      }, 2100);
    });

    // Error endpoint
    app.get('/health-error', (req, res) => {
      res.status(500).json({ error: 'Internal Server Error' });
    });

    // Start test server on random port
    testServer = app.listen(0, () => {
      const address = testServer.address();
      if (address && typeof address === 'object') {
        testPort = address.port;
        done();
      }
    });
  });

  afterAll((done) => {
    testServer.close(done);
  });

  describe('checkServiceHealth', () => {
    test('should return healthy status for fast endpoint (< 500ms)', async () => {
      const result = await checkServiceHealth(
        'Test Service',
        `http://localhost:${testPort}/health-fast`
      );

      expect(result.name).toBe('Test Service');
      expect(result.status).toBe('healthy');
      expect(result.responseTimeMs).toBeLessThan(500);
      expect(result.responseTimeMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
      expect(result.timestamp).toBeDefined();
    });

    test('should return slow status for slow endpoint (500-2000ms)', async () => {
      const result = await checkServiceHealth(
        'Slow Service',
        `http://localhost:${testPort}/health-slow`
      );

      expect(result.name).toBe('Slow Service');
      expect(result.status).toBe('slow');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(500);
      expect(result.responseTimeMs).toBeLessThan(2000);
      expect(result.error).toBeUndefined();
    });

    test('should return down status for very slow endpoint (> 2000ms)', async () => {
      const result = await checkServiceHealth(
        'Very Slow Service',
        `http://localhost:${testPort}/health-very-slow`
      );

      expect(result.name).toBe('Very Slow Service');
      expect(result.status).toBe('down');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(2000);
      expect(result.error).toBeUndefined();
    });

    test('should return down status for error endpoint', async () => {
      const result = await checkServiceHealth(
        'Error Service',
        `http://localhost:${testPort}/health-error`
      );

      expect(result.name).toBe('Error Service');
      expect(result.status).toBe('down');
      expect(result.error).toContain('HTTP 500');
      expect(result.responseTimeMs).toBeGreaterThan(0);
    });

    test('should return down status for non-existent endpoint', async () => {
      const result = await checkServiceHealth(
        'Down Service',
        `http://localhost:${testPort}/non-existent`
      );

      expect(result.name).toBe('Down Service');
      expect(result.status).toBe('down');
      expect(result.error).toContain('HTTP 404');
    });

    test('should timeout and return down status for timeout', async () => {
      const result = await checkServiceHealth(
        'Timeout Service',
        `http://localhost:${testPort}/health-very-slow`,
        1000 // 1 second timeout
      );

      expect(result.name).toBe('Timeout Service');
      expect(result.status).toBe('down');
      expect(result.error).toContain('Timeout');
      expect(result.responseTimeMs).toBeNull();
    });

    test('should handle connection refused error', async () => {
      const result = await checkServiceHealth(
        'Refused Service',
        'http://localhost:9999/health' // Non-existent port
      );

      expect(result.name).toBe('Refused Service');
      expect(result.status).toBe('down');
      expect(result.error).toContain('refused');
      expect(result.responseTimeMs).toBeNull();
    });

    test('should include timestamp in result', async () => {
      const result = await checkServiceHealth(
        'Test Service',
        `http://localhost:${testPort}/health-fast`
      );

      expect(result.timestamp).toBeDefined();
      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });
  });

  describe('checkAllServices', () => {
    test('should check all services and return summary', async () => {
      const result = await checkAllServices();

      expect(result.services).toHaveLength(3);
      expect(result.summary.total).toBe(3);
      expect(result.summary.healthy).toBeGreaterThanOrEqual(0);
      expect(result.summary.slow).toBeGreaterThanOrEqual(0);
      expect(result.summary.down).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    test('should include all expected services', async () => {
      const result = await checkAllServices();

      const serviceNames = result.services.map(s => s.name);
      expect(serviceNames).toContain('Agent Tools');
      expect(serviceNames).toContain('Agent Dashboard');
      expect(serviceNames).toContain('Agent Scheduler');
    });

    test('should calculate summary correctly', async () => {
      const result = await checkAllServices();

      const { summary, services } = result;
      const actualHealthy = services.filter(s => s.status === 'healthy').length;
      const actualSlow = services.filter(s => s.status === 'slow').length;
      const actualDown = services.filter(s => s.status === 'down').length;

      expect(summary.healthy).toBe(actualHealthy);
      expect(summary.slow).toBe(actualSlow);
      expect(summary.down).toBe(actualDown);
      expect(summary.total).toBe(actualHealthy + actualSlow + actualDown);
    });

    test('should check services in parallel (fast)', async () => {
      const startTime = Date.now();
      await checkAllServices();
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 10 seconds even if all services are down)
      expect(duration).toBeLessThan(10000);
    });
  });
});
