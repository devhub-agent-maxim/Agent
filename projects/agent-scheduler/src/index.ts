import express, { Express } from 'express';
import dotenv from 'dotenv';
import { initDatabase, closeDatabase } from './db/database';
import schedulesRouter from './routes/schedules';
import { SchedulerWorker } from './workers/scheduler-worker';
import path from 'path';
import { Server } from 'http';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// Routes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent-scheduler' });
});

app.use('/schedules', schedulesRouter);

let server: Server;
let schedulerWorker: SchedulerWorker;

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\nReceived shutdown signal, closing gracefully...');

  const timeout = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 second timeout

  try {
    // Stop scheduler worker
    if (schedulerWorker) {
      schedulerWorker.stop();
    }

    // Close database
    closeDatabase();

    clearTimeout(timeout);
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(timeout);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize database and start server
async function start() {
  try {
    // Initialize database
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'scheduler.db');
    await initDatabase(dbPath);

    // Start scheduler worker
    schedulerWorker = new SchedulerWorker();
    schedulerWorker.start();

    // Start server
    server = app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
start();

export { app, server, schedulerWorker };
