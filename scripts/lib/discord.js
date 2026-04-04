#!/usr/bin/env node
/**
 * Discord webhook task tracker.
 *
 * Posts rich embeds to a Discord channel as tasks move through the pipeline.
 * No bot, no OAuth — just a webhook URL.
 *
 * Setup (30 seconds):
 *   1. Open Discord → your channel → ⚙ Edit Channel → Integrations → Webhooks → New Webhook
 *   2. Copy the webhook URL
 *   3. Add to .env:  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
 *   Done. No restart needed.
 *
 * Usage (automatic — called by orchestrator):
 *   const discord = require('./lib/discord');
 *   await discord.notify({ id, prompt, stage, summary });
 */

'use strict';

// Stage → Discord embed colour (decimal)
const STAGE_COLOR = {
  queued:  0x5865F2, // blurple
  working: 0xFEE75C, // yellow
  review:  0x57F287, // green-ish
  done:    0x57F287, // green
  blocked: 0xED4245, // red
};

const STAGE_EMOJI = {
  queued:  '📋',
  working: '⚡',
  review:  '🔍',
  done:    '✅',
  blocked: '🚫',
};

function getWebhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL || '';
}

function isConfigured() {
  return !!getWebhookUrl();
}

async function send(payload) {
  const url = getWebhookUrl();
  if (!url) return;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Discord webhook failed: ${res.status} ${txt.slice(0, 100)}`);
  }
}

// ── Task status update ────────────────────────────────────────────────────────

async function notify({ id, prompt, stage, summary, pipelineStages }) {
  if (!isConfigured()) return;

  const emoji = STAGE_EMOJI[stage] || '•';
  const color = STAGE_COLOR[stage] || 0x99AAB5;

  const fields = [];

  if (prompt) {
    fields.push({
      name:   'Task',
      value:  prompt.slice(0, 200),
      inline: false,
    });
  }

  if (pipelineStages) {
    fields.push({
      name:   'Pipeline',
      value:  '`' + pipelineStages.join(' → ') + '`',
      inline: false,
    });
  }

  if (summary) {
    fields.push({
      name:   'Result',
      value:  summary.slice(0, 500),
      inline: false,
    });
  }

  await send({
    embeds: [{
      title:       `${emoji} [${id}] — ${stage.toUpperCase()}`,
      color,
      fields,
      footer:      { text: 'DevHub Agent' },
      timestamp:   new Date().toISOString(),
    }],
  });
}

// ── Sprint summary (for standup) ─────────────────────────────────────────────

async function standupSummary(sprintState) {
  if (!isConfigured()) return;

  const { sprint, queue, active, completed, blocked } = sprintState;

  const fields = [];

  if (active.length > 0) {
    fields.push({
      name:   '⚡ Active',
      value:  active.map(t => `\`${t.id}\` ${(t.prompt || '').slice(0, 60)}`).join('\n') || '—',
      inline: false,
    });
  }

  if (completed.slice(-5).length > 0) {
    fields.push({
      name:   '✅ Recently Done',
      value:  completed.slice(-5).map(t => `\`${t.id}\` ${(t.summary || '').slice(0, 60)}`).join('\n') || '—',
      inline: false,
    });
  }

  if (blocked.length > 0) {
    fields.push({
      name:   '🚫 Blocked',
      value:  blocked.map(t => `\`${t.id}\` ${(t.blockReason || '').slice(0, 60)}`).join('\n') || '—',
      inline: false,
    });
  }

  fields.push({
    name:   'Queue',
    value:  `${queue.length} waiting`,
    inline: true,
  });

  await send({
    embeds: [{
      title:     `🌅 Daily Standup — ${new Date().toISOString().slice(0, 10)}`,
      description: `**Sprint:** ${sprint?.goal || 'no active sprint'}`,
      color:     0x5865F2,
      fields,
      footer:    { text: 'DevHub Agent' },
      timestamp: new Date().toISOString(),
    }],
  });
}

// ── Simple text message ───────────────────────────────────────────────────────

async function message(text) {
  if (!isConfigured()) return;
  await send({ content: text });
}

module.exports = { notify, standupSummary, message, isConfigured };
