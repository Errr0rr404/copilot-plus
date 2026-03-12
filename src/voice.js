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

    if (!this.config.audioDevice) {
      throw new Error('No audio device configured. Run: copilot+ --setup');
    }

    this._audioFile = path.join(os.tmpdir(), `copilot-voice-${Date.now()}.wav`);

    const ffmpegArgs = IS_WIN
      ? ['-f', 'dshow', '-i', `audio=${this.config.audioDevice}`, '-ar', '16000', '-ac', '1', '-y', this._audioFile]
      : ['-f', 'avfoundation', '-i', this.config.audioDevice, '-ar', '16000', '-ac', '1', '-y', this._audioFile];

    this._proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    this._proc.on('error', () => {
      this._cleanup();
    });
  }

  /**
   * Start recording and automatically stop after `silenceDuration` seconds of silence.
   * Returns a Promise that resolves with the transcribed text when silence is detected.
   * Maximum recording time is capped at `maxSeconds` to avoid runaway recordings.
   *
   * @param {object} opts
   * @param {number} [opts.silenceDuration=1.5]  seconds of silence before auto-stop
   * @param {number} [opts.silenceThreshold=-35]  dB threshold for silence detection
   * @param {number} [opts.maxSeconds=30]          hard cap on recording length
   * @returns {Promise<string>}
   */
  startAutoStop({ silenceDuration = 1.5, silenceThreshold = -35, maxSeconds = 30 } = {}) {
    if (this._proc) return Promise.reject(new Error('Already recording'));
    if (!this.config.audioDevice) {
      return Promise.reject(new Error('No audio device configured. Run: copilot+ --setup'));
    }

    this._audioFile = path.join(os.tmpdir(), `copilot-voice-${Date.now()}.wav`);
    const audioFile = this._audioFile;

    // ffmpeg silencedetect filter — stops recording when silence is detected
    const silenceFilter = `silencedetect=noise=${silenceThreshold}dB:duration=${silenceDuration}`;

    const ffmpegArgs = IS_WIN
      ? ['-f', 'dshow', '-i', `audio=${this.config.audioDevice}`,
         '-af', silenceFilter, '-t', String(maxSeconds),
         '-ar', '16000', '-ac', '1', '-y', audioFile]
      : ['-f', 'avfoundation', '-i', this.config.audioDevice,
         '-af', silenceFilter, '-t', String(maxSeconds),
         '-ar', '16000', '-ac', '1', '-y', audioFile];

    return new Promise((resolve, reject) => {
      let stderrBuf = '';
      const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
      this._proc = proc;

      let _qSent = false;
      proc.stderr.on('data', chunk => {
        stderrBuf += chunk.toString();
        if (_qSent) return;
        // Parse silence_start timestamp — only stop if silence began after 0.5s
        // (to skip the brief ambient-noise silence at the very start of recording)
        const hasSilenceStart = stderrBuf.split('\n').some(l => {
          const m = l.match(/silence_start:\s*([\d.]+)/);
          return m && parseFloat(m[1]) > 0.5;
        });
        if (hasSilenceStart) {
          _qSent = true;
          proc.stdin.write('q');
          proc.stdin.end();
        }
      });

      proc.on('exit', () => {
        this._proc = null;
        this._audioFile = null;
        if (!fs.existsSync(audioFile)) {
          return reject(new Error('Audio file was not created — is the microphone accessible?'));
        }
        this._transcribe(audioFile)
          .then(resolve)
          .catch(reject)
          .finally(() => fs.unlink(audioFile, () => {}));
      });

      proc.on('error', err => {
        this._proc = null;
        this._audioFile = null;
        reject(err);
      });
    });
  }


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
