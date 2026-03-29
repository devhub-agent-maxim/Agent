import { validateEnvironment, validateEnvironmentOrExit } from '../src/lib/env-validator';

describe('Environment Validator - agent-dashboard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    describe('AGENT_TOOLS_URL validation', () => {
      it('should fail when AGENT_TOOLS_URL is not set', () => {
        delete process.env.AGENT_TOOLS_URL;
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('AGENT_TOOLS_URL environment variable is required but not set');
      });

      it('should fail when AGENT_TOOLS_URL is empty string', () => {
        process.env.AGENT_TOOLS_URL = '';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('AGENT_TOOLS_URL environment variable is required but not set');
      });

      it('should fail when AGENT_TOOLS_URL is not a valid URL', () => {
        process.env.AGENT_TOOLS_URL = 'not-a-url';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('AGENT_TOOLS_URL contains invalid URL');
      });

      it('should fail when AGENT_TOOLS_URL uses invalid protocol', () => {
        process.env.AGENT_TOOLS_URL = 'ftp://localhost:3000';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('AGENT_TOOLS_URL must use http: or https: protocol');
      });

      it('should pass with valid HTTP URL', () => {
        process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('should pass with valid HTTPS URL', () => {
        process.env.AGENT_TOOLS_URL = 'https://api.example.com';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('AGENT_SCHEDULER_URL validation', () => {
      beforeEach(() => {
        process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
      });

      it('should fail when AGENT_SCHEDULER_URL is not set', () => {
        delete process.env.AGENT_SCHEDULER_URL;
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('AGENT_SCHEDULER_URL environment variable is required but not set');
      });

      it('should fail when AGENT_SCHEDULER_URL is empty string', () => {
        process.env.AGENT_SCHEDULER_URL = '';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('AGENT_SCHEDULER_URL environment variable is required but not set');
      });

      it('should fail when AGENT_SCHEDULER_URL is not a valid URL', () => {
        process.env.AGENT_SCHEDULER_URL = 'not-a-url';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('AGENT_SCHEDULER_URL contains invalid URL');
      });

      it('should fail when AGENT_SCHEDULER_URL uses invalid protocol', () => {
        process.env.AGENT_SCHEDULER_URL = 'ftp://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('AGENT_SCHEDULER_URL must use http: or https: protocol');
      });

      it('should pass with valid HTTP URL', () => {
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('should pass with valid HTTPS URL', () => {
        process.env.AGENT_SCHEDULER_URL = 'https://scheduler.example.com';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('PORT validation', () => {
      beforeEach(() => {
        process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
      });

      it('should pass when PORT is not set (uses default)', () => {
        delete process.env.PORT;
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('should fail when PORT is not a number', () => {
        process.env.PORT = 'not-a-number';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('PORT must be a valid number');
      });

      it('should fail when PORT is below valid range', () => {
        process.env.PORT = '0';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('PORT must be between 1 and 65535');
      });

      it('should fail when PORT is above valid range', () => {
        process.env.PORT = '65536';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('PORT must be between 1 and 65535');
      });

      it('should pass with valid PORT', () => {
        process.env.PORT = '8080';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('CORS_ALLOWED_ORIGINS validation', () => {
      beforeEach(() => {
        process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
      });

      it('should pass with warning when CORS_ALLOWED_ORIGINS is not set', () => {
        delete process.env.CORS_ALLOWED_ORIGINS;
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('CORS_ALLOWED_ORIGINS not set, using default development origins');
      });

      it('should fail when CORS_ALLOWED_ORIGINS contains invalid URL', () => {
        process.env.CORS_ALLOWED_ORIGINS = 'not-a-url,http://valid.com';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('CORS_ALLOWED_ORIGINS contains invalid URL');
      });

      it('should pass with valid single origin', () => {
        process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('should pass with multiple valid origins', () => {
        process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com,https://api.example.com';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('Multiple validation errors', () => {
      it('should report all errors when multiple validations fail', () => {
        delete process.env.AGENT_TOOLS_URL;
        delete process.env.AGENT_SCHEDULER_URL;
        process.env.PORT = 'invalid';
        process.env.CORS_ALLOWED_ORIGINS = 'not-a-url';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(4);
      });
    });

    describe('Valid configuration', () => {
      it('should pass with all valid environment variables', () => {
        process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
        process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
        process.env.PORT = '8080';
        process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  describe('validateEnvironmentOrExit', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    afterEach(() => {
      mockExit.mockClear();
    });

    afterAll(() => {
      mockExit.mockRestore();
    });

    it('should call process.exit(1) when validation fails', () => {
      delete process.env.AGENT_TOOLS_URL;
      delete process.env.AGENT_SCHEDULER_URL;
      expect(() => validateEnvironmentOrExit()).toThrow('process.exit(1)');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should not call process.exit when validation passes', () => {
      process.env.AGENT_TOOLS_URL = 'http://localhost:3000';
      process.env.AGENT_SCHEDULER_URL = 'http://localhost:3002';
      validateEnvironmentOrExit();
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
