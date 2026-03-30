#!/usr/bin/env node
/**
 * Trello integration — syncs sprint state to a Trello board.
 *
 * Setup (one-time):
 *   1. Get API key: https://trello.com/app-key
 *   2. Get token: https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_KEY
 *   3. Add to .env:
 *        TRELLO_API_KEY=your_key
 *        TRELLO_TOKEN=your_token
 *   4. Run: node scripts/setup-trello-board.js
 *      → sets TRELLO_BOARD_ID in .env automatically
 *
 * Usage:
 *   const trello = require('./lib/trello');
 *   await trello.syncTask({ id: 'T-001', prompt: 'Add /ping endpoint', stage: 'In Progress' });
 */

'use strict';

const path = require('path');

const BASE = 'https://api.trello.com/1';

function getAuth() {
  const key   = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) return null;
  return { key, token };
}

async function trelloFetch(method, endpoint, body = null) {
  const auth = getAuth();
  if (!auth) throw new Error('Trello not configured — set TRELLO_API_KEY and TRELLO_TOKEN in .env');

  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('key', auth.key);
  url.searchParams.set('token', auth.token);

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url.toString(), opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`Trello ${method} ${endpoint} → ${data.message || res.status}`);
  return data;
}

// ── Board setup ───────────────────────────────────────────────────────────────

const COLUMNS = ['Backlog', 'Sprint Planning', 'In Progress', 'In Review', 'Done', 'Blocked'];

async function createBoard(name = 'Agent Sprint Board') {
  const board = await trelloFetch('POST', '/boards/', {
    name,
    defaultLists: false,
    prefs_permissionLevel: 'private',
  });

  // Create columns as lists
  const lists = {};
  for (const col of COLUMNS) {
    const list = await trelloFetch('POST', '/lists', { name: col, idBoard: board.id });
    lists[col] = list.id;
  }

  return { boardId: board.id, url: board.url, lists };
}

async function getBoardLists(boardId) {
  const lists = await trelloFetch('GET', `/boards/${boardId}/lists`);
  const map = {};
  for (const l of lists) map[l.name] = l.id;
  return map;
}

// ── Card management ───────────────────────────────────────────────────────────

const cardCache = new Map(); // taskId → cardId

async function getOrCreateCard(boardId, listId, taskId, prompt) {
  // Check cache first
  if (cardCache.has(taskId)) return cardCache.get(taskId);

  // Search existing cards in board
  try {
    const cards = await trelloFetch('GET', `/boards/${boardId}/cards`);
    const existing = cards.find(c => c.name.startsWith(`[${taskId}]`));
    if (existing) {
      cardCache.set(taskId, existing.id);
      return existing.id;
    }
  } catch (_) {}

  // Create new card
  const card = await trelloFetch('POST', '/cards', {
    idList:   listId,
    name:     `[${taskId}] ${prompt.slice(0, 80)}`,
    desc:     prompt,
    pos:      'top',
  });
  cardCache.set(taskId, card.id);
  return card.id;
}

async function moveCard(cardId, listId) {
  return trelloFetch('PUT', `/cards/${cardId}`, { idList: listId });
}

async function addComment(cardId, text) {
  return trelloFetch('POST', `/cards/${cardId}/actions/comments`, { text });
}

// ── Sync sprint state ─────────────────────────────────────────────────────────

const STAGE_TO_COLUMN = {
  queued:           'Backlog',
  'sprint planning':'Sprint Planning',
  working:          'In Progress',
  review:           'In Review',
  done:             'Done',
  blocked:          'Blocked',
};

async function syncTask({ id, prompt, stage, summary }) {
  const boardId = process.env.TRELLO_BOARD_ID;
  if (!boardId) return; // not configured — silently skip

  try {
    const lists  = await getBoardLists(boardId);
    const column = STAGE_TO_COLUMN[stage?.toLowerCase()] || 'Backlog';
    const listId = lists[column];
    if (!listId) return;

    const cardId = await getOrCreateCard(boardId, listId, id, prompt || id);
    await moveCard(cardId, listId);
    if (summary) await addComment(cardId, `**${stage}**: ${summary.slice(0, 1000)}`);
  } catch (err) {
    // Non-fatal — Trello sync failure never blocks the pipeline
    require('./memory').log(`Trello sync failed (${id}): ${err.message}`);
  }
}

// ── Full sprint sync ──────────────────────────────────────────────────────────

async function syncSprint(sprintState) {
  if (!getAuth() || !process.env.TRELLO_BOARD_ID) return;

  const tasks = [
    ...sprintState.queue.map(t     => ({ ...t, stage: 'queued' })),
    ...sprintState.active.map(t    => ({ ...t, stage: 'working' })),
    ...sprintState.completed.map(t => ({ ...t, stage: 'done' })),
    ...sprintState.blocked.map(t   => ({ ...t, stage: 'blocked' })),
  ];

  for (const task of tasks) {
    await syncTask({ id: task.id, prompt: task.prompt, stage: task.stage, summary: task.summary });
  }
}

module.exports = {
  isConfigured: () => !!(getAuth() && process.env.TRELLO_BOARD_ID),
  createBoard,
  getBoardLists,
  syncTask,
  syncSprint,
};
