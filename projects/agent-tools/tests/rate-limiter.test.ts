import request from 'supertest';
import express, { Express } from 'express';
import { createRateLimiter, todoRateLimiter } from '../src/middleware/rate-limiter';
import app from '../src/index';

describe('Rate Limiter Middleware', () => {
  let testApp: Express;
  const validApiKey = 'test-key-123';

  beforeEach(() => {
    // Set up a test API key
    process.env.API_KEYS = validApiKey;

    // Create a minimal Express app for testing
    testApp = express();
    testApp.use(express.json());

    // Create a rate limiter with very short window for testing
    // 1 second window, max 5 requests
    const testRateLimiter = createRateLimiter(1000, 5);

    // Simple test endpoint with rate limiting
    testApp.get('/test', testRateLimiter, (req, res) => {
      res.json({ message: 'success' });
    });
  });

  afterEach(() => {
    delete process.env.API_KEYS;
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests under the limit', async () => {
      // Make 5 requests (at the limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(testApp)
          .get('/test')
          .expect(200);

        expect(response.body).toEqual({ message: 'success' });
      }
    });

    it('should return 429 when rate limit is exceeded', async () => {
      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        await request(testApp).get('/test').expect(200);
      }

      // The 6th request should be rate limited
      const response = await request(testApp)
        .get('/test')
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/too many requests/i);
    });

    it('should reset rate limit after window expires', async () => {
      // Make 5 requests to hit the limit
      for (let i = 0; i < 5; i++) {
        await request(testApp).get('/test').expect(200);
      }

      // The 6th request should be rate limited
      await request(testApp).get('/test').expect(429);

      // Wait for the rate limit window to expire (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // After reset, requests should work again
      const response = await request(testApp)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ message: 'success' });
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include RateLimit-Limit header in response', async () => {
      const response = await request(testApp)
        .get('/test')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers['ratelimit-limit']).toBe('5');
    });

    it('should include RateLimit-Remaining header that decrements', async () => {
      // First request should have 4 remaining (5 - 1)
      const response1 = await request(testApp)
        .get('/test')
        .expect(200);

      expect(response1.headers).toHaveProperty('ratelimit-remaining');
      expect(parseInt(response1.headers['ratelimit-remaining'])).toBe(4);

      // Second request should have 3 remaining
      const response2 = await request(testApp)
        .get('/test')
        .expect(200);

      expect(parseInt(response2.headers['ratelimit-remaining'])).toBe(3);

      // Third request should have 2 remaining
      const response3 = await request(testApp)
        .get('/test')
        .expect(200);

      expect(parseInt(response3.headers['ratelimit-remaining'])).toBe(2);
    });

    it('should include RateLimit-Reset header with valid value', async () => {
      const response = await request(testApp)
        .get('/test')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-reset');

      // RateLimit-Reset value should be present and valid
      const resetValue = parseInt(response.headers['ratelimit-reset']);

      // Should be a positive number
      expect(resetValue).toBeGreaterThan(0);

      // Should be reasonable (not more than our window in seconds)
      expect(resetValue).toBeLessThanOrEqual(2); // Our window is 1 second, so reset should be ≤2 seconds
    });

    it('should include Retry-After header when rate limit exceeded', async () => {
      // Hit the rate limit
      for (let i = 0; i < 5; i++) {
        await request(testApp).get('/test').expect(200);
      }

      // Exceed the limit
      const response = await request(testApp)
        .get('/test')
        .expect(429);

      expect(response.headers).toHaveProperty('retry-after');

      const retryAfter = parseInt(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(1); // Should be ~1 second or less
    });
  });

  describe('Different IP Addresses', () => {
    it('should track rate limits separately for different IPs', async () => {
      // Create app with IP-based rate limiting and trust proxy enabled
      const ipTestApp = express();
      ipTestApp.set('trust proxy', true); // Enable trust proxy to recognize X-Forwarded-For
      ipTestApp.use(express.json());
      const ipRateLimiter = createRateLimiter(1000, 2); // 2 requests per second

      ipTestApp.get('/test', ipRateLimiter, (req, res) => {
        res.json({ message: 'success' });
      });

      // First IP: Make 2 requests (at limit)
      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200);

      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200);

      // First IP: Third request should be blocked
      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(429);

      // Second IP: Should still be allowed (different IP)
      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.2')
        .expect(200);

      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.2')
        .expect(200);

      // Second IP: Third request should also be blocked
      await request(ipTestApp)
        .get('/test')
        .set('X-Forwarded-For', '192.168.1.2')
        .expect(429);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      // Make 5 concurrent requests (all should succeed as they're at the limit)
      const requests = Array(5).fill(null).map(() =>
        request(testApp).get('/test').expect(200)
      );

      await Promise.all(requests);

      // The next request should be blocked
      await request(testApp).get('/test').expect(429);
    });

    it('should handle burst requests followed by normal requests', async () => {
      // Burst: 3 requests
      await Promise.all([
        request(testApp).get('/test').expect(200),
        request(testApp).get('/test').expect(200),
        request(testApp).get('/test').expect(200)
      ]);

      // Normal: 2 more requests (should reach limit)
      await request(testApp).get('/test').expect(200);
      await request(testApp).get('/test').expect(200);

      // This should be blocked
      await request(testApp).get('/test').expect(429);
    });
  });

  describe('Edge Cases', () => {
    it('should handle exactly at the limit', async () => {
      // Make exactly 5 requests (the limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(testApp).get('/test').expect(200);
        expect(response.headers['ratelimit-remaining']).toBe(String(4 - i));
      }

      // The next one should fail
      const response = await request(testApp).get('/test').expect(429);
      expect(response.headers['ratelimit-remaining']).toBe('0');
    });

    it('should handle rapid sequential requests', async () => {
      let successCount = 0;
      let failedCount = 0;

      // Try 10 rapid requests
      for (let i = 0; i < 10; i++) {
        const response = await request(testApp).get('/test');
        if (response.status === 200) successCount++;
        if (response.status === 429) failedCount++;
      }

      expect(successCount).toBe(5); // Should allow exactly 5
      expect(failedCount).toBe(5);  // Should block 5
    });
  });

  describe('Health Endpoint - No Rate Limiting', () => {
    it('should not rate limit the /health endpoint', async () => {
      // Make many requests to /health (should all succeed)
      for (let i = 0; i < 20; i++) {
        await request(app).get('/health').expect(200);
      }

      // All should succeed - no rate limiting on health endpoint
    });

    it('should not include rate limit headers on /health endpoint', async () => {
      const response = await request(app).get('/health').expect(200);

      // Health endpoint should not have rate limit headers
      expect(response.headers['ratelimit-limit']).toBeUndefined();
      expect(response.headers['ratelimit-remaining']).toBeUndefined();
      expect(response.headers['ratelimit-reset']).toBeUndefined();
    });
  });
});
