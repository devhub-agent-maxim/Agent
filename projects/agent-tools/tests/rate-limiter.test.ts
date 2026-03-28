import request from 'supertest';
import express, { Express } from 'express';
import { createRateLimiter } from '../src/middleware/rate-limiter';

describe('Rate Limiter Middleware', () => {
  let app: Express;
  const validApiKey = 'test-key-123';

  beforeEach(() => {
    // Set up a test API key
    process.env.API_KEYS = validApiKey;

    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());

    // Create a rate limiter with very short window for testing
    // 1 second window, max 5 requests
    const testRateLimiter = createRateLimiter(1000, 5);

    // Simple test endpoint with rate limiting
    app.get('/test', testRateLimiter, (req, res) => {
      res.json({ message: 'success' });
    });
  });

  afterEach(() => {
    delete process.env.API_KEYS;
  });

  it('should allow requests under the limit', async () => {
    // Make 5 requests (at the limit)
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body).toEqual({ message: 'success' });
    }
  });

  it('should return 429 when rate limit is exceeded', async () => {
    // Make 5 requests to hit the limit
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }

    // The 6th request should be rate limited
    const response = await request(app)
      .get('/test')
      .expect(429);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/too many requests/i);
  });

  it('should reset rate limit after window expires', async () => {
    // Make 5 requests to hit the limit
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').expect(200);
    }

    // The 6th request should be rate limited
    await request(app).get('/test').expect(429);

    // Wait for the rate limit window to expire (1 second + buffer)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // After reset, requests should work again
    const response = await request(app)
      .get('/test')
      .expect(200);

    expect(response.body).toEqual({ message: 'success' });
  });
});
