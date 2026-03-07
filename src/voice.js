'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';

class VoiceRecorder {
  constructor(config) {
    this.config = config;
    this._proc = null;
    this._audioFile = null;
  }

  get isRecording() {
    return this._proc !== null;
  }

  /** Start recording from the microphone. Returns immediately. */
  start() {
    if (this._proc) return;

    this._audioFile = path.join(os.tmpdir(), `copilot-voice-${Date.now()}.wav`);

    const ffmpegArgs = IS_WIN
      ? ['-f', 'dshow', '-i', `audio=${this.config.audioDevice}`, '-ar', '16000', '-ac', '1', '-y', this._audioFile]
      : ['-f', 'avfoundation', '-i', this.config.audioDevice, '-ar', '16000', '-ac', '1', '-y', this._audioFile];

    this._proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    this._proc.on('error', err => {
      this._cleanup();
      throw err;
    });
  }

  /**
   * Stop recording and transcribe. Returns the transcribed text, or '' if nothing was heard.
   * @returns {Promise<string>}
   */
  async stopAndTranscribe() {
    if (!this._proc) return '';

    const audioFile = this._audioFile;
    const proc = this._proc;
    this._proc = null;
    this._audioFile = null;

    // Ask ffmpeg to stop gracefully — it finalises the WAV header before exit
    await new Promise((resolve, reject) => {
      proc.stdin.write('q');
      proc.stdin.end();
      const timer = setTimeout(() => {
        if (IS_WIN) {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']);
        } else {
          proc.kill('SIGTERM');
        }
      }, 3000);
      proc.on('exit', () => { clearTimeout(timer); resolve(); });
      proc.on('error', reject);
    });

    if (!fs.existsSync(audioFile)) {
      throw new Error('Audio file was not created — is the microphone accessible?');
    }

    try {
      return await this._transcribe(audioFile);
    } finally {
      fs.unlink(audioFile, () => {});
    }
  }

  /** Cancel in-progress recording without transcribing. */
  cancel() {
    if (!this._proc) return;
    if (IS_WIN) {
      spawn('taskkill', ['/pid', String(this._proc.pid), '/f', '/t']);
    } else {
      this._proc.kill('SIGTERM');
    }
    this._cleanup();
  }

  _cleanup() {
    this._proc = null;
    if (this._audioFile) {
      fs.unlink(this._audioFile, () => {});
      this._audioFile = null;
    }
  }

  /** @returns {Promise<string>} */
  _transcribe(audioFile) {
    const { modelPath } = this.config;

    if (!modelPath) {
      return Promise.reject(new Error(
        'No whisper model found. Run: copilot+ --setup'
      ));
    }

    return new Promise((resolve, reject) => {
      execFile('whisper-cli', [
        '-m', modelPath,
        '-f', audioFile,
        '-np',   // no extra prints
        '-nt',   // no timestamps
      ], (err, stdout) => {
        if (err) return reject(err);

        const text = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          // whisper sometimes emits noise-only lines like "[BLANK_AUDIO]"
          .filter(l => !l.startsWith('[') || !l.endsWith(']'))
          .join(' ');

        resolve(text);
      });
    });
  }
}

module.exports = VoiceRecorder;
