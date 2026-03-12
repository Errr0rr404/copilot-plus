'use strict';

const EventEmitter = require('events');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';

/** Levenshtein edit distance between two strings. */
function _editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * WakeWordListener — always-on keyword detection using whisper.cpp.
 *
 * Records short audio chunks continuously. Whisper transcribes each chunk
 * and checks if it contains the configured wake phrase (or just the keyword
 * without leading filler words like "hey"). Fuzzy matching handles slight
 * transcription errors for unfamiliar proper nouns like "Copilot".
 *
 * Events:
 *   'detected' ()       — wake phrase heard
 *   'heard'    (string) — any speech transcribed (for debug title display)
 *   'error'    (Error)  — non-fatal error
 */
class WakeWordListener extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this._listening = false;
    this._ffmpeg = null;
    this._loopTimer = null;
    this._busy = false;
  }

  get isListening() { return this._listening; }

  async start() {
    if (this._listening) return;
    if (!this.config.audioDevice) {
      throw new Error('No audio device configured. Run: copilot+ --setup');
    }
    if (!this.config.modelPath || !fs.existsSync(this.config.modelPath)) {
      throw new Error('No whisper model found. Run: copilot+ --setup');
    }
    this._listening = true;
    this._scheduleChunk();
  }

  stop() {
    this._listening = false;
    if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }
    if (this._ffmpeg) { try { this._ffmpeg.kill('SIGTERM'); } catch {} this._ffmpeg = null; }
  }

  _scheduleChunk() {
    if (!this._listening) return;
    // Stagger slightly so we don't flood on fast machines
    this._loopTimer = setTimeout(() => this._runChunk(), 100);
  }

  async _runChunk() {
    if (!this._listening || this._busy) { this._scheduleChunk(); return; }
    this._busy = true;

    const chunkSecs = this.config.wakeWord.chunkSeconds || 2;
    const audioFile = path.join(os.tmpdir(), `copilot-wake-${Date.now()}.wav`);

    try {
      await this._record(audioFile, chunkSecs);
      if (!this._listening) return;
      if (!fs.existsSync(audioFile)) return;

      const text = await this._transcribe(audioFile);
      if (text && this._listening) this.emit('heard', text);
      if (this._matchesWakePhrase(text)) {
        this.emit('detected');
      }
    } catch (err) {
      if (this._listening) this.emit('error', err);
    } finally {
      fs.unlink(audioFile, () => {});
      this._busy = false;
      this._scheduleChunk();
    }
  }

  _record(audioFile, seconds) {
    return new Promise((resolve, reject) => {
      const args = IS_WIN
        ? ['-f', 'dshow', '-i', `audio=${this.config.audioDevice}`, '-t', String(seconds), '-ar', '16000', '-ac', '1', '-y', audioFile]
        : ['-f', 'avfoundation', '-i', this.config.audioDevice, '-t', String(seconds), '-ar', '16000', '-ac', '1', '-y', audioFile];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'] });
      this._ffmpeg = proc;
      proc.on('exit', () => { this._ffmpeg = null; resolve(); });
      proc.on('error', reject);
    });
  }

  _transcribe(audioFile) {
    // Use the tiny model if available for lower latency, else fall back to configured model
    const tinyModel = this._findTinyModel() || this.config.modelPath;
    const phrase = ((this.config.wakeWord && this.config.wakeWord.phrase) || 'hey copilot').trim();

    return new Promise((resolve) => {
      execFile('whisper-cli', [
        '-m', tinyModel,
        '-f', audioFile,
        '--prompt', phrase,  // bias transcription toward the wake phrase words
        '-np',               // no extra prints
        '-nt',               // no timestamps
      ], { timeout: 10000 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        const text = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .filter(l => !l.startsWith('[') || !l.endsWith(']'))
          .join(' ')
          .toLowerCase();
        resolve(text);
      });
    });
  }

  _matchesWakePhrase(text) {
    if (!text) return false;
    const phrase = ((this.config.wakeWord && this.config.wakeWord.phrase) || 'hey copilot')
      .toLowerCase()
      .trim();

    // Strip punctuation so "Hey, Copilot." or "Hey Copilot!" both normalize cleanly.
    const normalized = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Build variants to match against:
    //   1. Full phrase:        "hey copilot"
    //   2. Without leading fillers: "copilot"  (so saying just "Copilot" also works)
    const fillers = new Set(['hey', 'ok', 'okay', 'hi', 'hello', 'yo']);
    const phraseWords = phrase.split(/\s+/);
    const phrasesToTry = [phraseWords];
    let i = 0;
    while (i < phraseWords.length - 1 && fillers.has(phraseWords[i])) i++;
    if (i > 0) phrasesToTry.push(phraseWords.slice(i));

    const textWords = normalized.split(/\s+/).filter(w => w.length > 0);
    if (textWords.length === 0) return false;

    for (const pWords of phrasesToTry) {
      // Exact substring match first (fast path).
      if (normalized.includes(pWords.join(' '))) return true;

      // Fuzzy match: each phrase word must find a close-enough word in the transcription.
      // Tolerance = max(1, round(40% of word length)) so:
      //   "hey"     (3) → 1 edit   "copilot" (7) → 3 edits
      // This handles "coballot" → "copilot" (distance 3).
      if (pWords.every(pw => {
        const maxDist = Math.max(1, Math.round(pw.length * 0.4));
        return textWords.some(tw => _editDistance(pw, tw) <= maxDist);
      })) return true;
    }

    return false;
  }

  _findTinyModel() {
    const candidates = [
      path.join(os.homedir(), '.copilot', 'models', 'ggml-tiny.en.bin'),
      path.join(os.homedir(), '.copilot', 'models', 'ggml-base.en.bin'),
      // macOS Homebrew paths
      '/opt/homebrew/share/whisper.cpp/models/ggml-tiny.en.bin',
      '/usr/local/share/whisper.cpp/models/ggml-tiny.en.bin',
      // Windows common paths
      path.join(os.homedir(), 'AppData', 'Local', 'whisper.cpp', 'models', 'ggml-tiny.en.bin'),
      path.join(os.homedir(), 'AppData', 'Local', 'whisper.cpp', 'models', 'ggml-base.en.bin'),
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
  }
}

module.exports = WakeWordListener;
