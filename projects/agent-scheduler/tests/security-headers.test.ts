import request from 'supertest';
import { app } from '../src/index';

describe('Security Headers', () => {
  it('should include X-Content-Type-Options header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should include X-Frame-Options header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('should include Strict-Transport-Security header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
  });

  it('should include X-DNS-Prefetch-Control header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('should include X-Download-Options header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-download-options']).toBe('noopen');
  });

  it('should include Referrer-Policy header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should include X-Permitted-Cross-Domain-Policies header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('should not include X-Powered-By header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should include Content-Security-Policy header', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('should apply security headers to schedules endpoint', async () => {
    const response = await request(app).get('/schedules');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['strict-transport-security']).toBeDefined();
  });
});
