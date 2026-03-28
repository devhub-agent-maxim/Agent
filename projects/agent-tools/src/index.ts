import express, { Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { Server } from 'http';
import todosRouter from './routes/todos';
import { swaggerSpec } from './swagger';
import { initializeDatabase, closeDatabase } from './db/database';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { corsMiddleware } from './middleware/cors-config';
import { securityHeaders } from './middleware/security-headers';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase();

// Security headers middleware - must be first for all responses
app.use(securityHeaders);

// Request logging middleware - must be before other middleware
app.use(requestLogger);

// CORS middleware - must be before routes and body parsers
app.use(corsMiddleware);

app.use(express.json());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime()
  });
});

// Mount TODO routes
app.use('/todos', todosRouter);

// Error handler must be registered last
app.use(errorHandler);

let server: Server | null = null;

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 10000);

  if (server) {
    server.close((err) => {
      if (err) {
        logger.error('Error during server shutdown', { error: err });
        clearTimeout(shutdownTimeout);
        process.exit(1);
        return;
      }

      try {
        closeDatabase();
        logger.info('Database connection closed');
      } catch (dbErr) {
        logger.error('Error closing database', { error: dbErr });
        clearTimeout(shutdownTimeout);
        process.exit(1);
        return;
      }

      logger.info('Graceful shutdown complete');
      clearTimeout(shutdownTimeout);
      process.exit(0);
    });
  } else {
    try {
      closeDatabase();
      logger.info('Database connection closed');
    } catch (dbErr) {
      logger.error('Error closing database', { error: dbErr });
      clearTimeout(shutdownTimeout);
      process.exit(1);
      return;
    }

    logger.info('Graceful shutdown complete');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  }
}

if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

export default app;
export { gracefulShutdown };
