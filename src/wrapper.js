'use strict';

const pty = require('node-pty');
const { execFile, execFileSync } = require('child_process');
const os = require('os');

const config = require('./config');
const VoiceRecorder = require('./voice');
const screenshot = require('./screenshot');
const MacroManager = require('./macros');
const CommandPalette = require('./palette');
const DictationMode = require('./dictation');
const WakeWordListener = require('./wakeword');

const IS_WIN = os.platform() === 'win32';

// Byte sequences we intercept before forwarding to copilot
const CTRL_R = '\x12';  // voice toggle
const CTRL_P = '\x10';  // screenshot
const CTRL_C = '\x03';
const CTRL_K = '\x0b'; // command palette

/** Resolve the absolute path to a binary so node-pty's posix_spawnp can find it. */
function resolveBin(name) {
  try {
    const cmd = IS_WIN ? 'where' : 'which';
    return execFileSync(cmd, [name], { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    return name;
  }
}

class CopilotWrapper {
  constructor(args, cfg) {
    this.args = args;
    this.cfg = cfg;
    this.voice = new VoiceRecorder(cfg);
    this.macros = new MacroManager(cfg);
    this.palette = new CommandPalette();
    this.dictation = new DictationMode(cfg);
    this.wakeWord = new WakeWordListener(cfg);
    this._busy = false;
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

    shell.onData(data => {
      // Suppress copilot output while the palette is open to avoid overwriting the overlay
      if (!this.palette.isOpen) process.stdout.write(data);
    });
    shell.onExit(({ exitCode }) => process.exit(exitCode));

    process.stdout.on('resize', () => {
      try { shell.resize(process.stdout.columns, process.stdout.rows); } catch {}
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', data => this._handleInput(data));

    // Dictation: inject transcribed chunks into copilot
    this.dictation.on('text', text => {
      if (text) this._shell.write(text + ' ');
    });
    this.dictation.on('error', err => {
      this._notify('⚠️ Dictation error', err.message.slice(0, 60));
    });

    // Wake word: auto-record until silence, then transcribe and inject
    if (this.cfg.wakeWord.enabled) {
      this.wakeWord.on('detected', () => {
        if (this._busy || this.voice.isRecording) return; // already recording
        this._startVoiceAutoStop();
      });
      this.wakeWord.on('error', err => {
        this._notify('⚠️ Wake word error', err.message.slice(0, 60));
      });
      this.wakeWord.start().catch(err => {
        this._notify('⚠️ Wake word unavailable', err.message.slice(0, 60));
      });
    }

    // Dictation: auto-start if enabled in preferences
    if (this.cfg.dictation && this.cfg.dictation.enabled) {
      this.dictation.start();
      this._setTitle('📝 Dictating…');
    }

    // Graceful shutdown
    process.on('exit', () => {
      if (this.voice.isRecording) this.voice.cancel();
      if (this.dictation.isActive) this.dictation.stop();
      if (this.wakeWord.isListening) this.wakeWord.stop();
    });
    process.on('SIGTERM', () => process.exit(0));
  }

  _handleInput(data) {
    const key = data.toString();

    // When command palette is open, route all input there
    if (this.palette.isOpen) {
      this.palette.handleInput(data);
      return;
    }

    // Check for macro keypresses (CSI u: Ctrl+1–9)
    const macroSlot = this.macros.parseSlot(key);
    if (macroSlot !== null) {
      const prompt = this.macros.get(macroSlot);
      if (prompt) {
        this._shell.write(prompt + (this.cfg.autoSubmit ? '\r' : ''));
        this._notify(`⌨️ Macro ${macroSlot}`, prompt.length > 50 ? prompt.slice(0, 47) + '…' : prompt);
      } else {
        this._notify(`⌨️ Macro ${macroSlot}`, '(empty — set it via command palette or --preferences)');
      }
      return;
    }

    // Ctrl+K → command palette
    if (key === CTRL_K) {
      this._openPalette();
      return;
    }

    if (key === CTRL_R) {
      if (this.dictation.isActive) {
        this.dictation.stop();
        this._setTitle('copilot');
        this._notify('📝 Dictation stopped', '');
      } else if (this.voice.isRecording) {
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

    // Ctrl+C while dictating stops dictation; still forward to copilot
    if (key === CTRL_C && this.dictation.isActive) {
      this.dictation.stop();
      this._setTitle('copilot');
      this._notify('📝 Dictation cancelled', '');
    }

    this._shell.write(key);
  }

  // --- Command Palette ---

  _openPalette() {
    if (this._busy) return;

    const actions = [
      { id: 'voice', label: '🎙  Voice Recording', hint: 'Ctrl+R' },
      { id: 'screenshot', label: '📸  Screenshot', hint: 'Ctrl+P' },
      { id: 'dictation-toggle', label: `📝  Dictation Mode ${this.dictation.isActive ? '(ON)' : '(off)'}`, hint: 'toggle' },
      { id: 'wakeword-toggle', label: `🗣️   Wake Word ${this.wakeWord.isListening ? '(ON)' : '(off)'}`, hint: 'toggle' },
    ];

    // Add macro entries
    for (let i = 1; i <= 9; i++) {
      const prompt = this.macros.get(i);
      const preview = prompt ? (prompt.length > 25 ? prompt.slice(0, 22) + '…' : prompt) : '(empty — press Enter to set)';
      actions.push({
        id: `macro-${i}`,
        label: `⌨️   Macro ${i}: ${preview}`,
        hint: `Ctrl+${i}`,
        editable: true,
        value: prompt || '',
      });
    }

    actions.push({ id: 'preferences', label: '⚙️   Open Preferences', hint: '--preferences' });

    this.palette.open(actions).then(result => {
      this._nudgeResize(); // repaint copilot TUI after palette closes
      if (!result) return;

      // Editable item (macro) resolved with {id, value, run}
      if (typeof result === 'object') {
        const slot = parseInt(result.id.split('-')[1], 10);
        this.macros.set(slot, result.value);
        // Persist to config file
        this.cfg.macros = Object.assign({}, this.cfg.macros, { [slot]: result.value });
        config.save(this.cfg);
        this._notify(`⌨️ Macro ${slot} saved`, result.value.length > 50 ? result.value.slice(0, 47) + '…' : result.value || '(cleared)');
        if (result.run && result.value) {
          this._shell.write(result.value + (this.cfg.autoSubmit ? '\r' : ''));
        }
        return;
      }

      this._executePaletteAction(result);
    });
  }

  _executePaletteAction(actionId) {
    switch (actionId) {
      case 'voice':
        if (this.voice.isRecording) this._stopVoice();
        else this._startVoice();
        break;
      case 'screenshot':
        this._doScreenshot();
        break;
      case 'dictation-toggle':
        if (this.dictation.isActive) {
          this.dictation.stop();
          this._setTitle('copilot');
          this._notify('📝 Dictation stopped', '');
        } else {
          this.dictation.start();
          this._setTitle('📝 Dictating…');
          this._notify('📝 Dictation started', 'Speak naturally. Ctrl+R to stop.');
        }
        break;
      case 'wakeword-toggle':
        if (this.wakeWord.isListening) {
          this.wakeWord.stop();
          this._notify('🗣️ Wake word stopped', '');
        } else {
          this.wakeWord.start().then(() => {
            this._notify('🗣️ Wake word listening', 'Say the keyword to start recording');
          }).catch(err => {
            this._notify('⚠️ Wake word unavailable', err.message.slice(0, 60));
          });
        }
        break;
      case 'preferences':
        this._notify('⚙️ Preferences', 'Exit and run: copilot+ --preferences');
        break;
      default:
        // macro-N
        if (actionId.startsWith('macro-')) {
          const slot = parseInt(actionId.split('-')[1], 10);
          const prompt = this.macros.get(slot);
          if (prompt) {
            this._shell.write(prompt + (this.cfg.autoSubmit ? '\r' : ''));
          }
        }
        break;
    }
  }

  // --- Voice ---

  _startVoice() {
    if (this._busy) return;
    // Pause wake word while recording to avoid microphone conflict
    if (this.wakeWord.isListening) this.wakeWord.stop();
    try {
      this.voice.start();
      this._setTitle('🎙 Recording… (Ctrl+R to stop, Ctrl+C to cancel)');
      this._notify('🎙 Recording started', 'Press Ctrl+R to stop');
    } catch (err) {
      this._notify('❌ Could not start recording', err.message);
      // Resume wake word if it was active
      if (this.cfg.wakeWord.enabled) {
        this.wakeWord.start().catch(() => {});
      }
    }
  }

  /** Called by wake word — records until silence, then auto-transcribes. */
  _startVoiceAutoStop() {
    if (this._busy) return;
    this._busy = true;
    if (this.wakeWord.isListening) this.wakeWord.stop();

    this._setTitle('🎙 Listening… (speak now)');
    this._notify('🗣️ Wake word detected', 'Speak your prompt — auto-stops on silence');

    this.voice.startAutoStop()
      .then(text => {
        this._setTitle('copilot');
        if (text) {
          // Strip the wake phrase from the beginning if whisper captured it
          const phrase = (this.cfg.wakeWord.phrase || '').toLowerCase().trim();
          let cleaned = text;
          if (phrase && cleaned.toLowerCase().startsWith(phrase)) {
            cleaned = cleaned.slice(phrase.length).replace(/^[\s,.:]+/, '');
          }
          if (cleaned) {
            this._shell.write(cleaned + (this.cfg.autoSubmit ? '\r' : ''));
            this._notify('✅ Done', cleaned.length > 80 ? cleaned.slice(0, 77) + '…' : cleaned);
          } else {
            this._notify('⚠️ Nothing heard', 'Try speaking after the wake phrase');
          }
        } else {
          this._notify('⚠️ Nothing heard', 'Try speaking after the wake phrase');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        this._notify('❌ Transcription failed', err.message.slice(0, 80));
      })
      .finally(() => {
        this._busy = false;
        if (this.cfg.wakeWord.enabled && !this.wakeWord.isListening) {
          this.wakeWord.start().catch(() => {});
        }
      });
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
      .finally(() => {
        this._busy = false;
        // Resume wake word if it was enabled
        if (this.cfg.wakeWord.enabled && !this.wakeWord.isListening) {
          this.wakeWord.start().catch(() => {});
        }
      });
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
          this._shell.write(`@${filePath} `);
          this._notify('✅ Screenshot attached', filePath);
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
    if (IS_WIN) {
      const ps = `
        Add-Type -AssemblyName System.Windows.Forms
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, ${JSON.stringify(title)}, ${JSON.stringify(subtitle)}, [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Sleep -Milliseconds 3500
        $n.Dispose()
      `;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps]).unref();
    } else {
      execFile('osascript', [
        '-e',
        `display notification ${JSON.stringify(subtitle)} with title ${JSON.stringify(title)}`,
      ]).unref();
    }
  }
}

module.exports = CopilotWrapper;
