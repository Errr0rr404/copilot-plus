'use strict';

const EventEmitter = require('events');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';

/**
 * DictationMode — continuous record → transcribe → emit loop.
 *
 * Records audio in fixed-length chunks, transcribes each with whisper-cli,
 * and emits 'text' events with the result. Repeats until stopped.
 *
 * Events:
 *   'text'    (string)  — transcribed chunk
 *   'started' ()        — loop began
 *   'stopped' ()        — loop ended
 *   'error'   (Error)   — non-fatal transcription error (loop continues)
 */
class DictationMode extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this._active = false;
    this._proc = null;
    this._stopping = false;
  }

  get isActive() { return this._active; }

  start() {
    if (this._active) return;
    this._active = true;
    this._stopping = false;
    this.emit('started');
    this._loop();
  }

  stop() {
    if (!this._active) return;
    this._stopping = true;
    this._active = false;
    if (this._proc) {
      if (IS_WIN) {
        spawn('taskkill', ['/pid', String(this._proc.pid), '/f', '/t']);
      } else {
        this._proc.kill('SIGTERM');
      }
      this._proc = null;
    }
    this.emit('stopped');
  }

  async _loop() {
    while (this._active && !this._stopping) {
      try {
        const text = await this._recordAndTranscribe();
        if (text && this._active) this.emit('text', text);
      } catch (err) {
        if (this._active) this.emit('error', err);
      }
    }
  }

  /** Record one chunk and transcribe it. */
  _recordAndTranscribe() {
    return new Promise((resolve, reject) => {
      const chunkSeconds = (this.config.dictation && this.config.dictation.chunkSeconds) || 4;
      const audioFile = path.join(os.tmpdir(), `copilot-dictation-${Date.now()}.wav`);

      const ffmpegArgs = IS_WIN
        ? ['-f', 'dshow', '-i', `audio=${this.config.audioDevice}`,
           '-ar', '16000', '-ac', '1', '-t', String(chunkSeconds), '-y', audioFile]
        : ['-f', 'avfoundation', '-i', this.config.audioDevice,
           '-ar', '16000', '-ac', '1', '-t', String(chunkSeconds), '-y', audioFile];

      const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'ignore', 'ignore'] });
      this._proc = proc;

      proc.on('error', err => {
        this._proc = null;
        fs.unlink(audioFile, () => {});
        reject(err);
      });

      proc.on('exit', () => {
        this._proc = null;
        if (this._stopping) {
          fs.unlink(audioFile, () => {});
          resolve('');
          return;
        }

        if (!fs.existsSync(audioFile)) {
          reject(new Error('Dictation: audio file was not created'));
          return;
        }

        this._transcribe(audioFile)
          .then(text => { fs.unlink(audioFile, () => {}); resolve(text); })
          .catch(err => { fs.unlink(audioFile, () => {}); reject(err); });
      });
    });
  }

  /** @returns {Promise<string>} */
  _transcribe(audioFile) {
    const { modelPath } = this.config;
    if (!modelPath) return Promise.reject(new Error('No whisper model found'));

    return new Promise((resolve, reject) => {
      execFile('whisper-cli', ['-m', modelPath, '-f', audioFile, '-np', '-nt'], (err, stdout) => {
        if (err) return reject(err);
        const text = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .filter(l => !l.startsWith('[') || !l.endsWith(']'))
          .join(' ');
        resolve(text);
      });
    });
  }
}

module.exports = DictationMode;
