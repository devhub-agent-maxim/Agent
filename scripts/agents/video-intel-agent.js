#!/usr/bin/env node
/**
 * Video Intel Agent — TikTok / Instagram Reels Summarizer
 *
 * How it works:
 *   1. Receives a TikTok or Instagram URL (sent by user to Telegram bot)
 *   2. Uses yt-dlp to download auto-captions/subtitles (fastest, no audio needed)
 *   3. If no captions: extracts audio with ffmpeg → transcribes with Whisper
 *   4. Sends transcript to Sonnet → summarized bullet points + relevance score
 *   5. If score ≥6: saves to memory/areas/social-intel.md + notifies via Telegram
 *   6. Always sends summary back to user regardless of score
 *
 * Triggered by:
 *   • Telegram message containing a TikTok or Instagram URL
 *   • Handled in agent.js dispatchCommand()
 *
 * Dependencies (install once):
 *   pip install yt-dlp
 *   pip install openai-whisper   (optional, for audio fallback)
 *   ffmpeg must be on PATH        (already installed ✅)
 */

'use strict';

require('../lib/config');

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { execSync, spawnSync } = require('child_process');

const { runClaude } = require('../lib/claude-runner');
const memory        = require('../lib/memory');

const ROOT       = path.resolve(__dirname, '..', '..');
const INTEL_FILE = path.join(ROOT, 'memory', 'areas', 'social-intel.md');
const TMP_DIR    = path.join(os.tmpdir(), 'agent-video-intel');

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[video-intel] ${new Date().toLocaleTimeString()} ${msg}`); }

// ── URL detection ─────────────────────────────────────────────────────────────

const SUPPORTED_PATTERNS = [
  /tiktok\.com\/@?[\w.]+\/video\/\d+/i,
  /tiktok\.com\/t\/\w+/i,
  /vm\.tiktok\.com\/\w+/i,
  /vt\.tiktok\.com\/\w+/i,          // short share links (e.g. vt.tiktok.com/ZSHJmao5G)
  /instagram\.com\/(p|reel|reels)\/[\w-]+/i,
  /youtube\.com\/shorts\/[\w-]+/i,
  /youtu\.be\/[\w-]+/i,
];

function extractVideoUrl(text) {
  // Pull the first URL from the message
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) return null;
  const url = urlMatch[0].replace(/[)>]+$/, ''); // strip trailing punctuation
  const isSupported = SUPPORTED_PATTERNS.some(p => p.test(url));
  return isSupported ? url : null;
}

function detectPlatform(url) {
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/youtube\.com\/shorts|youtu\.be/i.test(url)) return 'YouTube Shorts';
  return 'Video';
}

// ── Step 1: Try to get auto-captions via yt-dlp ──────────────────────────────

function getCaptionsViaYtDlp(url, outputDir) {
  // Check if yt-dlp is available
  const ytDlp = findYtDlp();
  if (!ytDlp) return null;

  const outTemplate = path.join(outputDir, 'video');
  try {
    // Try to get auto-generated subtitles (fastest path, no video download)
    execSync(
      `"${ytDlp}" --impersonate chrome --skip-download --write-auto-subs --sub-format vtt --sub-langs en --no-playlist -o "${outTemplate}" "${url}"`,
      { timeout: 30000, stdio: 'pipe', encoding: 'utf8' }
    );

    // Also try without --skip-download for the metadata
    const vttFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.vtt'));
    if (vttFiles.length > 0) {
      const vtt = fs.readFileSync(path.join(outputDir, vttFiles[0]), 'utf8');
      return parseVtt(vtt);
    }

    // Try json3 subtitles too
    const jsonFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.json3'));
    if (jsonFiles.length > 0) {
      const raw  = JSON.parse(fs.readFileSync(path.join(outputDir, jsonFiles[0]), 'utf8'));
      return raw.events?.map(e => e.segs?.map(s => s.utf8).join('') || '').join(' ').trim() || null;
    }
  } catch (e) {
    log(`yt-dlp captions failed: ${e.message.slice(0, 100)}`);
  }

  return null;
}

function parseVtt(vtt) {
  // Strip VTT timestamps and tags, deduplicate
  const lines = vtt.split('\n')
    .filter(l => l && !l.includes('-->') && !/^WEBVTT|^\d\d:\d\d/.test(l))
    .map(l => l.replace(/<[^>]+>/g, '').trim())
    .filter(l => l.length > 0);

  // Deduplicate consecutive identical lines (VTT often has repetition)
  const deduped = [];
  let prev = '';
  for (const l of lines) {
    if (l !== prev) { deduped.push(l); prev = l; }
  }
  return deduped.join(' ').trim();
}

// ── Step 2: Extract audio → Whisper transcription ────────────────────────────

function findPython() {
  // Derive Python from yt-dlp location — they share the same Python install.
  // yt-dlp.exe lives in <PythonHome>\Scripts\, python.exe in <PythonHome>\
  const ytDlp = findYtDlp();
  if (ytDlp && ytDlp.includes('Scripts')) {
    const pyHome = path.dirname(path.dirname(ytDlp));
    const pyExe  = path.join(pyHome, 'python.exe');
    if (fs.existsSync(pyExe)) return pyExe;
  }
  // Fallback: explicit known paths
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe'),
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return 'python';
}

function getTranscriptViaAudio(url, outputDir) {
  const ytDlp = findYtDlp();
  if (!ytDlp) throw new Error('yt-dlp not installed. Run: pip install yt-dlp');

  // Download video with audio — TikTok's default "best" picks video-only HEVC; force h264+aac
  // h264_540p is small (~4-8 MB) and always has audio. Fallback: best format that has audio.
  const audioTemplate = path.join(outputDir, 'audio.%(ext)s');
  log('Downloading audio (h264+aac)...');
  const ffmpegDir2 = findFfmpegDir();
  const extraEnv2  = ffmpegDir2
    ? { ...process.env, PATH: ffmpegDir2 + path.delimiter + (process.env.PATH || '') }
    : process.env;

  execSync(
    `"${ytDlp}" --impersonate chrome --no-playlist --format "best[vcodec=h264]/best[acodec!=none]" -o "${audioTemplate}" "${url}"`,
    { timeout: 90000, stdio: 'pipe', encoding: 'utf8', env: extraEnv2 }
  );

  // Find the downloaded audio file
  const videoFile = fs.readdirSync(outputDir).find(f =>
    f.startsWith('audio.') && !f.endsWith('.part')
  );
  if (!videoFile) throw new Error('Audio download failed — no file found');

  // Use forward slashes — Python and ffmpeg on Windows both accept them, no escaping needed
  const videoPath = path.join(outputDir, videoFile).replace(/\\/g, '/');
  const txtPath   = path.join(outputDir, 'transcript.txt').replace(/\\/g, '/');
  const python    = findPython();

  log(`Transcribing with Whisper (python: ${path.basename(python)})...`);

  // Find ffmpeg — may not be on PATH in Windows CMD (start-agent.bat environment)
  const ffmpegDir = findFfmpegDir();

  // Use Whisper Python API directly — CLI entry point is unreliable on Windows.
  // Inject ffmpeg dir into PATH first so Whisper's subprocess.run(['ffmpeg',...]) finds it.
  // Use string concat (not template literal) to avoid backslash escaping issues.
  const pyScript = [
    'import os, sys',
    // Prepend ffmpeg directory to PATH so Whisper can call ffmpeg regardless of shell env
    ffmpegDir
      ? "os.environ['PATH'] = '" + ffmpegDir.replace(/\\/g, '/') + "' + os.pathsep + os.environ.get('PATH', '')"
      : '# ffmpeg dir not found — relying on system PATH',
    'import whisper',
    "model = whisper.load_model('base')",
    "result = model.transcribe('" + videoPath + "', language='en', fp16=False)",
    "with open('" + txtPath + "', 'w', encoding='utf-8') as f:",
    "    f.write(result['text'])",
    "print('OK:', len(result['text']))",
  ].join('\n');

  const result = spawnSync(python, ['-c', pyScript], {
    timeout:  180000,
    encoding: 'utf8',
    env:      { ...process.env },
  });

  if (result.status !== 0 || result.error) {
    const errMsg = (result.stderr || result.error?.message || 'unknown error').slice(0, 300);
    throw new Error(`Whisper failed: ${errMsg}`);
  }

  if (!fs.existsSync(txtPath)) throw new Error('Whisper produced no transcript file');
  return fs.readFileSync(txtPath, 'utf8').trim();
}

// ── Find yt-dlp executable ────────────────────────────────────────────────────

function findYtDlp() {
  // Try several common locations
  const pyHome = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312');
  const candidates = [
    path.join(pyHome, 'Scripts', 'yt-dlp.exe'),
    path.join(pyHome, 'python.exe') + ' -m yt_dlp',
    `"${path.join(pyHome, 'python.exe')}" -m yt_dlp`,
    'yt-dlp',
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
  ];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 });
      return cmd;
    } catch {}
  }
  return null;
}

// ── Find ffmpeg directory ─────────────────────────────────────────────────────
// ffmpeg may be on PATH in bash but not in Windows CMD (start-agent.bat).
// Return its directory so the Python Whisper script can prepend it to PATH.

function findFfmpegDir() {
  const knownPaths = [
    // Standard Windows install location found on this machine
    'C:\\ffmpeg\\ffmpeg-master-latest-win64-gpl-shared\\bin',
    'C:\\ffmpeg\\bin',
    'C:\\Program Files\\ffmpeg\\bin',
    path.join(os.homedir(), 'ffmpeg', 'bin'),
  ];

  for (const dir of knownPaths) {
    if (fs.existsSync(path.join(dir, 'ffmpeg.exe'))) return dir;
  }

  // Try to find via PATH
  try {
    const which = execSync('where ffmpeg', { stdio: 'pipe', timeout: 3000, encoding: 'utf8' }).trim();
    if (which) return path.dirname(which.split('\n')[0].trim());
  } catch {}

  return null;
}

// ── Step 3: Claude Sonnet summarization ──────────────────────────────────────

async function summarize(transcript, url, platform) {
  const prompt = `You are analyzing a ${platform} short-form video for a developer building autonomous AI agents (Claude Code / OpenClaw-style setups).

Video URL: ${url}

Transcript:
"""
${transcript.slice(0, 6000)}
"""

Your tasks:
1. Write 3-6 bullet point takeaways (actionable insights only — skip filler, intros, outros)
2. Rate relevance 1-10 for someone building autonomous AI agents / Claude Code workflows
3. If relevant (≥6): write one sentence on what specifically applies to their work

Format your response EXACTLY like this:

SUMMARY:
• [bullet 1]
• [bullet 2]
• [bullet 3]

SCORE: [1-10]

RELEVANCE: [one sentence, or "Not directly relevant" if score < 6]

SOURCE: ${platform}`;

  const result = await runClaude(prompt, { timeoutMs: 120000, model: 'sonnet' });
  return result.output || '';
}

// ── Step 4: Parse summary output ─────────────────────────────────────────────

function parseSummaryOutput(output) {
  const bullets = [];
  const bulletMatches = output.matchAll(/^[•\-*]\s+(.+)/gm);
  for (const m of bulletMatches) bullets.push(m[1].trim());

  const scoreMatch = output.match(/SCORE:\s*(\d+)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;

  const relevanceMatch = output.match(/RELEVANCE:\s*(.+)/i);
  const relevance = relevanceMatch ? relevanceMatch[1].trim() : '';

  return { bullets, score, relevance };
}

// ── Step 5: Save to intel file ────────────────────────────────────────────────

function saveToIntel(url, platform, bullets, relevance) {
  fs.mkdirSync(path.dirname(INTEL_FILE), { recursive: true });

  const today   = new Date().toISOString().slice(0, 10);
  const time    = new Date().toLocaleTimeString();
  const title   = bullets[0]?.slice(0, 80) || 'Video insight';

  // Read existing
  let existing = fs.existsSync(INTEL_FILE)
    ? fs.readFileSync(INTEL_FILE, 'utf8')
    : '# Social Intelligence Feed\n\n';

  const entry = [
    `\n## ${today} — ${platform} Video`,
    `- **[${platform}]** [${title}…](${url})`,
    ...bullets.map(b => `  - ${b}`),
    relevance ? `  > _${relevance}_` : '',
    '',
  ].filter(l => l !== undefined).join('\n');

  // Insert after heading
  if (existing.includes('# Social Intelligence Feed\n')) {
    existing = existing.replace('# Social Intelligence Feed\n', `# Social Intelligence Feed\n${entry}`);
  } else {
    existing += entry;
  }

  fs.writeFileSync(INTEL_FILE, existing);
  memory.log(`Video intel saved: ${platform} — ${title}`);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Process a video URL and return a formatted summary.
 * @param {string} url          - TikTok/IG/YouTube Shorts URL
 * @param {Function} [notifyFn] - Optional progress notification callback
 * @returns {Promise<string>}   - Formatted message to send back to user
 */
async function processVideo(url, notifyFn) {
  const platform = detectPlatform(url);
  log(`Processing ${platform}: ${url}`);

  if (notifyFn) await notifyFn(`⏳ Processing ${platform} video...`);

  // Temp working directory
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const jobDir = path.join(TMP_DIR, `job_${Date.now()}`);
  fs.mkdirSync(jobDir);

  let transcript = null;

  try {
    // Try captions first (fast)
    if (notifyFn) await notifyFn(`📝 Fetching captions...`);
    transcript = getCaptionsViaYtDlp(url, jobDir);

    if (!transcript || transcript.length < 50) {
      // Fall back to audio transcription
      if (notifyFn) await notifyFn(`🎵 No captions found — extracting audio...`);
      transcript = getTranscriptViaAudio(url, jobDir);
    }
  } catch (e) {
    log(`Transcript error: ${e.message}`);
    return `❌ Could not get transcript: ${e.message}\n\nMake sure yt-dlp is installed: \`pip install yt-dlp\``;
  } finally {
    // Cleanup temp files
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
  }

  if (!transcript || transcript.length < 20) {
    return `⚠️ No transcript available for this video. The creator may have disabled captions.`;
  }

  log(`Transcript length: ${transcript.length} chars`);
  if (notifyFn) await notifyFn(`🧠 Summarizing with AI...`);

  // Summarize
  const rawOutput = await summarize(transcript, url, platform);
  const { bullets, score, relevance } = parseSummaryOutput(rawOutput);

  // Build response message
  const lines = [
    `📱 *${platform} Summary* _(relevance: ${score}/10)_`,
    '',
    ...bullets.map(b => `• ${b}`),
  ];

  if (score >= 6 && relevance && relevance !== 'Not directly relevant') {
    lines.push('', `💡 _${relevance}_`);
    // Save to intel file
    saveToIntel(url, platform, bullets, relevance);
    lines.push('', `✅ _Saved to intel feed_`);
  }

  return lines.join('\n');
}

module.exports = { processVideo, extractVideoUrl };
