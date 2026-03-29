import { validateEnvironment, validateEnvironmentOrExit } from '../src/lib/env-validator';

describe('Environment Validator - agent-scheduler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    describe('PORT validation', () => {
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

      it('should pass with origins containing whitespace', () => {
        process.env.CORS_ALLOWED_ORIGINS = ' http://localhost:3000 , https://example.com ';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('DATABASE_PATH validation', () => {
      it('should pass with warning when DATABASE_PATH is not set', () => {
        delete process.env.DATABASE_PATH;
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('DATABASE_PATH not set, using default: data/scheduler.db');
      });

      it('should fail when DATABASE_PATH contains null character', () => {
        process.env.DATABASE_PATH = 'data/test\0.db';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('DATABASE_PATH contains invalid null character');
      });

      it('should pass with valid DATABASE_PATH', () => {
        process.env.DATABASE_PATH = 'data/custom.db';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });

      it('should pass with absolute DATABASE_PATH', () => {
        process.env.DATABASE_PATH = '/var/lib/scheduler/data.db';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
      });
    });

    describe('Multiple validation errors', () => {
      it('should report all errors when multiple validations fail', () => {
        process.env.PORT = 'invalid';
        process.env.CORS_ALLOWED_ORIGINS = 'not-a-url';
        process.env.DATABASE_PATH = 'test\0.db';
        const result = validateEnvironment();
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('Valid configuration', () => {
      it('should pass with all valid environment variables', () => {
        process.env.PORT = '8080';
        process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com';
        process.env.DATABASE_PATH = 'data/custom.db';
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should pass with minimal configuration (all defaults)', () => {
        delete process.env.PORT;
        delete process.env.CORS_ALLOWED_ORIGINS;
        delete process.env.DATABASE_PATH;
        const result = validateEnvironment();
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0); // Should have warnings about defaults
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
      process.env.PORT = 'invalid';
      expect(() => validateEnvironmentOrExit()).toThrow('process.exit(1)');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should not call process.exit when validation passes', () => {
      delete process.env.PORT;
      delete process.env.CORS_ALLOWED_ORIGINS;
      delete process.env.DATABASE_PATH;
      validateEnvironmentOrExit();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('should not call process.exit with valid custom configuration', () => {
      process.env.PORT = '9000';
      process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
      process.env.DATABASE_PATH = 'custom/path.db';
      validateEnvironmentOrExit();
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
