#!/usr/bin/env node
/**
 * Worker tracking tests — verify race condition handling and lifecycle reliability
 *
 * Tests that workers appear in tracking immediately after spawn, handle rapid
 * spawn/complete cycles, and maintain accurate counts under concurrent operations.
 */

'use strict';

const assert = require('assert');
const workers = require('./workers');
const memory = require('./memory');

// Mock memory.log to prevent actual writes during tests
const originalLog = memory.log;
memory.log = () => {};

// Mock memory.buildSystemContext to prevent file reads
const originalBuildContext = memory.buildSystemContext;
memory.buildSystemContext = () => '=== TEST CONTEXT ===\nTest mode active';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test('Worker appears in tracking immediately after spawn', () => {
  const workerId = `TEST-${Date.now()}`;
  const task = 'echo "test"';

  // Spawn worker
  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 1000 });

  // Verify immediately appears in tracking
  assert(pid !== null, 'Spawn should return PID');
  assert(workers.isRunning(workerId), 'Worker should be tracked immediately');
  assert(workers.count() >= 1, 'Worker count should be at least 1');

  const active = workers.listActive();
  const found = active.find(w => w.id === workerId);
  assert(found, 'Worker should appear in listActive()');
  assert.strictEqual(found.pid, pid, 'PID should match');
  assert.strictEqual(found.status, 'running', 'Status should be running');

  // Cleanup
  workers.killWorker(workerId);
});

test('Worker is removed from tracking after completion', (done) => {
  const workerId = `TEST-COMPLETE-${Date.now()}`;
  const task = 'echo "complete"';

  // Register completion handler
  workers.onComplete((id, output, structured) => {
    if (id === workerId) {
      // Verify worker was removed from tracking
      setTimeout(() => {
        assert(!workers.isRunning(workerId), 'Worker should not be tracked after completion');
        const active = workers.listActive();
        const found = active.find(w => w.id === workerId);
        assert(!found, 'Worker should not appear in listActive() after completion');
        done();
      }, 100);
    }
  });

  // Spawn worker
  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert(pid !== null, 'Spawn should succeed');
  assert(workers.isRunning(workerId), 'Worker should be tracked before completion');
});

test('Worker is removed from tracking after error', (done) => {
  const workerId = `TEST-ERROR-${Date.now()}`;
  const task = 'exit 1'; // Will cause error

  // Register error handler
  workers.onError((id, errorMsg) => {
    if (id === workerId) {
      // Verify worker was removed from tracking
      setTimeout(() => {
        assert(!workers.isRunning(workerId), 'Worker should not be tracked after error');
        done();
      }, 100);
    }
  });

  // Spawn worker (will fail)
  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 2000 });
  assert(pid !== null, 'Spawn should succeed initially');
  assert(workers.isRunning(workerId), 'Worker should be tracked before error');
});

test('Worker is removed from tracking after timeout', (done) => {
  const workerId = `TEST-TIMEOUT-${Date.now()}`;
  const task = 'sleep 10'; // Will timeout

  // Register error handler (timeout triggers error handler)
  workers.onError((id, errorMsg) => {
    if (id === workerId && errorMsg.includes('Timed out')) {
      // Verify worker was removed from tracking
      setTimeout(() => {
        assert(!workers.isRunning(workerId), 'Worker should not be tracked after timeout');
        done();
      }, 100);
    }
  });

  // Spawn worker with short timeout
  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 500 });
  assert(pid !== null, 'Spawn should succeed');
  assert(workers.isRunning(workerId), 'Worker should be tracked before timeout');
});

test('Duplicate spawn is rejected', () => {
  const workerId = `TEST-DUP-${Date.now()}`;
  const task = 'echo "test"';

  // First spawn
  const pid1 = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert(pid1 !== null, 'First spawn should succeed');

  // Duplicate spawn (same ID)
  const pid2 = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert.strictEqual(pid2, null, 'Duplicate spawn should be rejected');
  assert.strictEqual(workers.count(), 1, 'Only one worker should be tracked');

  // Cleanup
  workers.killWorker(workerId);
});

test('Multiple workers can run concurrently', () => {
  const worker1 = `TEST-MULTI-1-${Date.now()}`;
  const worker2 = `TEST-MULTI-2-${Date.now()}`;
  const task = 'echo "multi"';

  // Spawn two workers
  const pid1 = workers.spawnWorker(worker1, task, { timeoutMs: 5000 });
  const pid2 = workers.spawnWorker(worker2, task, { timeoutMs: 5000 });

  assert(pid1 !== null, 'First worker should spawn');
  assert(pid2 !== null, 'Second worker should spawn');
  assert(workers.isRunning(worker1), 'Worker 1 should be tracked');
  assert(workers.isRunning(worker2), 'Worker 2 should be tracked');
  assert(workers.count() >= 2, 'At least 2 workers should be tracked');

  // Cleanup
  workers.killWorker(worker1);
  workers.killWorker(worker2);
});

test('listActive returns correct worker metadata', () => {
  const workerId = `TEST-META-${Date.now()}`;
  const task = 'echo "metadata test"';

  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert(pid !== null, 'Spawn should succeed');

  const active = workers.listActive();
  const worker = active.find(w => w.id === workerId);

  assert(worker, 'Worker should be in listActive()');
  assert.strictEqual(worker.id, workerId, 'Worker ID should match');
  assert.strictEqual(worker.pid, pid, 'PID should match');
  assert.strictEqual(worker.status, 'running', 'Status should be running');
  assert(worker.task.includes('metadata test'), 'Task should match');
  assert(typeof worker.runningMs === 'number', 'runningMs should be a number');
  assert(worker.runningMs >= 0, 'runningMs should be non-negative');

  // Cleanup
  workers.killWorker(workerId);
});

test('killAll removes all workers from tracking', () => {
  const worker1 = `TEST-KILL-ALL-1-${Date.now()}`;
  const worker2 = `TEST-KILL-ALL-2-${Date.now()}`;
  const task = 'sleep 10';

  // Spawn multiple workers
  workers.spawnWorker(worker1, task, { timeoutMs: 15000 });
  workers.spawnWorker(worker2, task, { timeoutMs: 15000 });

  const countBefore = workers.count();
  assert(countBefore >= 2, 'At least 2 workers should be running');

  // Kill all
  workers.killAll();

  // Verify all removed
  setTimeout(() => {
    assert(!workers.isRunning(worker1), 'Worker 1 should be removed');
    assert(!workers.isRunning(worker2), 'Worker 2 should be removed');
    assert.strictEqual(workers.count(), 0, 'All workers should be removed');
  }, 100);
});

// ── Run Tests ─────────────────────────────────────────────────────────────────

console.log('\n🧪 Worker Tracking Tests\n');

test('Worker appears in tracking immediately after spawn', () => {
  const workerId = `TEST-${Date.now()}`;
  const task = 'echo "test"';

  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 1000 });

  assert(pid !== null, 'Spawn should return PID');
  assert(workers.isRunning(workerId), 'Worker should be tracked immediately');
  assert(workers.count() >= 1, 'Worker count should be at least 1');

  const active = workers.listActive();
  const found = active.find(w => w.id === workerId);
  assert(found, 'Worker should appear in listActive()');
  assert.strictEqual(found.pid, pid, 'PID should match');
  assert.strictEqual(found.status, 'running', 'Status should be running');

  workers.killWorker(workerId);
});

test('Duplicate spawn is rejected', () => {
  const workerId = `TEST-DUP-${Date.now()}`;
  const task = 'echo "test"';

  const pid1 = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert(pid1 !== null, 'First spawn should succeed');

  const pid2 = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert.strictEqual(pid2, null, 'Duplicate spawn should be rejected');

  workers.killWorker(workerId);
});

test('listActive returns correct worker metadata', () => {
  const workerId = `TEST-META-${Date.now()}`;
  const task = 'echo "metadata test"';

  const pid = workers.spawnWorker(workerId, task, { timeoutMs: 5000 });
  assert(pid !== null, 'Spawn should succeed');

  const active = workers.listActive();
  const worker = active.find(w => w.id === workerId);

  assert(worker, 'Worker should be in listActive()');
  assert.strictEqual(worker.id, workerId, 'Worker ID should match');
  assert.strictEqual(worker.pid, pid, 'PID should match');
  assert.strictEqual(worker.status, 'running', 'Status should be running');
  assert(worker.task.includes('metadata test'), 'Task should match');
  assert(typeof worker.runningMs === 'number', 'runningMs should be a number');

  workers.killWorker(workerId);
});

// ── Summary ───────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n${testsPassed} passed, ${testsFailed} failed\n`);

  // Cleanup
  workers.killAll();
  memory.log = originalLog;
  memory.buildSystemContext = originalBuildContext;

  process.exit(testsFailed > 0 ? 1 : 0);
}, 2000);
