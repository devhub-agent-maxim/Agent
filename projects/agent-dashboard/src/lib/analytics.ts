import fs from 'fs';
import path from 'path';

export interface DailyMetrics {
  date: string;
  tasksCompleted: number;
  workerSpawned: number;
  workerSuccess: number;
  workerFailure: number;
  decisionEngineAvailable: boolean;
  workLoopTicks: number;
  avgTaskDurationMs: number;
  totalTaskDurationMs: number;
  commits: number;
}

export interface WeeklyMetrics {
  days: DailyMetrics[];
  summary: {
    totalTasks: number;
    totalWorkers: number;
    successRate: number;
    avgCompletionTimeMs: number;
    avgTasksPerDay: number;
    commits: number;
  };
}

/**
 * Parse a single daily log file and extract metrics
 */
export function parseDailyLog(filePath: string, date: string): DailyMetrics {
  const metrics: DailyMetrics = {
    date,
    tasksCompleted: 0,
    workerSpawned: 0,
    workerSuccess: 0,
    workerFailure: 0,
    decisionEngineAvailable: true,
    workLoopTicks: 0,
    avgTaskDurationMs: 0,
    totalTaskDurationMs: 0,
    commits: 0,
  };

  try {
    if (!fs.existsSync(filePath)) {
      return metrics;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const workerTimes = new Map<string, number>(); // workerId -> spawn timestamp

    for (const line of lines) {
      const trimmed = line.trim();

      // Work loop ticks
      if (trimmed.includes('Work loop tick')) {
        metrics.workLoopTicks++;
      }

      // Decision engine unavailable
      if (trimmed.includes('decision engine unavailable')) {
        metrics.decisionEngineAvailable = false;
      }

      // Worker spawned - extract timestamp and worker ID
      if (trimmed.includes('Spawning worker:') || trimmed.includes('Worker spawned:')) {
        metrics.workerSpawned++;

        // Extract worker ID and timestamp
        const workerMatch = trimmed.match(/AUTO-(\d+)/);
        const timeMatch = trimmed.match(/^-?\s*(\d{1,2}:\d{2}:\d{2})/);

        if (workerMatch && timeMatch) {
          const workerId = workerMatch[1];
          const timeStr = timeMatch[1];
          const timestamp = parseTimeToMs(timeStr);
          workerTimes.set(workerId, timestamp);
        }
      }

      // Worker done/completed - calculate duration
      if (trimmed.includes('Worker done:') || trimmed.includes('Worker AUTO-') && trimmed.includes('completed')) {
        // Extract worker ID and timestamp
        const workerMatch = trimmed.match(/AUTO-(\d+)/);
        const timeMatch = trimmed.match(/^-?\s*(\d{1,2}:\d{2}:\d{2})/);

        if (workerMatch && timeMatch) {
          const workerId = workerMatch[1];
          const timeStr = timeMatch[1];
          const endTime = parseTimeToMs(timeStr);
          const startTime = workerTimes.get(workerId);

          if (startTime !== undefined) {
            const duration = endTime - startTime;
            // Only count positive durations (handles midnight rollover by ignoring negative)
            if (duration > 0 && duration < 24 * 60 * 60 * 1000) {
              metrics.totalTaskDurationMs += duration;
              metrics.tasksCompleted++;
              metrics.workerSuccess++;
            }
            workerTimes.delete(workerId);
          } else {
            // Worker completed but no spawn time found (already counted)
            metrics.workerSuccess++;
          }
        }
      }

      // Task completed entries
      if (trimmed.includes('Task completed:')) {
        // Don't double-count if already counted via "Worker done"
        // This is a fallback for different log formats
      }

      // Commits
      if (trimmed.includes('Committed:') || trimmed.includes('commit ') ||
          (trimmed.includes('Auto-committed') && trimmed.includes('SHA:'))) {
        metrics.commits++;
      }

      // Worker failures (blocked, error, failed)
      if ((trimmed.includes('Worker') && (trimmed.includes('failed') || trimmed.includes('error'))) ||
          trimmed.includes('blocked')) {
        metrics.workerFailure++;
      }
    }

    // Calculate average task duration
    if (metrics.tasksCompleted > 0) {
      metrics.avgTaskDurationMs = Math.round(metrics.totalTaskDurationMs / metrics.tasksCompleted);
    }

  } catch (err) {
    // Return empty metrics on error
  }

  return metrics;
}

/**
 * Parse time string (HH:MM:SS) to milliseconds since midnight
 */
function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.split(':').map(p => parseInt(p, 10));
  if (parts.length !== 3) return 0;

  const [hours, minutes, seconds] = parts;
  return (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
}

/**
 * Get metrics for the last N days
 */
export function getWeeklyMetrics(rootDir: string, days: number = 7, endDate?: Date): WeeklyMetrics {
  const dailyMetrics: DailyMetrics[] = [];
  const today = endDate || new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // Use local date formatting to match daily log file names
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
    const filePath = path.join(rootDir, 'memory', 'daily', `${dateStr}.md`);

    const metrics = parseDailyLog(filePath, dateStr);
    dailyMetrics.unshift(metrics); // Add to beginning so oldest is first
  }

  // Calculate summary statistics
  const totalTasks = dailyMetrics.reduce((sum, m) => sum + m.tasksCompleted, 0);
  const totalWorkers = dailyMetrics.reduce((sum, m) => sum + m.workerSpawned, 0);
  const totalSuccess = dailyMetrics.reduce((sum, m) => sum + m.workerSuccess, 0);
  const totalFailure = dailyMetrics.reduce((sum, m) => sum + m.workerFailure, 0);
  const totalDuration = dailyMetrics.reduce((sum, m) => sum + m.totalTaskDurationMs, 0);
  const commits = dailyMetrics.reduce((sum, m) => sum + m.commits, 0);

  const successRate = totalWorkers > 0 ? (totalSuccess / totalWorkers) * 100 : 0;
  const avgCompletionTimeMs = totalTasks > 0 ? Math.round(totalDuration / totalTasks) : 0;
  const avgTasksPerDay = days > 0 ? totalTasks / days : 0;

  return {
    days: dailyMetrics,
    summary: {
      totalTasks,
      totalWorkers,
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      avgCompletionTimeMs,
      avgTasksPerDay: Math.round(avgTasksPerDay * 10) / 10,
      commits,
    },
  };
}

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms === 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
