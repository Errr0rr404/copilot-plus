'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';
const IS_MAC   = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

/**
 * Pick the ffmpeg input args for the current platform's recording back-end.
 * macOS → avfoundation, Windows → dshow, Linux → pulse (preferred) or alsa.
 */
function _inputArgs(device) {
  if (IS_WIN)   return ['-f', 'dshow', '-i', `audio=${device}`];
  if (IS_MAC)   return ['-f', 'avfoundation', '-i', device];
  // Linux: device is either "pulse:<src>" or "alsa:<hw>". Default to pulse default sink.
  if (typeof device === 'string' && device.startsWith('alsa:')) {
    return ['-f', 'alsa', '-i', device.slice('alsa:'.length)];
  }
  const src = (typeof device === 'string' && device.startsWith('pulse:'))
    ? device.slice('pulse:'.length)
    : (device || 'default');
  return ['-f', 'pulse', '-i', src];
}

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

    const ffmpegArgs = [
      ..._inputArgs(this.config.audioDevice),
      '-ar', '16000', '-ac', '1', '-y', this._audioFile,
    ];

    this._proc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'ignore', 'ignore'],
    });

    this._proc.on('error', () => {
      this._cleanup();
    });
    // Without this, a premature ffmpeg exit (mic unplugged, OS denied access,
    // etc.) leaves _proc dangling and the next stopAndTranscribe() awaits an
    // 'exit' event that has already fired — hanging the wrapper.
    this._proc.on('exit', () => {
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

    const ffmpegArgs = [
      ..._inputArgs(this.config.audioDevice),
      '-af', silenceFilter, '-t', String(maxSeconds),
      '-ar', '16000', '-ac', '1', '-y', audioFile,
    ];

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

    // Skip the graceful-stop dance if ffmpeg has already exited — attaching
    // an 'exit' listener after the event has fired would hang forever.
    if (proc.exitCode === null && proc.signalCode === null) {
      // Ask ffmpeg to stop gracefully — it finalises the WAV header before exit
      await new Promise((resolve) => {
        try { proc.stdin.write('q'); proc.stdin.end(); } catch {}
        const finish = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          if (IS_WIN) {
            spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t']);
          } else {
            try { proc.kill('SIGTERM'); } catch {}
          }
          // Resolve regardless so we never hang on a stuck process.
          setTimeout(resolve, 200);
        }, 3000);
        proc.once('exit', finish);
        proc.once('close', finish);
        proc.once('error', finish);
      });
    }

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

    // Language override: 'auto' or ISO 639-1 (e.g. 'es', 'ja'). Defaults to 'en'
    // since the bundled models are *.en (English-only). Non-English speakers
    // should drop a non-.en model (e.g. ggml-base.bin) at the same path.
    const lang = (this.config.voiceLanguage || 'en').trim();
    const args = ['-m', modelPath, '-f', audioFile, '-np', '-nt'];
    if (lang && lang !== 'en') args.push('-l', lang === 'auto' ? 'auto' : lang);

    return new Promise((resolve, reject) => {
      execFile('whisper-cli', args, (err, stdout) => {
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
