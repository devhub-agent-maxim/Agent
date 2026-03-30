'use strict';
// Crash-restart wrapper — spawns agent.js and restarts it if it exits unexpectedly.
// Used by the Windows Startup shortcut instead of calling agent.js directly.
const { spawn } = require('child_process');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const AGENT     = path.join(__dirname, 'agent.js');
const NODE      = process.execPath;
const RESTART_DELAY_MS = 5000;

function start() {
  const child = spawn(NODE, [AGENT], {
    cwd:   ROOT,
    stdio: 'inherit',
    env:   { ...process.env },
  });

  child.on('exit', (code, signal) => {
    if (signal === 'SIGINT' || code === 0) {
      process.exit(code || 0);
    }
    console.error(`[run-forever] Agent exited (code=${code}). Restarting in ${RESTART_DELAY_MS / 1000}s...`);
    setTimeout(start, RESTART_DELAY_MS);
  });

  child.on('error', (err) => {
    console.error(`[run-forever] Spawn error: ${err.message}. Retrying in ${RESTART_DELAY_MS / 1000}s...`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

start();
