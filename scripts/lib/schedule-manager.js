#!/usr/bin/env node
/**
 * Schedule Manager — Integrates agent.js with agent-scheduler service
 *
 * Registers agent tasks with the centralized agent-scheduler REST API.
 * Falls back to in-process scheduler if service is unavailable.
 *
 * Usage:
 *   const scheduleManager = require('./lib/schedule-manager');
 *   await scheduleManager.registerAgentTasks();
 */

'use strict';

const memory = require('./memory');
const scheduler = require('./scheduler');

const SCHEDULER_API = process.env.AGENT_SCHEDULER_URL || 'http://localhost:3002';
const AGENT_SCRIPT = process.env.AGENT_SCRIPT_PATH || 'node scripts/agent.js';

/**
 * Check if agent-scheduler service is available
 */
async function isSchedulerAvailable() {
  try {
    const response = await fetch(`${SCHEDULER_API}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    const data = await response.json();
    return data.status === 'ok' && data.service === 'agent-scheduler';
  } catch (err) {
    return false;
  }
}

/**
 * Register a task with agent-scheduler service
 */
async function registerSchedule(name, cronExpression, command, description) {
  try {
    const response = await fetch(`${SCHEDULER_API}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        cron_expression: cronExpression,  // API expects snake_case
        command,
        description,
        enabled: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to register schedule');
    }

    const data = await response.json();
    memory.log(`Scheduler: registered "${name}" with agent-scheduler (ID: ${data.id})`);
    return data;
  } catch (err) {
    throw new Error(`Failed to register ${name}: ${err.message}`);
  }
}

/**
 * Get all schedules from agent-scheduler
 */
async function listSchedules() {
  try {
    const response = await fetch(`${SCHEDULER_API}/schedules`);
    if (!response.ok) {
      throw new Error('Failed to fetch schedules');
    }
    const data = await response.json();
    // API returns { schedules: [...], count: N }
    return data.schedules || [];
  } catch (err) {
    throw new Error(`Failed to list schedules: ${err.message}`);
  }
}

/**
 * Delete a schedule from agent-scheduler
 */
async function deleteSchedule(id) {
  try {
    const response = await fetch(`${SCHEDULER_API}/schedules/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete schedule');
    }
    memory.log(`Scheduler: deleted schedule ID ${id}`);
  } catch (err) {
    throw new Error(`Failed to delete schedule: ${err.message}`);
  }
}

/**
 * Register all agent tasks with agent-scheduler service.
 * Uses hybrid approach: in-process execution + external persistence/monitoring
 * Returns { mode: 'hybrid' | 'in-process-only', schedules: [...] }
 */
async function registerAgentTasks(options = {}) {
  const {
    workLoopFn,
    dailyBriefFn,
    nightlyConsolidationFn,
  } = options;

  // Always register in-process scheduler for actual execution
  // This ensures tasks have access to agent's in-memory state
  if (workLoopFn) {
    scheduler.schedule('work-loop', workLoopFn, 10 * 60 * 1000, { runImmediately: true });
    console.log('[Scheduler] Work loop registered (in-process) — every 10 min');
  }

  if (nightlyConsolidationFn) {
    scheduler.scheduleDaily('nightly-consolidation', 2, 0, nightlyConsolidationFn);
    console.log('[Scheduler] Nightly consolidation registered (in-process) — daily at 02:00');
  }

  if (dailyBriefFn) {
    scheduler.scheduleDaily('daily-brief', 7, 0, dailyBriefFn);
    console.log('[Scheduler] Daily brief registered (in-process) — daily at 07:00');
  }

  // Try to also register with external scheduler for persistence/monitoring
  const available = await isSchedulerAvailable();

  if (!available) {
    memory.log('Scheduler: agent-scheduler unavailable — using in-process only');
    console.log('⚠️  agent-scheduler service not available — in-process scheduler only');

    return {
      mode: 'in-process-only',
      schedules: scheduler.list(),
    };
  }

  // Service is available — register for monitoring/persistence
  console.log('✓ agent-scheduler service available — registering for monitoring');
  memory.log('Scheduler: using hybrid mode (in-process execution + external monitoring)');

  try {
    // Check for existing schedules and clean up
    const existing = await listSchedules();
    const agentSchedules = existing.filter(s =>
      s.name.startsWith('agent-') || ['work-loop', 'nightly-consolidation', 'daily-brief'].includes(s.name)
    );

    for (const schedule of agentSchedules) {
      await deleteSchedule(schedule.id);
    }

    const registered = [];

    // Register work loop (every 10 minutes) - for monitoring only
    if (workLoopFn) {
      const result = await registerSchedule(
        'agent-work-loop',
        '*/10 * * * *',
        'echo "Work loop executed by in-process scheduler"',
        'Agent work loop — checks goals and spawns workers (in-process)'
      );
      registered.push(result);
    }

    // Register nightly consolidation (daily at 2:00 AM) - for monitoring only
    if (nightlyConsolidationFn) {
      const result = await registerSchedule(
        'agent-nightly-consolidation',
        '0 2 * * *',
        'echo "Nightly consolidation executed by in-process scheduler"',
        'Nightly consolidation — prepares tomorrow\'s daily note (in-process)'
      );
      registered.push(result);
    }

    // Register daily brief (daily at 7:00 AM) - for monitoring only
    if (dailyBriefFn) {
      const result = await registerSchedule(
        'agent-daily-brief',
        '0 7 * * *',
        'echo "Daily brief executed by in-process scheduler"',
        'Daily brief — GitHub + overnight summary (in-process)'
      );
      registered.push(result);
    }

    console.log('✓ Registered with external scheduler for monitoring/persistence');

    return {
      mode: 'hybrid',
      schedules: {
        inProcess: scheduler.list(),
        external: registered,
      },
    };
  } catch (err) {
    // Registration failed but in-process scheduler is already running
    memory.log(`Scheduler: external registration failed (${err.message}) — continuing with in-process`);
    console.log(`⚠️  Failed to register with agent-scheduler: ${err.message}`);
    console.log('   Continuing with in-process scheduler only');

    return {
      mode: 'in-process-only',
      schedules: scheduler.list(),
    };
  }
}

/**
 * Stop all scheduled tasks (both external and in-process)
 */
async function stopAllTasks() {
  // Stop in-process scheduler
  scheduler.cancelAll();

  // Try to stop external scheduler tasks
  try {
    const available = await isSchedulerAvailable();
    if (available) {
      const existing = await listSchedules();
      const agentSchedules = existing.filter(s =>
        s.name.startsWith('agent-') || ['work-loop', 'nightly-consolidation', 'daily-brief'].includes(s.name)
      );

      for (const schedule of agentSchedules) {
        await deleteSchedule(schedule.id);
      }
    }
  } catch (err) {
    memory.log(`Scheduler: failed to clean up external schedules: ${err.message}`);
  }
}

module.exports = {
  isSchedulerAvailable,
  registerAgentTasks,
  registerSchedule,
  listSchedules,
  deleteSchedule,
  stopAllTasks,
  SCHEDULER_API,
};
