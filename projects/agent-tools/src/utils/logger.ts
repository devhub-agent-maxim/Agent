import winston from 'winston';

/**
 * Log levels:
 * - error: 0
 * - warn: 1
 * - info: 2
 * - debug: 3
 */

const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Custom log format that combines timestamp with JSON output
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Console format for development - more readable
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

/**
 * Main application logger
 */
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
    })
  ],
  // Don't exit on handled exceptions
  exitOnError: false
});

/**
 * Helper function to create child loggers with additional context
 */
export const createLogger = (context: string) => {
  return logger.child({ context });
};

export default logger;
