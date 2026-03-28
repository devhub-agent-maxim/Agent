import { logger, createLogger } from '../src/utils/logger';
import winston from 'winston';

describe('Logger', () => {
  describe('logger configuration', () => {
    it('should create a winston logger instance', () => {
      expect(logger).toBeInstanceOf(winston.Logger);
    });

    it('should have correct log level from environment or default to info', () => {
      const expectedLevel = process.env.LOG_LEVEL || 'info';
      expect(logger.level).toBe(expectedLevel);
    });

    it('should have console transport configured', () => {
      expect(logger.transports).toHaveLength(1);
      expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
    });

    it('should not exit on handled exceptions', () => {
      expect(logger.exitOnError).toBe(false);
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      // Mock console methods to avoid test output pollution
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'info').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log error messages', () => {
      expect(() => {
        logger.error('Test error message');
      }).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('should log info messages', () => {
      expect(() => {
        logger.info('Test info message');
      }).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => {
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('should log with metadata object', () => {
      expect(() => {
        logger.info('Test message with metadata', {
          userId: '123',
          action: 'test'
        });
      }).not.toThrow();
    });
  });

  describe('createLogger', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create a child logger with context', () => {
      const childLogger = createLogger('TestContext');
      expect(childLogger).toBeInstanceOf(winston.Logger);
    });

    it('should include context in child logger metadata', () => {
      const childLogger = createLogger('TestContext');
      expect(() => {
        childLogger.info('Test message');
      }).not.toThrow();
    });
  });
});
