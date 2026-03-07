'use strict';

const EventEmitter = require('events');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';

/**
 * WakeWordListener — always-on keyword detection using whisper.cpp + VAD.
 *
 * Records short audio chunks continuously. When VAD detects speech,
 * whisper transcribes it and checks if the transcription contains the
 * configured wake phrase. No extra dependencies — uses the same
 * whisper-cli and ffmpeg already required by voice recording.
 *
 * Events:
 *   'detected' ()      — wake phrase heard
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

    return new Promise((resolve) => {
      execFile('whisper-cli', [
        '-m', tinyModel,
        '-f', audioFile,
        '--vad',          // skip silent segments
        '-np',            // no extra prints
        '-nt',            // no timestamps
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
    // Allow partial matches — "hey copilot" matches "hey copilot can you..."
    return text.includes(phrase);
  }

  _findTinyModel() {
    const candidates = [
      path.join(os.homedir(), '.copilot', 'models', 'ggml-tiny.en.bin'),
      path.join(os.homedir(), '.copilot', 'models', 'ggml-base.en.bin'),
      '/opt/homebrew/share/whisper.cpp/models/ggml-tiny.en.bin',
      '/usr/local/share/whisper.cpp/models/ggml-tiny.en.bin',
    ];
    return candidates.find(p => fs.existsSync(p)) || null;
  }
}

module.exports = WakeWordListener;
