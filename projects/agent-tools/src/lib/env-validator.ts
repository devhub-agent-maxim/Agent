import { logger } from '../utils/logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvConfig {
  API_KEYS: string[];
  PORT: number;
  DATABASE_PATH: string;
  CORS_ALLOWED_ORIGINS: string[];
}

/**
 * Validates that API_KEYS environment variable is set and contains at least one key
 */
function validateApiKeys(): { valid: boolean; error?: string } {
  const apiKeys = process.env.API_KEYS;

  if (!apiKeys || apiKeys.trim() === '') {
    return {
      valid: false,
      error: 'API_KEYS environment variable is required but not set'
    };
  }

  const keys = apiKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) {
    return {
      valid: false,
      error: 'API_KEYS must contain at least one non-empty key'
    };
  }

  // Check for weak keys
  const weakKeys = keys.filter(k => k.length < 16);
  if (weakKeys.length > 0) {
    return {
      valid: false,
      error: `API_KEYS contains weak keys (< 16 characters): ${weakKeys.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Validates PORT environment variable format
 */
function validatePort(): { valid: boolean; error?: string; value: number } {
  const port = process.env.PORT;
  const defaultPort = 3000;

  if (!port) {
    return { valid: true, value: defaultPort };
  }

  const portNum = parseInt(port, 10);

  if (isNaN(portNum)) {
    return {
      valid: false,
      error: `PORT must be a valid number, got: ${port}`,
      value: defaultPort
    };
  }

  if (portNum < 1 || portNum > 65535) {
    return {
      valid: false,
      error: `PORT must be between 1 and 65535, got: ${portNum}`,
      value: defaultPort
    };
  }

  return { valid: true, value: portNum };
}

/**
 * Validates CORS_ALLOWED_ORIGINS format (comma-separated URLs)
 */
function validateCorsOrigins(): { valid: boolean; error?: string; warning?: string } {
  const origins = process.env.CORS_ALLOWED_ORIGINS;

  if (!origins) {
    return {
      valid: true,
      warning: 'CORS_ALLOWED_ORIGINS not set, using default development origins'
    };
  }

  const originList = origins.split(',').map(o => o.trim()).filter(o => o.length > 0);

  for (const origin of originList) {
    try {
      new URL(origin);
    } catch {
      return {
        valid: false,
        error: `CORS_ALLOWED_ORIGINS contains invalid URL: ${origin}`
      };
    }
  }

  return { valid: true };
}

/**
 * Validates DATABASE_PATH format
 */
function validateDatabasePath(): { valid: boolean; error?: string; warning?: string } {
  const dbPath = process.env.DATABASE_PATH;

  if (!dbPath) {
    return {
      valid: true,
      warning: 'DATABASE_PATH not set, using default: data/todos.db'
    };
  }

  // Check for valid path characters (basic check)
  if (dbPath.includes('\0')) {
    return {
      valid: false,
      error: 'DATABASE_PATH contains invalid null character'
    };
  }

  return { valid: true };
}

/**
 * Validates all environment variables for agent-tools
 * Returns ValidationResult with errors and warnings
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required validations
  const apiKeysResult = validateApiKeys();
  if (!apiKeysResult.valid) {
    errors.push(apiKeysResult.error!);
  }

  // Optional validations with errors
  const portResult = validatePort();
  if (!portResult.valid) {
    errors.push(portResult.error!);
  }

  const corsResult = validateCorsOrigins();
  if (!corsResult.valid) {
    errors.push(corsResult.error!);
  } else if (corsResult.warning) {
    warnings.push(corsResult.warning);
  }

  const dbPathResult = validateDatabasePath();
  if (!dbPathResult.valid) {
    errors.push(dbPathResult.error!);
  } else if (dbPathResult.warning) {
    warnings.push(dbPathResult.warning);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates environment and exits process if validation fails
 * Logs warnings for optional variables
 */
export function validateEnvironmentOrExit(): void {
  const result = validateEnvironment();

  // Log warnings
  if (result.warnings.length > 0) {
    result.warnings.forEach(warning => {
      logger.warn(`Environment validation warning: ${warning}`);
    });
  }

  // Exit on errors
  if (!result.valid) {
    logger.error('Environment validation failed:');
    result.errors.forEach(error => {
      logger.error(`  - ${error}`);
    });
    logger.error('\nPlease set the required environment variables and try again.');
    logger.error('See README.md for configuration details.');
    process.exit(1);
  }

  logger.info('Environment validation passed');
}

/**
 * Gets validated environment configuration
 * Should only be called after validateEnvironmentOrExit()
 */
export function getEnvConfig(): EnvConfig {
  return {
    API_KEYS: (process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0),
    PORT: parseInt(process.env.PORT || '3000', 10),
    DATABASE_PATH: process.env.DATABASE_PATH || 'data/todos.db',
    CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0)
  };
}
