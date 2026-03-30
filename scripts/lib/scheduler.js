#!/usr/bin/env node
/**
 * Internal scheduler — replaces the external Windows Task Scheduler / cron heartbeat.
 *
 * The agent clocks itself. No external triggers needed.
 * Jobs run inside the same Node.js process as agent.js.
 *
 * Usage:
 *   const scheduler = require('./lib/scheduler');
 *
 *   // Recurring job every 10 min
 *   scheduler.schedule('work-loop', myFn, 10 * 60 * 1000, { runImmediately: true });
 *
 *   // Daily job at 2:00 AM
 *   scheduler.scheduleDaily('nightly', 2, 0, myNightlyFn);
 */

'use strict';

const memory = require('./memory');

// Registry: jobName → { timer, name, type }
const jobs = new Map();

// ── Recurring interval jobs ───────────────────────────────────────────────────

/**
 * Schedule a recurring job on a fixed interval.
 *
 * @param {string}   name           - Unique job name (used for cancel/list)
 * @param {Function} fn             - Async function to call on each tick
 * @param {number}   intervalMs     - Milliseconds between runs
 * @param {object}   [opts]
 * @param {boolean}  [opts.runImmediately] - If true, call fn once right away
 * @returns {NodeJS.Timeout}
 */
function schedule(name, fn, intervalMs, opts = {}) {
  // Cancel existing job with same name
  if (jobs.has(name)) {
    clearInterval(jobs.get(name).timer);
    jobs.delete(name);
  }

  const safeRun = async () => {
    try {
      await fn();
    } catch (err) {
      memory.log(`Scheduler error [${name}]: ${err.message}`);
    }
  };

  if (opts.runImmediately) {
    // Defer slightly so main() finishes initialising first
    setImmediate(safeRun);
  }

  const timer = setInterval(safeRun, intervalMs);
  // Keep the process alive
  timer.unref && timer.ref();

  jobs.set(name, { timer, name, type: 'interval', intervalMs });
  return timer;
}

// ── Daily time-of-day jobs ────────────────────────────────────────────────────

/**
 * Schedule a job to fire once per day at a specific local time.
 * Uses a 1-minute polling interval internally.
 *
 * @param {string}   name    - Unique job name
 * @param {number}   hour    - 0–23
 * @param {number}   minute  - 0–59
 * @param {Function} fn      - Async function to call
 * @returns {NodeJS.Timeout}
 */
function scheduleDaily(name, hour, minute, fn) {
  if (jobs.has(name)) {
    clearInterval(jobs.get(name).timer);
    jobs.delete(name);
  }

  let lastRunDate = null;

  const safeRun = async () => {
    try {
      await fn();
    } catch (err) {
      memory.log(`Daily job error [${name}]: ${err.message}`);
    }
  };

  const timer = setInterval(() => {
    const now     = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    if (
      now.getHours()   === hour   &&
      now.getMinutes() === minute &&
      lastRunDate      !== dateKey
    ) {
      lastRunDate = dateKey;
      safeRun();
    }
  }, 60 * 1000); // check every minute

  timer.unref && timer.ref();
  jobs.set(name, { timer, name, type: 'daily', hour, minute });
  return timer;
}

// ── Control ───────────────────────────────────────────────────────────────────

/**
 * Cancel a scheduled job by name.
 * @param {string} name
 */
function cancel(name) {
  if (jobs.has(name)) {
    clearInterval(jobs.get(name).timer);
    jobs.delete(name);
    memory.log(`Scheduler: cancelled job "${name}"`);
  }
}

/**
 * Cancel all scheduled jobs.
 */
function cancelAll() {
  for (const [name] of jobs) {
    cancel(name);
  }
}

/**
 * List all registered job names.
 * @returns {string[]}
 */
function list() {
  return Array.from(jobs.entries()).map(([name, j]) => {
    if (j.type === 'daily') {
      return `${name} (daily at ${String(j.hour).padStart(2,'0')}:${String(j.minute).padStart(2,'0')})`;
    }
    return `${name} (every ${Math.round(j.intervalMs / 60000)} min)`;
  });
}

module.exports = { schedule, scheduleDaily, cancel, cancelAll, list };
