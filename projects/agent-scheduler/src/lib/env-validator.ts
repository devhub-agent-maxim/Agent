export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvConfig {
  PORT: number;
  DATABASE_PATH: string;
  CORS_ALLOWED_ORIGINS: string[];
}

/**
 * Validates PORT environment variable format
 */
function validatePort(): { valid: boolean; error?: string; value: number } {
  const port = process.env.PORT;
  const defaultPort = 3002;

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
      warning: 'DATABASE_PATH not set, using default: data/scheduler.db'
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
 * Validates all environment variables for agent-scheduler
 * Returns ValidationResult with errors and warnings
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

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
      console.warn(`[env-validator] WARNING: ${warning}`);
    });
  }

  // Exit on errors
  if (!result.valid) {
    console.error('[env-validator] Environment validation failed:');
    result.errors.forEach(error => {
      console.error(`  - ${error}`);
    });
    console.error('\nPlease set the required environment variables and try again.');
    console.error('See README.md for configuration details.');
    process.exit(1);
  }

  console.log('[env-validator] Environment validation passed');
}

/**
 * Gets validated environment configuration
 * Should only be called after validateEnvironmentOrExit()
 */
export function getEnvConfig(): EnvConfig {
  return {
    PORT: parseInt(process.env.PORT || '3002', 10),
    DATABASE_PATH: process.env.DATABASE_PATH || 'data/scheduler.db',
    CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0)
  };
}
