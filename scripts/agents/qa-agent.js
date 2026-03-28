#!/usr/bin/env node
/**
 * QA Agent — runs tests and returns structured results
 * Usage: node scripts/agents/qa-agent.js --project delivery-logistics
 * Or called programmatically: require('./qa-agent').run(projectDir)
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveProjectDir(projectName) {
  return path.join(PROJECT_ROOT, 'projects', projectName);
}

function detectTestCommand(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const testScript = (pkg.scripts && pkg.scripts.test) || '';

  // Node default placeholder — treat as no tests
  if (!testScript || /echo.*no test/i.test(testScript) || testScript.trim() === '') {
    return null;
  }
  return 'npm test';
}

// ── Output parsers ─────────────────────────────────────────────────────────

function parseJest(output) {
  const passed = (output.match(/(\d+) passed/i) || [])[1];
  const failed = (output.match(/(\d+) failed/i) || [])[1];
  const skipped = (output.match(/(\d+) skipped/i) || [])[1];

  const errors = [];
  // Jest failure block: "● <suite> › <test>"
  const failureRe = /● (.+?)\n\n([\s\S]+?)(?=\n● |\n={10}|$)/g;
  let m;
  while ((m = failureRe.exec(output)) !== null) {
    const testName = m[1].trim();
    const body = m[2];
    const msgLine = (body.split('\n').find(l => l.includes('Expected') || l.includes('Error') || l.includes('expect(')) || body).trim();
    const fileLine = (body.match(/\((.+\.test\.[jt]s.+)\)/) || [])[1] || '';
    errors.push({ test: testName, message: msgLine.slice(0, 200), file: fileLine });
  }

  return {
    passed: parseInt(passed || '0', 10),
    failed: parseInt(failed || '0', 10),
    skipped: parseInt(skipped || '0', 10),
    errors,
  };
}

function parseMocha(output) {
  const passMatch = output.match(/(\d+) passing/i);
  const failMatch = output.match(/(\d+) failing/i);
  const skipMatch = output.match(/(\d+) pending/i);

  const errors = [];
  // Mocha failure format: "  N) suite title:\n     AssertionError..."
  const failureRe = /\s+\d+\)\s+(.+?):\n([\s\S]+?)(?=\n\s+\d+\) |\n\s+\d+ passing|$)/g;
  let m;
  while ((m = failureRe.exec(output)) !== null) {
    const testName = m[1].trim();
    const body = m[2];
    const msgLine = body.split('\n').find(l => l.trim()) || '';
    const fileLine = (body.match(/at .+\((.+\.test\.[jt]s.+)\)/) || [])[1] || '';
    errors.push({ test: testName, message: msgLine.trim().slice(0, 200), file: fileLine });
  }

  return {
    passed: parseInt((passMatch || [])[1] || '0', 10),
    failed: parseInt((failMatch || [])[1] || '0', 10),
    skipped: parseInt((skipMatch || [])[1] || '0', 10),
    errors,
  };
}

function parseGeneric(output, exitCode) {
  // Last-resort: look for common pass/fail keywords
  const hasFail = /fail|error|not ok/i.test(output);
  const hasPass = /pass|ok|success/i.test(output);
  return {
    passed: hasPass && !hasFail ? 1 : 0,
    failed: (exitCode !== 0 || hasFail) ? 1 : 0,
    skipped: 0,
    errors: exitCode !== 0 ? [{ test: 'unknown', message: output.slice(-300), file: '' }] : [],
  };
}

function parseOutput(stdout, stderr, exitCode) {
  const combined = stdout + '\n' + stderr;
  if (/Tests:\s+\d+ passed|PASS |FAIL /i.test(combined) || /jest/i.test(combined)) {
    return parseJest(combined);
  }
  if (/passing|failing|pending/i.test(combined) && /mocha/i.test(combined)) {
    return parseMocha(combined);
  }
  return parseGeneric(combined, exitCode);
}

// ── Core runner ───────────────────────────────────────────────────────────────

function run(projectDir) {
  const start = Date.now();

  if (!fs.existsSync(projectDir)) {
    return {
      agent: 'qa-agent',
      status: 'NO_TESTS',
      passed: 0,
      failed: 0,
      errors: [],
      rawOutput: `Project directory not found: ${projectDir}`,
      duration_ms: Date.now() - start,
    };
  }

  const testCmd = detectTestCommand(projectDir);
  if (!testCmd) {
    return {
      agent: 'qa-agent',
      status: 'NO_TESTS',
      passed: 0,
      failed: 0,
      errors: [],
      rawOutput: 'No test script found in package.json',
      duration_ms: Date.now() - start,
    };
  }

  let stdout = '', stderr = '', exitCode = 0;
  try {
    stdout = execSync(testCmd, {
      cwd: projectDir,
      timeout: 120000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    stdout = e.stdout || '';
    stderr = e.stderr || e.message || '';
    exitCode = e.status || 1;
  }

  const parsed = parseOutput(stdout, stderr, exitCode);
  const rawOutput = (stdout + stderr).slice(-1000);

  return {
    agent: 'qa-agent',
    status: parsed.failed > 0 || exitCode !== 0 ? 'FAIL' : 'PASS',
    passed: parsed.passed,
    failed: parsed.failed,
    errors: parsed.errors,
    rawOutput,
    duration_ms: Date.now() - start,
  };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  if (projectIdx === -1 || !args[projectIdx + 1]) {
    console.error('Usage: node scripts/agents/qa-agent.js --project <name>');
    process.exit(1);
  }
  const projectName = args[projectIdx + 1];
  const projectDir = resolveProjectDir(projectName);

  const result = run(projectDir);
  console.log('--- QA RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'FAIL' ? 1 : 0);
}

module.exports = { run, resolveProjectDir };
