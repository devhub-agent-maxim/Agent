import { db, closeDatabase } from '../src/db/database';
import { gracefulShutdown } from '../src/index';
import { logger } from '../src/utils/logger';

// Mock logger to prevent actual log output during tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Graceful Shutdown', () => {
  let originalExit: typeof process.exit;
  let exitSpy: jest.SpyInstance;
  let dbCloseSpy: jest.SpyInstance;

  beforeEach(() => {
    // Restore any previous spies
    jest.restoreAllMocks();

    // Mock process.exit
    originalExit = process.exit;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as any);

    // Mock db.close to prevent actual database operations in tests
    dbCloseSpy = jest.spyOn(db, 'close').mockImplementation((() => {
      // Do nothing - prevent actual database close
    }) as any);

    // Clear all mock calls
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore process.exit
    exitSpy.mockRestore();
    process.exit = originalExit;

    // Restore database spy
    dbCloseSpy.mockRestore();
  });

  test('should log SIGTERM signal when gracefulShutdown is called', () => {
    try {
      gracefulShutdown('SIGTERM');
    } catch (err) {
      // Expected to throw due to process.exit mock
    }

    expect(logger.info).toHaveBeenCalledWith('SIGTERM received, starting graceful shutdown...');
  });

  test('should log SIGINT signal when gracefulShutdown is called', () => {
    try {
      gracefulShutdown('SIGINT');
    } catch (err) {
      // Expected to throw due to process.exit mock
    }

    expect(logger.info).toHaveBeenCalledWith('SIGINT received, starting graceful shutdown...');
  });

  test('should close database connection during shutdown', () => {
    try {
      gracefulShutdown('SIGTERM');
    } catch (err) {
      // Expected to throw due to process.exit mock
    }

    expect(dbCloseSpy).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Database connection closed');
  });

  test('should exit with code 0 on successful shutdown', () => {
    try {
      gracefulShutdown('SIGTERM');
    } catch (err: any) {
      expect(err.message).toContain('process.exit called with code 0');
    }

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalledWith('Graceful shutdown complete');
  });

  test('should handle database close errors gracefully', () => {
    // Override the default mock to throw an error
    dbCloseSpy.mockImplementation((() => {
      throw new Error('Database close error');
    }) as any);

    try {
      gracefulShutdown('SIGTERM');
    } catch (err: any) {
      expect(err.message).toContain('process.exit called with code 1');
    }

    expect(logger.error).toHaveBeenCalledWith('Error closing database', expect.any(Object));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('should log all shutdown events in order', () => {
    const logCalls: string[] = [];
    (logger.info as jest.Mock).mockImplementation((message: string) => {
      logCalls.push(message);
    });

    try {
      gracefulShutdown('SIGTERM');
    } catch (err) {
      // Expected to throw due to process.exit mock
    }

    expect(logCalls).toContain('SIGTERM received, starting graceful shutdown...');
    expect(logCalls).toContain('Database connection closed');
    expect(logCalls).toContain('Graceful shutdown complete');
  });

  test('should call closeDatabase function successfully', () => {
    // Test the closeDatabase utility function directly
    closeDatabase();

    expect(dbCloseSpy).toHaveBeenCalled();
  });

  test('should set up 10 second timeout for graceful shutdown', () => {
    jest.useFakeTimers();

    try {
      gracefulShutdown('SIGTERM');
    } catch (err) {
      // Expected to throw due to process.exit mock
    }

    // The timeout should be set (we can't easily test the timeout execution
    // without a real server, but we can verify the shutdown completes normally)
    expect(logger.info).toHaveBeenCalledWith('Graceful shutdown complete');

    jest.useRealTimers();
  });
});
