import request from 'supertest';
import app from '../src/index';

describe('CORS Middleware', () => {
  const validApiKey = process.env.API_KEYS?.split(',')[0] || 'test-key';
  const allowedOrigin = 'http://localhost:3000';
  const blockedOrigin = 'https://evil.example.com';

  describe('Allowed Origins', () => {
    it('should allow requests from allowed origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', allowedOrigin);

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    });

    it('should allow requests with no origin (mobile apps, curl)', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });

    it('should allow localhost variants in development', async () => {
      const origins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      ];

      for (const origin of origins) {
        const response = await request(app)
          .get('/health')
          .set('Origin', origin);

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
      }
    });
  });

  describe('Credentials', () => {
    it('should allow credentials (cookies, auth headers)', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', allowedOrigin);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Preflight Requests', () => {
    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-methods']).toMatch(/POST/);
      expect(response.headers['access-control-allow-headers']).toMatch(/Content-Type/);
      expect(response.headers['access-control-allow-headers']).toMatch(/Authorization/);
    });

    it('should cache preflight responses', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-max-age']).toBe('86400');
    });

    it('should expose custom headers to client', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', allowedOrigin);

      expect(response.headers['access-control-expose-headers']).toContain('X-Request-Id');
    });
  });

  describe('Blocked Origins', () => {
    it('should reject requests from non-allowed origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', blockedOrigin);

      // CORS error from middleware - but the endpoint might still respond
      // The browser would block it, but supertest will receive the response
      // We check that no CORS header is set for the blocked origin
      if (response.status === 200) {
        expect(response.headers['access-control-allow-origin']).not.toBe(blockedOrigin);
      }
    });

    it('should reject preflight from non-allowed origins', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', blockedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      // Preflight from blocked origin should not get CORS headers for that origin
      if (response.status === 200 || response.status === 204) {
        expect(response.headers['access-control-allow-origin']).not.toBe(blockedOrigin);
      }
    });
  });

  describe('Allowed Methods and Headers', () => {
    it('should allow standard HTTP methods', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      const allowedMethods = response.headers['access-control-allow-methods'];
      expect(allowedMethods).toMatch(/GET/);
      expect(allowedMethods).toMatch(/POST/);
      expect(allowedMethods).toMatch(/PUT/);
      expect(allowedMethods).toMatch(/DELETE/);
    });

    it('should allow standard request headers', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      const allowedHeaders = response.headers['access-control-allow-headers'];
      expect(allowedHeaders).toMatch(/Content-Type/);
      expect(allowedHeaders).toMatch(/Authorization/);
    });

    it('should allow custom headers for API functionality', async () => {
      const response = await request(app)
        .options('/todos')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'X-Requested-With');

      const allowedHeaders = response.headers['access-control-allow-headers'];
      expect(allowedHeaders).toMatch(/X-Requested-With/);
    });
  });
});
