import request from 'supertest';
import app from '../src/index';

describe('Security Headers Middleware', () => {
  describe('Content-Security-Policy', () => {
    it('should set strict Content-Security-Policy header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['content-security-policy']).toBeDefined();
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('X-Frame-Options', () => {
    it('should set X-Frame-Options to DENY', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('X-Content-Type-Options', () => {
    it('should set X-Content-Type-Options to nosniff', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Strict-Transport-Security', () => {
    it('should set HSTS header with max-age and includeSubDomains', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['strict-transport-security']).toBeDefined();
      const hsts = response.headers['strict-transport-security'];
      expect(hsts).toContain('max-age=31536000'); // 1 year
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });
  });

  describe('X-DNS-Prefetch-Control', () => {
    it('should set X-DNS-Prefetch-Control to off', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });
  });

  describe('X-Download-Options', () => {
    it('should set X-Download-Options to noopen', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-download-options']).toBe('noopen');
    });
  });

  describe('Referrer-Policy', () => {
    it('should set Referrer-Policy to strict-origin-when-cross-origin', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('X-Permitted-Cross-Domain-Policies', () => {
    it('should set X-Permitted-Cross-Domain-Policies to none', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    });
  });

  describe('X-Powered-By', () => {
    it('should remove X-Powered-By header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Applied to all routes', () => {
    it('should apply security headers to API routes', async () => {
      const response = await request(app)
        .get('/todos')
        .set('Authorization', 'Bearer test-key-1');

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('should apply security headers to documentation routes', async () => {
      const response = await request(app).get('/api-docs/');

      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
