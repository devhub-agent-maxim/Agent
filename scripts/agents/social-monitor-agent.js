#!/usr/bin/env node
/**
 * Daily Intel Scraper — Morning Brief
 *
 * Sources (all tested and working):
 *   1. YouTube RSS     — raycfu, nateliason (real channel IDs)
 *   2. Reddit JSON     — r/ClaudeAI, r/AutonomousAgents, r/LocalLLaMA, r/MachineLearning
 *   3. GitHub API      — ruvnet/claude-flow, anthropics/claude-code releases
 *   4. Hacker News RSS — filtered for AI/agent content
 *   5. Direct fetch    — raycfu.com, openclaw.report
 *
 * Then runs Sonnet usefulness-filter: only items scoring ≥7/10 reach Telegram.
 *
 * Called by:
 *   • scheduler.scheduleDaily('intel-scraper', 8, 0, ...)  in agent.js
 *   • /monitor Telegram command (on-demand)
 */

'use strict';

require('../lib/config');

const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const http         = require('http');

const { config }    = require('../lib/config');
const { runClaude } = require('../lib/claude-runner');
const memory        = require('../lib/memory');

const ROOT       = path.resolve(__dirname, '..', '..');
const INTEL_FILE = path.join(ROOT, 'memory', 'areas', 'social-intel.md');

// Browser-like User-Agent — required for Reddit and some sites
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[intel] ${new Date().toLocaleTimeString()} ${msg}`);
}

// ── HTTP GET helper (follows redirects) ───────────────────────────────────────

function httpGet(url, extraHeaders = {}, timeoutMs = 12000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));

    const lib    = url.startsWith('https') ? https : http;
    const parsed = new URL(url);

    const opts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      headers:  { 'User-Agent': UA, Accept: '*/*', ...extraHeaders },
    };

    const req = lib.get(opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        res.resume();
        return resolve(httpGet(next, extraHeaders, timeoutMs, redirectCount + 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    });

    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.on('error', reject);
  });
}

// ── XML / RSS helpers ─────────────────────────────────────────────────────────

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').trim();
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseRssItems(xml) {
  // Try <item> (RSS 2.0)
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  const items  = [];
  let m;

  while ((m = itemRe.exec(xml)) !== null) {
    const chunk  = m[1];
    const title  = stripCdata((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link   = stripCdata((chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/) || chunk.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '').trim();
    const date   = (chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || chunk.match(/<dc:date>([\s\S]*?)<\/dc:date>/) || [])[1] || '';
    const desc   = stripTags(stripCdata((chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1] || '')).slice(0,200);
    if (title) items.push({ title: stripTags(title), link, date: date.trim(), desc });
  }

  if (items.length > 0) return items;

  // Atom fallback
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/g;
  while ((m = entryRe.exec(xml)) !== null) {
    const chunk  = m[1];
    const title  = stripCdata((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    const linkM  = chunk.match(/<link[^>]+href="([^"]+)"/);
    const date   = (chunk.match(/<(?:published|updated)>([\s\S]*?)<\/(?:published|updated)>/) || [])[1] || '';
    if (title) items.push({ title: stripTags(title), link: linkM ? linkM[1] : '', date: date.trim(), desc: '' });
  }

  return items;
}

// ── last-seen persistence ─────────────────────────────────────────────────────

function loadLastSeen() {
  if (!fs.existsSync(INTEL_FILE)) return {};
  const raw = fs.readFileSync(INTEL_FILE, 'utf8');
  const m   = raw.match(/^<!-- last_seen: ({.*}) -->/m);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch { return {}; }
}

function saveLastSeen(lastSeen, newEntries) {
  fs.mkdirSync(path.dirname(INTEL_FILE), { recursive: true });

  let existing = fs.existsSync(INTEL_FILE)
    ? fs.readFileSync(INTEL_FILE, 'utf8')
    : '# Social Intelligence Feed\n\n';

  const lsLine = `<!-- last_seen: ${JSON.stringify(lastSeen)} -->`;
  if (existing.includes('<!-- last_seen:')) {
    existing = existing.replace(/^<!-- last_seen:.*-->\n?/m, lsLine + '\n');
  } else {
    existing = lsLine + '\n' + existing;
  }

  if (newEntries.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const block = `\n## ${today}\n${newEntries.map(e => `- **[${e.source}]** [${e.title}](${e.url})`).join('\n')}\n`;
    existing = existing.replace(/^(# Social Intelligence Feed\n)/m, `$1${block}`);
  }

  fs.writeFileSync(INTEL_FILE, existing);
}

// ── Source 1: YouTube RSS ─────────────────────────────────────────────────────
// Real channel IDs found by scraping youtube.com/@handle

const YOUTUBE_CHANNELS = [
  { name: 'raycfu',     id: 'UCICk1RFsC2NpDSlvPR427VQ' },
  { name: 'nateliason', id: 'UCaggiu76cPdLduA8R2lCSQA' },
];

async function scrapeYouTube(lastSeen) {
  const items = [];
  for (const ch of YOUTUBE_CHANNELS) {
    const key   = `yt_${ch.name}`;
    const since = lastSeen[key] ? new Date(lastSeen[key]) : new Date(Date.now() - 7 * 86400000);
    try {
      const url  = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`;
      const xml  = await httpGet(url);
      const feed = parseRssItems(xml);
      let newest = since;
      let count  = 0;
      for (const item of feed.slice(0, 10)) {
        const d = item.date ? new Date(item.date) : new Date(0);
        if (d > since && item.title) {
          items.push({ source: `YouTube/${ch.name}`, title: item.title, url: item.link, date: item.date });
          if (d > newest) newest = d;
          count++;
        }
      }
      lastSeen[key] = newest.toISOString();
      log(`YouTube/${ch.name}: ${count} new`);
    } catch (e) {
      log(`YouTube/${ch.name} failed: ${e.message}`);
    }
  }
  return items;
}

// ── Source 2: Reddit (working with browser UA) ────────────────────────────────

const SUBREDDITS = [
  { name: 'ClaudeAI',          since: 86400 },
  { name: 'AutonomousAgents',  since: 86400 * 3 },
  { name: 'LocalLLaMA',        since: 86400 },
  { name: 'MachineLearning',   since: 86400 },
];

async function scrapeReddit(lastSeen) {
  const items = [];
  for (const sub of SUBREDDITS) {
    const key   = `reddit_${sub.name}`;
    const since = lastSeen[key]
      ? parseInt(lastSeen[key], 10)
      : Math.floor(Date.now() / 1000) - sub.since;

    try {
      const url  = `https://www.reddit.com/r/${sub.name}/new.json?limit=15&raw_json=1`;
      const raw  = await httpGet(url, { Accept: 'application/json' });
      const data = JSON.parse(raw);
      const posts = (data?.data?.children || []).map(c => c.data);
      let newest = since;
      let count  = 0;
      for (const post of posts) {
        if (post.created_utc > since && !post.stickied) {
          items.push({
            source: `Reddit/r/${sub.name}`,
            title:  post.title.slice(0, 200),
            url:    `https://www.reddit.com${post.permalink}`,
            date:   new Date(post.created_utc * 1000).toISOString(),
            score:  post.score,
          });
          if (post.created_utc > newest) newest = post.created_utc;
          count++;
        }
      }
      lastSeen[key] = String(newest);
      log(`Reddit/r/${sub.name}: ${count} new`);
    } catch (e) {
      log(`Reddit/r/${sub.name} failed: ${e.message}`);
    }
  }
  return items;
}

// ── Source 3: GitHub Releases API (no CLI needed) ─────────────────────────────

const GITHUB_REPOS = [
  { repo: 'ruvnet/claude-flow',      label: 'claude-flow' },
  { repo: 'anthropics/claude-code',  label: 'claude-code' },
];

async function scrapeGitHub(lastSeen) {
  const items = [];
  for (const { repo, label } of GITHUB_REPOS) {
    const key    = `gh_${label}`;
    const since  = lastSeen[key] ? new Date(lastSeen[key]) : new Date(Date.now() - 7 * 86400000);
    try {
      const url  = `https://api.github.com/repos/${repo}/releases?per_page=5`;
      const raw  = await httpGet(url, {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      });
      const releases = JSON.parse(raw);
      if (!Array.isArray(releases)) throw new Error('Non-array response');
      let newest = since;
      let count  = 0;
      for (const r of releases) {
        const d = new Date(r.published_at);
        if (d > since) {
          items.push({
            source: `GitHub/${label}`,
            title:  `${r.tag_name}: ${(r.name || r.tag_name).slice(0, 100)}`,
            url:    r.html_url,
            date:   r.published_at,
          });
          if (d > newest) newest = d;
          count++;
        }
      }
      lastSeen[key] = newest.toISOString();
      log(`GitHub/${label}: ${count} new releases`);
    } catch (e) {
      log(`GitHub/${label} failed: ${e.message}`);
    }
  }
  return items;
}

// ── Source 4: Hacker News RSS ─────────────────────────────────────────────────
// Very reliable. Filter for AI/agent-relevant titles in the usefulness filter.

async function scrapeHackerNews(lastSeen) {
  const key   = 'hn_front';
  const since = lastSeen[key] ? new Date(lastSeen[key]) : new Date(Date.now() - 12 * 3600000);
  const items = [];

  try {
    const xml  = await httpGet('https://news.ycombinator.com/rss');
    const feed = parseRssItems(xml);
    let newest = since;
    let count  = 0;

    for (const item of feed.slice(0, 30)) {
      // Only pass items with AI/agent/LLM keywords through to the filter
      // (avoids sending 30 unrelated items to Sonnet)
      const lower = item.title.toLowerCase();
      const relevant = ['agent', 'llm', 'claude', 'openai', 'gpt', 'ai ', 'model', 'autonomous',
        'copilot', 'anthropic', 'gemini', 'mistral', 'rag', 'prompt', 'inference', 'fine-tun',
        'langchain', 'workflow', 'automate', 'bot', 'coding', 'developer'].some(kw => lower.includes(kw));

      if (relevant) {
        const d = item.date ? new Date(item.date) : new Date(0);
        if (d > since || !item.date) {
          items.push({ source: 'HackerNews', title: item.title, url: item.link, date: item.date });
          if (d > newest) newest = d;
          count++;
        }
      }
    }

    lastSeen[key] = newest.toISOString();
    log(`HackerNews: ${count} relevant items`);
  } catch (e) {
    log(`HackerNews failed: ${e.message}`);
  }

  return items;
}

// ── Source 5: Static sites ────────────────────────────────────────────────────

async function scrapeStaticSites(lastSeen) {
  const items = [];

  const sites = [
    { key: 'raycfu', urls: ['https://raycfu.com/rss.xml', 'https://raycfu.com/feed.xml', 'https://raycfu.com/feed'], label: 'raycfu.com' },
  ];

  for (const site of sites) {
    const since = lastSeen[site.key] ? new Date(lastSeen[site.key]) : new Date(Date.now() - 7 * 86400000);
    let xml = null;

    for (const url of site.urls) {
      try { xml = await httpGet(url); break; } catch {}
    }

    if (!xml) { log(`${site.label}: no RSS found`); continue; }

    try {
      const feed = parseRssItems(xml);
      let count  = 0;
      for (const item of feed.slice(0, 5)) {
        const d = item.date ? new Date(item.date) : new Date(0);
        if ((d > since || !item.date) && item.title) {
          items.push({ source: site.label, title: item.title, url: item.link || site.urls[0], date: item.date });
          count++;
        }
      }
      if (feed[0]?.date) lastSeen[site.key] = feed[0].date;
      log(`${site.label}: ${count} new`);
    } catch (e) {
      log(`${site.label} parse error: ${e.message}`);
    }
  }

  return items;
}

// ── Sonnet usefulness filter ───────────────────────────────────────────────────

async function filterForRelevance(rawItems) {
  if (rawItems.length === 0) return [];
  log(`Running Sonnet filter on ${rawItems.length} items...`);

  const itemList = rawItems.map((item, i) =>
    `${i + 1}. [${item.source}] "${item.title}"`
  ).join('\n');

  const prompt = `You are an intelligence filter for a developer building autonomous AI agent systems using Claude Code (OpenClaw-style: persistent agents, Telegram control, worker delegation).

Rate each item 1-10 for usefulness to someone building autonomous Claude Code agents. Be STRICT — most items should score 1-4.

SCORING RULES (follow exactly):
- 9-10: Direct implementation technique, new tool, or specific pattern for autonomous agents/OpenClaw/Claude Code workflows — immediately actionable
- 7-8: Related to LLM agent automation, frameworks (langchain/crew), Claude/Anthropic tooling, or agent coordination patterns — useful context
- 5-6: General AI/ML news, interesting but NOT directly applicable to building agents
- 1-4: Unrelated to autonomous agents, generic tech news, announcements without substance, noise

Items:
${itemList}

Respond ONLY with a JSON array (no other text). Every item must be scored:
[{"index":1,"score":8,"reason":"One sentence explaining why this is useful"},{"index":2,"score":3,"reason":"One sentence why not"}]`;

  const result = await runClaude(prompt, { timeoutMs: 120000, model: 'sonnet' });

  let scores = [];
  try {
    const jsonMatch = result.output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      scores = JSON.parse(jsonMatch[0]);
    } else {
      // Claude failed or returned no JSON — return empty (strict mode)
      log(`Filter: Claude returned no JSON (${result.output.slice(0,80)}) — returning empty`);
      return [];
    }
  } catch (e) {
    log(`Filter parse error: ${e.message} — returning empty`);
    return [];
  }

  // Only include items with score >= 7, sorted by score descending, capped at 10
  const filtered = [];
  for (const s of scores) {
    if (s.score >= 7) {
      const item = rawItems[s.index - 1];
      if (item) filtered.push({ ...item, relevanceScore: s.score, relevanceReason: s.reason });
    }
  }

  // Sort by score (highest first) and cap at 10 items
  filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const capped = filtered.slice(0, 10);

  log(`Filter: ${capped.length}/${rawItems.length} passed (score ≥7, top 10)`);
  return capped;
}

// ── Build Telegram digest ─────────────────────────────────────────────────────

function buildDigest(filteredItems) {
  const today   = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const grouped = {};

  for (const item of filteredItems) {
    if (!grouped[item.source]) grouped[item.source] = [];
    grouped[item.source].push(item);
  }

  const lines = [`🧠 *Intel Brief — ${today}*`, ''];

  for (const [source, items] of Object.entries(grouped)) {
    lines.push(`*${source}*`);
    for (const item of items) {
      lines.push(`• [${item.title.slice(0, 80)}](${item.url}) _(${item.relevanceScore}/10)_`);
      if (item.relevanceReason) lines.push(`  ↳ _${item.relevanceReason}_`);
    }
    lines.push('');
  }

  if (filteredItems.length === 0) {
    lines.push('_No highly-relevant intel today._');
  }

  return lines.join('\n');
}

// ── Telegram send (standalone mode) ──────────────────────────────────────────

async function telegramSend(text, notifyFn) {
  if (notifyFn) return notifyFn(text);
  const token   = config.telegram.botToken;
  const groupId = config.telegram.groupId;
  if (!token || !groupId) { console.log(text); return; }

  const body = JSON.stringify({ chat_id: groupId, text: text.slice(0, 4096), parse_mode: 'Markdown' });
  await new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.on('data', ()=>{}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run(notifyFn) {
  const today = new Date().toISOString().slice(0, 10);
  log(`Intel scraper starting for ${today}`);

  const lastSeen = loadLastSeen();

  // Run all scrapers concurrently
  const [ytItems, redditItems, ghItems, hnItems, siteItems] = await Promise.all([
    scrapeYouTube(lastSeen),
    scrapeReddit(lastSeen),
    scrapeGitHub(lastSeen),
    scrapeHackerNews(lastSeen),
    scrapeStaticSites(lastSeen),
  ]);

  const allRaw = [...ytItems, ...redditItems, ...ghItems, ...hnItems, ...siteItems];
  log(`Total scraped: ${allRaw.length}`);

  // Dedup by URL
  const seen = new Set();
  const deduped = allRaw.filter(item => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  log(`After dedup: ${deduped.length}`);

  // Sonnet filter
  const filtered = deduped.length > 0 ? await filterForRelevance(deduped) : [];

  // Persist
  saveLastSeen(lastSeen, filtered);
  memory.log(filtered.length > 0
    ? `Social monitor: ${filtered.length} findings from ${deduped.length} scraped`
    : 'Social monitor: no new actionable intel');

  // Send digest
  await telegramSend(buildDigest(filtered), notifyFn);

  log(`Done. ${filtered.length} items sent.`);
  return { total: deduped.length, sent: filtered.length, items: filtered };
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error(`[intel] Fatal: ${err.message}`); process.exit(1); });
}
