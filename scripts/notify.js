#!/usr/bin/env node
/**
 * Outbound Telegram notifier
 * Usage: node scripts/notify.js "Your message here"
 *
 * Call this from any script or agent to ping the user on Telegram.
 * The agent can reach out to YOU — not the other way around.
 */

const BOT_TOKEN = '8488379003:AAHAfDgqLEE2vCQPoL57yyX9rcZdVaOC5ew';
const GROUP_ID  = -1003615225859;
const API       = `https://api.telegram.org/bot${BOT_TOKEN}`;

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Usage: node scripts/notify.js "message"');
  process.exit(1);
}

(async () => {
  try {
    const res  = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: GROUP_ID, text: message, parse_mode: 'Markdown' }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('✅ Notification sent to Telegram');
    } else {
      // Retry without markdown
      await fetch(`${API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: GROUP_ID, text: message }),
      });
      console.log('✅ Notification sent (plain text)');
    }
  } catch (e) {
    console.error('Failed to send notification:', e.message);
    process.exit(1);
  }
})();
