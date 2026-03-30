#!/usr/bin/env node
/**
 * One-time Trello board setup.
 *
 * Before running:
 *   1. Go to https://trello.com/app-key  → copy your API Key
 *   2. Click "Token" link on that page   → authorize → copy the token
 *   3. Add to .env:
 *        TRELLO_API_KEY=your_key
 *        TRELLO_TOKEN=your_token
 *
 * Then run:  node scripts/setup-trello-board.js
 *
 * Creates "Agent Sprint Board" with columns:
 *   Backlog → Sprint Planning → In Progress → In Review → Done → Blocked
 * Appends TRELLO_BOARD_ID to .env automatically.
 */

'use strict';

require('./lib/config');
const trello = require('./lib/trello');
const fs     = require('fs');
const path   = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

if (!process.env.TRELLO_API_KEY || !process.env.TRELLO_TOKEN) {
  console.error('\n❌ Missing Trello credentials.');
  console.error('\nQuick setup:');
  console.error('  1. https://trello.com/app-key  → copy API Key');
  console.error('  2. Click "Token" → authorize → copy token');
  console.error('  3. Add to .env:');
  console.error('       TRELLO_API_KEY=your_key');
  console.error('       TRELLO_TOKEN=your_token');
  console.error('  4. Run this script again.\n');
  process.exit(1);
}

async function main() {
  console.log('\nCreating Trello board...');
  const result = await trello.createBoard('Agent Sprint Board');

  console.log(`\n✅ Board created: ${result.url}`);
  console.log(`   ID: ${result.boardId}`);
  console.log('\nColumns created:');
  Object.entries(result.lists).forEach(([name, id]) => {
    console.log(`  ${name}: ${id}`);
  });

  // Append to .env
  const line = `\nTRELLO_BOARD_ID=${result.boardId}\n`;
  fs.appendFileSync(ENV_FILE, line);
  console.log(`\n✅ TRELLO_BOARD_ID appended to .env`);
  console.log('\nRestart agent.js to pick up the new config.');
}

main().catch(err => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
