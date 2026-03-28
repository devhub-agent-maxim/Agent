#!/usr/bin/env node
/**
 * Social Monitor Agent — tracks key accounts for actionable patterns
 * Monitored: @nateliason, @FelixCraftAI, @raycfu, @ruvnet on Twitter/X
 * Schedule: Daily 9 AM via Windows Task Scheduler
 * Output: Updates memory/areas/social-intel.md + Telegram digest
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { spawn, execSync } = require('child_process');

const ROOT          = path.resolve(__dirname, '..', '..');
const { config }    = require('../lib/config');
const NOTIFY_SCRIPT = path.join(__dirname, '..', 'notify.js');
const INTEL_FILE    = path.join(ROOT, 'memory', 'areas', 'social-intel.md');
const DAILY_DIR     = path.join(ROOT, 'memory', 'daily');
const CLAUDE_CMD    = config.claude.cmd;
const CLAUDE_TIMEOUT = config.claude.timeoutMs;

const ACCOUNTS = [
  { handle: 'nateliason',   key: 'nateliason' },
  { handle: 'FelixCraftAI', key: 'felixcraftai' },
  { handle: 'raycfu',       key: 'raycfu' },
  { handle: 'ruvnet',       key: 'ruvnet' },
];

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// ── Telegram notification ─────────────────────────────────────────────────────
function notify(message) {
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "${message.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      cwd: ROOT, timeout: 10000,
    });
  } catch (e) {
    log(`Notify failed: ${e.message}`);
  }
}

// ── HTTP GET helper (returns Promise<string>) ─────────────────────────────────
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = Object.assign(require('url').parse(url), {
      headers: { 'User-Agent': 'Mozilla/5.0 social-monitor-agent', ...headers },
    });
    https.get(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location, headers));
      }
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

// ── Front-matter parser / writer ──────────────────────────────────────────────
function parseIntelFile() {
  if (!fs.existsSync(INTEL_FILE)) {
    return { lastSeen: {}, body: '# Social Intelligence Feed\n' };
  }
  const raw = fs.readFileSync(INTEL_FILE, 'utf8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { lastSeen: {}, body: raw };

  const lastSeen = {};
  for (const line of fmMatch[1].split('\n')) {
    const m = line.match(/^\s+(\w+):\s+"(.+)"/);
    if (m) lastSeen[m[1]] = m[2];
  }
  return { lastSeen, body: fmMatch[2] };
}

function writeIntelFile(lastSeen, body) {
  fs.mkdirSync(path.dirname(INTEL_FILE), { recursive: true });
  const fmLines = Object.entries(lastSeen)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n');
  const content = `---\nlast_seen:\n${fmLines}\n---\n${body}`;
  fs.writeFileSync(INTEL_FILE, content);
}

// ── Twitter/X fetch ───────────────────────────────────────────────────────────
async function fetchTwitterPosts(handle, sinceTimestamp) {
  const posts = [];

  // Strategy 1: Twitter API v2 Bearer token
  if (config.twitter.bearerToken) {
    try {
      const query   = encodeURIComponent(`from:${handle}`);
      const url     = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=5&tweet.fields=created_at,text`;
      const raw     = await httpGet(url, { Authorization: `Bearer ${config.twitter.bearerToken}` });
      const data    = JSON.parse(raw);
      const tweets  = (data.data || []);
      for (const t of tweets) {
        const ts = new Date(t.created_at).getTime();
        if (!sinceTimestamp || ts > sinceTimestamp) {
          posts.push({ text: t.text, timestamp: t.created_at, id: t.id });
        }
      }
      return posts;
    } catch (e) {
      log(`Twitter API failed for @${handle}: ${e.message} — falling back to Nitter`);
    }
  }

  // Strategy 2: Nitter RSS (no auth)
  try {
    const url  = `https://nitter.privacydev.net/${handle}/rss`;
    const xml  = await httpGet(url);
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    for (const match of items.slice(0, 5)) {
      const itemXml = match[1];
      const titleM  = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
      const dateM   = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      if (!titleM || !dateM) continue;
      const ts = new Date(dateM[1].trim()).getTime();
      if (!sinceTimestamp || ts > sinceTimestamp) {
        posts.push({ text: titleM[1].trim(), timestamp: new Date(ts).toISOString(), id: String(ts) });
      }
    }
  } catch (e) {
    log(`Nitter RSS failed for @${handle}: ${e.message}`);
  }

  return posts;
}

// ── Instagram fetch ───────────────────────────────────────────────────────────
async function fetchInstagramPosts(sinceTimestamp) {
  if (!config.instagram.accessToken) return [];
  const posts = [];
  try {
    const url = `https://graph.instagram.com/me/media?fields=id,caption,timestamp&access_token=${config.instagram.accessToken}`;
    const raw  = await httpGet(url);
    const data = JSON.parse(raw);
    for (const item of (data.data || []).slice(0, 5)) {
      const ts = new Date(item.timestamp).getTime();
      if (!sinceTimestamp || ts > sinceTimestamp) {
        posts.push({ text: item.caption || '', timestamp: item.timestamp, id: item.id });
      }
    }
  } catch (e) {
    log(`Instagram fetch failed: ${e.message}`);
  }
  return posts;
}

// ── Ask Claude whether a post is actionable ───────────────────────────────────
function askClaude(postText) {
  return new Promise(resolve => {
    const prompt = `A social media post reads:\n\n"${postText}"\n\nIs this actionable for a developer or entrepreneur building autonomous agent systems? Answer "yes" or "no". If yes, in exactly 1 sentence describe the pattern or insight. Format: YES: <insight> or NO`;
    let out = '', timedOut = false;
    const child = spawn(CLAUDE_CMD, ['--print', '--dangerously-skip-permissions', '--no-session-persistence'], {
      cwd: ROOT, env: { ...process.env }, windowsHide: true, shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); resolve(null); }, CLAUDE_TIMEOUT);
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) return;
      const trimmed = out.trim();
      const yesMatch = trimmed.match(/^YES:\s*(.+)/i);
      resolve(yesMatch ? yesMatch[1].trim() : null);
    });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

// ── Append to today's daily note ──────────────────────────────────────────────
function appendToDaily(entry) {
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file  = path.join(DAILY_DIR, `${today}.md`);
  let existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# ${today}\n`;
  const section = '\n## Social Monitor Log\n';
  if (!existing.includes(section.trim())) existing += section;
  existing += `\n- ${new Date().toLocaleTimeString()} — ${entry}`;
  fs.writeFileSync(file, existing);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('Social monitor agent starting...');

  const { lastSeen, body } = parseIntelFile();
  const today    = new Date().toISOString().slice(0, 10);
  const findings = [];

  // Twitter/X accounts
  for (const account of ACCOUNTS) {
    const since    = lastSeen[account.key] ? new Date(lastSeen[account.key]).getTime() : null;
    const posts    = await fetchTwitterPosts(account.handle, since);
    log(`@${account.handle}: ${posts.length} new post(s)`);

    for (const post of posts) {
      const insight = await askClaude(post.text);
      if (insight) {
        findings.push(`- **@${account.handle}**: ${insight}`);
        log(`  Actionable: ${insight}`);
      }
      // Advance last-seen to newest timestamp seen
      if (!lastSeen[account.key] || new Date(post.timestamp) > new Date(lastSeen[account.key])) {
        lastSeen[account.key] = post.timestamp;
      }
    }

    // Always update last-seen to now if we found no newer posts (prevents re-fetching stale)
    if (!lastSeen[account.key]) {
      lastSeen[account.key] = new Date().toISOString();
    }
  }

  // Instagram (no per-account loop — single user token)
  const igSince  = lastSeen['instagram'] ? new Date(lastSeen['instagram']).getTime() : null;
  const igPosts  = await fetchInstagramPosts(igSince);
  log(`Instagram: ${igPosts.length} new post(s)`);
  for (const post of igPosts) {
    const insight = await askClaude(post.text);
    if (insight) {
      findings.push(`- **Instagram**: ${insight}`);
    }
    if (!lastSeen['instagram'] || new Date(post.timestamp) > new Date(lastSeen['instagram'])) {
      lastSeen['instagram'] = post.timestamp;
    }
  }
  if (!lastSeen['instagram'] && config.instagram.accessToken) {
    lastSeen['instagram'] = new Date().toISOString();
  }

  // Write findings to intel file
  let updatedBody = body;
  if (findings.length > 0) {
    const section = `\n## ${today}\n${findings.join('\n')}\n`;
    // Insert after the "# Social Intelligence Feed" heading
    if (updatedBody.includes('# Social Intelligence Feed')) {
      updatedBody = updatedBody.replace(
        '# Social Intelligence Feed\n',
        `# Social Intelligence Feed\n${section}`
      );
    } else {
      updatedBody += section;
    }
  }
  writeIntelFile(lastSeen, updatedBody);

  // Daily note
  const summary = findings.length > 0
    ? `Social monitor: ${findings.length} actionable finding(s)`
    : 'Social monitor: no new actionable intel';
  appendToDaily(summary);

  // Telegram
  if (findings.length > 0) {
    const digest = `*Social Intel — ${today}*\n\n${findings.map(f => f.replace(/\*\*/g, '*')).join('\n')}`;
    notify(digest);
    log(`Sent digest with ${findings.length} finding(s)`);
  } else {
    notify(`Social monitor — ${today}: No new intel today.`);
    log('No actionable findings today.');
  }

  log('Social monitor agent complete.');
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  try {
    execSync(`node "${NOTIFY_SCRIPT}" "Social monitor agent error: ${err.message.replace(/"/g, '')}"`, {
      cwd: ROOT, timeout: 10000,
    });
  } catch (_) {}
  process.exit(1);
});
