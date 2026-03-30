#!/usr/bin/env node
/**
 * Demo — shows the full orchestrator pipeline end-to-end.
 *
 * Run:  node scripts/demo.js
 *
 * What it does:
 *   1. Queues "Add /ping endpoint to delivery-logistics" via the orchestrator
 *   2. Orchestrator calls Sonnet to decide the pipeline
 *   3. Runs: code-archaeologist → node-backend → code-reviewer → performance-optimizer
 *   4. Each stage logs its JSON result
 *   5. Prints final sprint state
 *
 * No agent.js needs to be running — this is standalone.
 */

'use strict';

require('./lib/config');

const { orch, queueTask, getSprintState } = require('./lib/orchestrator');
const memory = require('./lib/memory');

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║  DevHub Agent — Live Demo                         ║');
console.log('║  Pipeline: archaeologist→specialist→review→perf   ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

let done = false;

// Listen to all pipeline events
orch.on('notify', ({ text }) => {
  console.log('\n📢 Notify:', text.slice(0, 200));
});

orch.on('pipelineDone', ({ taskId, summary }) => {
  console.log(`\n✅ Pipeline complete: ${taskId}`);
  console.log('Summary:', summary.slice(0, 400));
  printSprintState();
  done = true;
});

orch.on('reviewFail', ({ taskId, issues }) => {
  console.log(`\n🚫 Review FAIL on ${taskId}:`);
  issues.forEach(i => console.log(`  [${i.severity}] ${i.issue}`));
  printSprintState();
  done = true;
});

orch.on('stageError', ({ taskId, stage, error }) => {
  console.log(`\n⚠️  Stage error: ${stage} on ${taskId}`);
  console.log('Error:', error.slice(0, 200));
  done = true;
});

function printSprintState() {
  const s = getSprintState();
  console.log('\n📊 Sprint State:');
  console.log(`  Queue:    ${s.queue.length}`);
  console.log(`  Active:   ${s.active.length}`);
  console.log(`  Done:     ${s.completed.length}`);
  console.log(`  Blocked:  ${s.blocked.length}`);
  if (s.completed.length > 0) {
    console.log('\n  Last completed:');
    s.completed.slice(-2).forEach(t => {
      console.log(`    ✅ ${t.id}: ${(t.summary || '').slice(0, 100)}`);
    });
  }
}

// Queue the demo task
const DEMO_TASK = {
  id:          'DEMO-001',
  prompt:      'The delivery-logistics project now has a src/server.ts file with a basic HTTP server. Verify it has GET /ping, GET /health, and GET /api/routes endpoints. Check the TypeScript compiles. Report what you find.',
  projectName: 'delivery-logistics',
};

console.log(`🚀 Queuing demo task: ${DEMO_TASK.id}`);
console.log(`   "${DEMO_TASK.prompt.slice(0, 80)}..."\n`);
memory.log(`Demo triggered: ${DEMO_TASK.id}`);

queueTask(DEMO_TASK.id, DEMO_TASK.prompt, DEMO_TASK.projectName);

// Exit after 10 minutes max regardless
setTimeout(() => {
  if (!done) {
    console.log('\n⏱️  Demo timeout (10 min). Check memory/sprint/current.json for state.');
    printSprintState();
  }
  process.exit(0);
}, 600000);
