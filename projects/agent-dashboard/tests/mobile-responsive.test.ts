import request from 'supertest';
import app from '../src/index';

describe('Mobile Responsive Layout', () => {
  describe('HTML meta viewport', () => {
    it('should include viewport meta tag for mobile responsiveness', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    });

    it('should be valid HTML5', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('<html lang="en">');
    });
  });

  describe('Mobile CSS media queries', () => {
    it('should include tablet breakpoint media query (768px)', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('@media (max-width: 768px)');
    });

    it('should include mobile breakpoint media query (480px)', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('@media (max-width: 480px)');
    });

    it('should have responsive grid layout', async () => {
      const response = await request(app).get('/');

      // Check that grid exists
      expect(response.text).toContain('grid-template-columns');

      // Check that responsive styles adjust grid to single column
      expect(response.text).toMatch(/grid-template-columns:\s*1fr/);
    });

    it('should adjust typography for mobile', async () => {
      const response = await request(app).get('/');

      // Check that font sizes are adjusted in media queries
      const has768Headings = response.text.includes('font-size: 22px') && // h1 at 768px
                             response.text.includes('font-size: 16px'); // h2 at 768px

      const has480Headings = response.text.includes('font-size: 18px') && // h1 at 480px
                             response.text.includes('font-size: 14px'); // h2 at 480px

      expect(has768Headings).toBe(true);
      expect(has480Headings).toBe(true);
    });

    it('should adjust padding for mobile', async () => {
      const response = await request(app).get('/');

      // Check that padding is reduced for mobile in media queries
      const bodyPaddingMobile = /padding:\s*8px/.test(response.text); // 480px breakpoint
      const bodyPaddingTablet = /padding:\s*12px/.test(response.text); // 768px breakpoint

      expect(bodyPaddingMobile).toBe(true);
      expect(bodyPaddingTablet).toBe(true);
    });

    it('should scale metrics for mobile', async () => {
      const response = await request(app).get('/');

      // Check that metric values are scaled down
      expect(response.text).toMatch(/\.metric-value.*font-size:\s*24px/s); // 768px
      expect(response.text).toMatch(/\.metric-value.*font-size:\s*20px/s); // 480px
    });
  });

  describe('Responsive dashboard components', () => {
    it('should have grid layout that adapts', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('class="grid"');
      expect(response.text).toContain('grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))');
    });

    it('should have cards with responsive padding', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('class="card"');

      // Desktop card padding
      expect(response.text).toMatch(/\.card\s*{[^}]*padding:\s*16px/);
    });

    it('should have refresh indicator positioned for mobile', async () => {
      const response = await request(app).get('/');

      expect(response.text).toContain('class="refresh-indicator"');

      // Check that refresh indicator is repositioned in media query
      const hasResponsiveRefresh = response.text.includes('top: 12px') &&
                                   response.text.includes('right: 12px');
      expect(hasResponsiveRefresh).toBe(true);
    });
  });

  describe('Mobile-friendly content', () => {
    it('should use readable font sizes on mobile', async () => {
      const response = await request(app).get('/');

      // Verify minimum font sizes for readability
      const hasReadableFonts = response.text.includes('font-size: 11px') || // Minimum size
                               response.text.includes('font-size: 12px') ||
                               response.text.includes('font-size: 13px');

      expect(hasReadableFonts).toBe(true);
    });

    it('should have touch-friendly spacing', async () => {
      const response = await request(app).get('/');

      // Check that items have adequate margin/padding for touch targets
      expect(response.text).toContain('padding:');
      expect(response.text).toContain('margin:');
    });
  });
});
