'use strict';

const pty = require('node-pty');
const { execFile, execFileSync } = require('child_process');

const config = require('./config');
const VoiceRecorder = require('./voice');
const screenshot = require('./screenshot');

// Byte sequences we intercept before forwarding to copilot
const CTRL_R = '\x12';  // voice toggle
const CTRL_P = '\x10';  // screenshot
const CTRL_C = '\x03';

/** Resolve the absolute path to a binary so node-pty's posix_spawnp can find it. */
function resolveBin(name) {
  try {
    return execFileSync('which', [name], { encoding: 'utf8' }).trim();
  } catch {
    return name; // fall back to letting PATH sort it out
  }
}

class CopilotWrapper {
  constructor(args, cfg) {
    this.args = args;
    this.cfg = cfg;
    this.voice = new VoiceRecorder(cfg);
    this._busy = false; // prevent overlapping async operations
  }

  start() {
    const shell = pty.spawn(resolveBin('copilot'), this.args, {
      name: process.env.TERM || 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      cwd: process.cwd(),
      env: process.env,
    });

    this._shell = shell;

    // PTY → real terminal
    shell.onData(data => process.stdout.write(data));

    shell.onExit(({ exitCode }) => process.exit(exitCode));

    // Resize relay
    process.stdout.on('resize', () => {
      try { shell.resize(process.stdout.columns, process.stdout.rows); } catch {}
    });

    // Real terminal → PTY (with hotkey interception)
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', data => this._handleInput(data));

    // Graceful shutdown: stop any in-progress recording
    process.on('exit', () => { if (this.voice.isRecording) this.voice.cancel(); });
    process.on('SIGTERM', () => process.exit(0));
  }

  _handleInput(data) {
    const key = data.toString();

    if (key === CTRL_R) {
      if (this.voice.isRecording) {
        this._stopVoice();
      } else {
        this._startVoice();
      }
      return;
    }

    if (key === CTRL_P) {
      this._doScreenshot();
      return;
    }

    // Ctrl+C while recording cancels the recording; still forward to copilot
    if (key === CTRL_C && this.voice.isRecording) {
      this.voice.cancel();
      this._setTitle('copilot');
      this._notify('🚫 Recording cancelled', '');
    }

    this._shell.write(key);
  }

  // --- Voice ---

  _startVoice() {
    if (this._busy) return;
    try {
      this.voice.start();
      this._setTitle('🎙 Recording… (Ctrl+R to stop, Ctrl+C to cancel)');
      this._notify('🎙 Recording started', 'Press Ctrl+R to stop');
    } catch (err) {
      this._notify('❌ Could not start recording', err.message);
    }
  }

  _stopVoice() {
    if (this._busy) return;
    this._busy = true;
    this._setTitle('⏳ Transcribing…');
    this._notify('⏳ Transcribing…', 'Please wait');

    this.voice.stopAndTranscribe()
      .then(text => {
        this._setTitle('copilot');
        if (text) {
          this._shell.write(text + (this.cfg.autoSubmit ? '\r' : ''));
          this._notify('✅ Done', text.length > 80 ? text.slice(0, 77) + '…' : text);
        } else {
          this._notify('⚠️ Nothing heard', 'Try speaking more clearly');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        this._notify('❌ Transcription failed', err.message.slice(0, 80));
      })
      .finally(() => { this._busy = false; });
  }

  // --- Screenshot ---

  _doScreenshot() {
    if (this._busy) return;
    this._busy = true;
    this._setTitle('📸 Select area…');
    this._notify('📸 Screenshot', 'Draw to select · Esc to cancel');

    screenshot.capture()
      .then(filePath => {
        this._setTitle('copilot');
        if (filePath) {
          // Inject @path so the user can see it and optionally add a prompt before sending
          this._shell.write(`@${filePath} `);
          this._notify('✅ Screenshot attached', filePath);
          // Force copilot TUI to repaint after screencapture overlay closes
          this._nudgeResize();
        } else {
          this._notify('📸 Cancelled', '');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        this._notify('❌ Screenshot failed', err.message.slice(0, 80));
      })
      .finally(() => { this._busy = false; });
  }

  // --- Helpers ---

  /** Flicker the PTY size by ±1 to trigger a TUI repaint. */
  _nudgeResize() {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    try {
      this._shell.resize(cols, rows + 1);
      setTimeout(() => { try { this._shell.resize(cols, rows); } catch {} }, 60);
    } catch {}
  }

  _setTitle(title) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }

  _notify(title, subtitle) {
    execFile('osascript', [
      '-e',
      `display notification ${JSON.stringify(subtitle)} with title ${JSON.stringify(title)}`,
    ]).unref();
  }
}

module.exports = CopilotWrapper;
