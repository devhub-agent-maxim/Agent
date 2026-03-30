import cron from 'node-cron';
import { spawn } from 'child_process';
import { SchedulesRepository } from '../db/schedules-repository';
import { ScheduledTask } from '../db/schedules-repository';

export class SchedulerWorker {
  private repository: SchedulesRepository;
  private runningTasks: Map<number, cron.ScheduledTask>;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.repository = new SchedulesRepository();
    this.runningTasks = new Map();
  }

  /**
   * Start the scheduler worker
   * Loads all enabled schedules and sets up cron jobs for them
   */
  start(): void {
    console.log('[SchedulerWorker] Starting scheduler worker...');
    this.loadSchedules();

    // Check for new/updated schedules every minute
    this.checkInterval = setInterval(() => {
      this.loadSchedules();
    }, 60000); // 60 seconds

    console.log('[SchedulerWorker] Scheduler worker started');
  }

  /**
   * Stop the scheduler worker
   * Stops all running cron jobs
   */
  stop(): void {
    console.log('[SchedulerWorker] Stopping scheduler worker...');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop all running cron tasks
    for (const [id, task] of this.runningTasks.entries()) {
      task.stop();
      console.log(`[SchedulerWorker] Stopped cron task for schedule ID ${id}`);
    }

    this.runningTasks.clear();
    console.log('[SchedulerWorker] Scheduler worker stopped');
  }

  /**
   * Load all enabled schedules and set up cron jobs
   */
  private loadSchedules(): void {
    const enabledSchedules = this.repository.findEnabled();

    // Remove cron tasks for schedules that are no longer enabled or don't exist
    const currentIds = new Set(enabledSchedules.map((s) => s.id));
    for (const [id, task] of this.runningTasks.entries()) {
      if (!currentIds.has(id)) {
        task.stop();
        this.runningTasks.delete(id);
        console.log(`[SchedulerWorker] Removed cron task for schedule ID ${id}`);
      }
    }

    // Add or update cron tasks for enabled schedules
    for (const schedule of enabledSchedules) {
      if (!this.runningTasks.has(schedule.id)) {
        this.setupCronTask(schedule);
      }
    }
  }

  /**
   * Set up a cron task for a schedule
   */
  private setupCronTask(schedule: ScheduledTask): void {
    try {
      // Validate cron expression
      if (!cron.validate(schedule.cron_expression)) {
        console.error(
          `[SchedulerWorker] Invalid cron expression for schedule ID ${schedule.id}: ${schedule.cron_expression}`
        );
        return;
      }

      const task = cron.schedule(schedule.cron_expression, () => {
        this.executeTask(schedule);
      });

      this.runningTasks.set(schedule.id, task);
      console.log(
        `[SchedulerWorker] Set up cron task for schedule ID ${schedule.id}: ${schedule.name} (${schedule.cron_expression})`
      );

      // Calculate and store next run time
      const nextRun = this.getNextRunTime(schedule.cron_expression);
      if (nextRun) {
        this.repository.updateNextRun(schedule.id, nextRun);
      }
    } catch (error) {
      console.error(
        `[SchedulerWorker] Failed to set up cron task for schedule ID ${schedule.id}:`,
        error
      );
    }
  }

  /**
   * Execute a scheduled task
   */
  private executeTask(schedule: ScheduledTask): void {
    const now = Math.floor(Date.now() / 1000);
    console.log(
      `[SchedulerWorker] Executing task: ${schedule.name} (ID: ${schedule.id}) - Command: ${schedule.command}`
    );

    // Update last run time
    this.repository.updateLastRun(schedule.id, now);

    // Parse command and arguments
    const parts = schedule.command.split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    // Spawn child process to execute the command
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('error', (error) => {
      console.error(
        `[SchedulerWorker] Failed to execute task ${schedule.name} (ID: ${schedule.id}):`,
        error
      );
    });

    child.on('close', (code) => {
      console.log(
        `[SchedulerWorker] Task ${schedule.name} (ID: ${schedule.id}) exited with code ${code}`
      );

      // Calculate next run time
      const nextRun = this.getNextRunTime(schedule.cron_expression);
      if (nextRun) {
        this.repository.updateNextRun(schedule.id, nextRun);
      }
    });
  }

  /**
   * Calculate the next run time for a cron expression
   * Returns Unix timestamp in seconds, or null if cannot be calculated
   */
  private getNextRunTime(cronExpression: string): number | null {
    try {
      // This is a simplified calculation
      // In a real implementation, you'd use a library like cron-parser
      // For now, we'll just add 60 seconds as a placeholder
      return Math.floor(Date.now() / 1000) + 60;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the number of active cron tasks
   */
  getActiveTaskCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Get IDs of all active tasks
   */
  getActiveTaskIds(): number[] {
    return Array.from(this.runningTasks.keys());
  }
}
