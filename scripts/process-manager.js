#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Process Manager — Agent Process Detection                ║
 * ║                                                          ║
 * ║  Finds duplicate agent.js instances running across       ║
 * ║  different working directories with different commits.   ║
 * ║                                                          ║
 * ║  Usage:                                                  ║
 * ║    node scripts/process-manager.js --status              ║
 * ║    node scripts/process-manager.js --check               ║
 * ║                                                          ║
 * ║  Commands:                                               ║
 * ║    --status    Show all agent.js processes with details  ║
 * ║    --check     Warn if multiple agents detected          ║
 * ║    --help      Show this help                            ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Get all running node.exe processes with their details
 * @returns {Promise<Array>} Array of process objects
 */
async function getNodeProcesses() {
  const isWindows = process.platform === 'win32';

  try {
    let stdout;

    if (isWindows) {
      // Windows: Use WMIC to get detailed process info
      const result = await execAsync(
        'wmic process where "name=\'node.exe\'" get processid,commandline /format:csv',
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer for large output
      );
      stdout = result.stdout;
    } else {
      // Unix: Use ps to get process info
      const result = await execAsync('ps aux | grep node');
      stdout = result.stdout;
    }

    const processes = [];

    if (isWindows) {
      // Parse WMIC CSV output
      const lines = stdout.split('\n').filter(line => line.trim());

      for (const line of lines) {
        // Skip header and empty lines
        if (line.startsWith('Node,') || !line.trim()) continue;

        // CSV format: Node,CommandLine,ProcessId
        const parts = line.split(',');
        if (parts.length < 3) continue;

        const commandLine = parts[1] || '';
        const pid = parts[2] ? parseInt(parts[2].trim()) : null;

        if (!pid || !commandLine) continue;

        // Skip non-node processes (we only want node.exe or 'node' commands)
        if (!commandLine.toLowerCase().includes('node')) continue;

        // Extract working directory from command line
        let workingDir = null;
        const cwdMatch = commandLine.match(/--cwd[= ]"([^"]+)"/i) ||
                        commandLine.match(/--cwd[= ]([^\s]+)/i);

        if (cwdMatch) {
          workingDir = cwdMatch[1];
        } else {
          // Try to extract from script path
          const scriptMatch = commandLine.match(/"?([A-Z]:[^"]+?)[\\/]scripts[\\/][^"]+\.js/i);
          if (scriptMatch) {
            workingDir = scriptMatch[1];
          }
        }

        processes.push({
          pid,
          commandLine: commandLine.trim(),
          workingDir,
          platform: 'win32'
        });
      }
    } else {
      // Parse ps output
      const lines = stdout.split('\n').filter(line =>
        line.includes('node') && !line.includes('grep')
      );

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1]);
        const commandLine = parts.slice(10).join(' ');

        processes.push({
          pid,
          commandLine,
          workingDir: null, // Harder to extract on Unix
          platform: 'unix'
        });
      }
    }

    return processes;
  } catch (error) {
    console.error('Error getting node processes:', error.message);
    return [];
  }
}

/**
 * Get git commit SHA for a working directory
 * @param {string} dir - Directory path
 * @returns {Promise<string|null>} Commit SHA or null
 */
async function getGitCommit(dir) {
  if (!dir || !fs.existsSync(dir)) return null;

  try {
    const result = await execAsync('git rev-parse --short HEAD', {
      cwd: dir,
      timeout: 5000
    });
    return result.stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get git branch for a working directory
 * @param {string} dir - Directory path
 * @returns {Promise<string|null>} Branch name or null
 */
async function getGitBranch(dir) {
  if (!dir || !fs.existsSync(dir)) return null;

  try {
    const result = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      timeout: 5000
    });
    return result.stdout.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Try to get working directory from PID using WMIC
 * @param {number} pid - Process ID
 * @returns {Promise<string|null>} Working directory or null
 */
async function getWorkingDirFromPID(pid) {
  if (process.platform !== 'win32') return null;

  try {
    const result = await execAsync(
      `wmic process where "processid=${pid}" get ExecutablePath`,
      { timeout: 5000 }
    );

    const lines = result.stdout.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      const exePath = lines[1].trim();
      // For node.exe, we can't determine working dir from executable path
      // Return null and we'll rely on command line parsing
      return null;
    }
  } catch (error) {
    // Ignore errors
  }

  return null;
}

/**
 * Identify agent.js processes
 * @param {Array} processes - All node processes
 * @returns {Promise<Array>} Agent processes with enriched data
 */
async function identifyAgentProcesses(processes) {
  const agentProcesses = processes.filter(p => {
    const cmd = p.commandLine.toLowerCase();
    return cmd.includes('agent.js') ||
           cmd.includes('scripts\\agent') ||
           cmd.includes('scripts/agent');
  });

  // Enrich with git info
  for (const proc of agentProcesses) {
    // Try to extract working dir from command line if not already set
    if (!proc.workingDir) {
      // Look for patterns like: node scripts\agent.js or "path\scripts\agent.js"
      const match = proc.commandLine.match(/([A-Z]:[^"]+?)[\\/]scripts[\\/]agent\.js/i);
      if (match) {
        proc.workingDir = match[1];
      }
    }

    if (proc.workingDir) {
      proc.gitCommit = await getGitCommit(proc.workingDir);
      proc.gitBranch = await getGitBranch(proc.workingDir);
    }
  }

  return agentProcesses;
}

/**
 * Display process status
 * @param {Array} agentProcesses - Agent processes
 */
function displayStatus(agentProcesses) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Agent Process Status                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (agentProcesses.length === 0) {
    console.log('No agent.js processes found.');
    return;
  }

  console.log(`Found ${agentProcesses.length} agent.js process(es):\n`);

  for (let i = 0; i < agentProcesses.length; i++) {
    const proc = agentProcesses[i];
    console.log(`[${i + 1}] PID: ${proc.pid}`);

    if (proc.workingDir) {
      console.log(`    Working Dir: ${proc.workingDir}`);
    }

    if (proc.gitCommit) {
      console.log(`    Git Commit:  ${proc.gitCommit}`);
    }

    if (proc.gitBranch) {
      console.log(`    Git Branch:  ${proc.gitBranch}`);
    }

    // Show abbreviated command line
    const cmd = proc.commandLine.length > 100
      ? proc.commandLine.substring(0, 100) + '...'
      : proc.commandLine;
    console.log(`    Command:     ${cmd}`);
    console.log('');
  }
}

/**
 * Check for duplicate agents and warn
 * @param {Array} agentProcesses - Agent processes
 * @returns {boolean} True if duplicates detected
 */
function checkDuplicates(agentProcesses) {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Agent Duplicate Check                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  if (agentProcesses.length === 0) {
    console.log('✅ No agent.js processes found.');
    return false;
  }

  if (agentProcesses.length === 1) {
    console.log('✅ Only 1 agent.js process running.');
    const proc = agentProcesses[0];
    console.log(`   PID: ${proc.pid}`);
    if (proc.workingDir) console.log(`   Dir: ${proc.workingDir}`);
    if (proc.gitCommit) console.log(`   Commit: ${proc.gitCommit}`);
    return false;
  }

  // Multiple agents detected
  console.log(`⚠️  WARNING: ${agentProcesses.length} agent.js processes detected!\n`);

  // Check if they're in different directories or different commits
  const uniqueDirs = new Set(
    agentProcesses
      .filter(p => p.workingDir)
      .map(p => p.workingDir)
  );

  const uniqueCommits = new Set(
    agentProcesses
      .filter(p => p.gitCommit)
      .map(p => p.gitCommit)
  );

  if (uniqueDirs.size > 1) {
    console.log(`⚠️  Running from ${uniqueDirs.size} different directories:`);
    uniqueDirs.forEach(dir => console.log(`   - ${dir}`));
    console.log('');
  }

  if (uniqueCommits.size > 1) {
    console.log(`⚠️  Running ${uniqueCommits.size} different git commits:`);
    uniqueCommits.forEach(commit => console.log(`   - ${commit}`));
    console.log('');
  }

  console.log('This can cause:');
  console.log('  • Duplicate log entries in memory/daily/YYYY-MM-DD.md');
  console.log('  • Conflicting memory writes');
  console.log('  • Double Telegram responses');
  console.log('  • Unexpected behavior from old code\n');

  console.log('Processes:');
  agentProcesses.forEach((proc, i) => {
    console.log(`  [${i + 1}] PID ${proc.pid} - ${proc.workingDir || 'unknown dir'} @ ${proc.gitCommit || 'unknown commit'}`);
  });

  console.log('\nRecommendation: Stop all but one agent process.');
  console.log('  Windows: taskkill /PID <pid> /F');
  console.log('  Unix:    kill <pid>\n');

  return true;
}

/**
 * Show help
 */
function showHelp() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Process Manager — Help                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('Usage:');
  console.log('  node scripts/process-manager.js --status');
  console.log('  node scripts/process-manager.js --check');
  console.log('  node scripts/process-manager.js --help\n');
  console.log('Commands:');
  console.log('  --status    Show all agent.js processes with details');
  console.log('  --check     Check for duplicate agents and warn');
  console.log('  --help      Show this help\n');
  console.log('Examples:');
  console.log('  node scripts/process-manager.js --status');
  console.log('  node scripts/process-manager.js --check\n');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  // Get all node processes
  const allProcesses = await getNodeProcesses();

  // Identify agent processes
  const agentProcesses = await identifyAgentProcesses(allProcesses);

  switch (command) {
    case '--status':
      displayStatus(agentProcesses);
      break;

    case '--check':
      const hasDuplicates = checkDuplicates(agentProcesses);
      process.exit(hasDuplicates ? 1 : 0);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  getNodeProcesses,
  identifyAgentProcesses,
  getGitCommit,
  getGitBranch
};
