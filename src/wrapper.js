'use strict';

const pty = require('node-pty');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./config');
const VoiceRecorder = require('./voice');
const screenshot = require('./screenshot');
const MacroManager = require('./macros');
const CommandPalette = require('./palette');
const WakeWordListener = require('./wakeword');
const agentState = require('./agent-state');
const { execPowerShell } = require('./windows-shell');

// Shared file used to coordinate wake word activation across multiple copilot+ instances.
// Whichever instance the user most recently typed in is considered "active" and will
// exclusively handle wake word detection responses.
const ACTIVE_PID_FILE = path.join(os.homedir(), '.copilot', 'copilot-plus-active.pid');

const IS_WIN = os.platform() === 'win32';

const CTRL_R = '\x12';
const CTRL_P = '\x10';
const CTRL_C = '\x03';
const CTRL_K = '\x0b';

// Ctrl+Shift+1–5 in CSI u encoding (modifier 6 = Ctrl+Shift), sent by kitty/WezTerm
const MODEL_SLOT_CSI_U_RE = /^\x1b\[(\d+);6u$/;

// Option+Shift+1–5 on macOS Terminal.app / iTerm2 with "Use Option as Meta Key"
// Shift+1=!  Shift+2=@  Shift+3=#  Shift+4=$  Shift+5=%  → Meta prefix makes \x1b! etc.
const MODEL_SLOT_META_RE = /^\x1b([!@#$%])$/;
const META_SHIFTED_MAP = { '!': 1, '@': 2, '#': 3, '$': 4, '%': 5 };

// Token/model patterns to scan from stripped PTY output (best-effort)
const TOKEN_PATTERNS = [
  // Arrow-style:  ↑ 1,234  ↓ 567
  { in: /↑\s*([\d,]+)/, out: /↓\s*([\d,]+)/ },
  // "input: N / output: N" or "in: N out: N"
  { in: /\bin(?:put)?[:\s]+([\d,]+)/i, out: /\bout(?:put)?[:\s]+([\d,]+)/i },
  // "tokens: N" (total — split 60/40 as rough estimate if no separate in/out)
  { total: /tokens?[:\s]+([\d,]+)/i },
];
const MODEL_PATTERNS = [
  /(?:model|using)[:\s]+([a-z][a-z0-9._-]{3,40})/i,
  /switched.*?([a-z][a-z0-9._-]{3,40})/i,
];

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '').replace(/\x1b[()][AB012]/g, '');
}

function parseNum(s) {
  if (!s) return 0;
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

const AUTO_FAST_KEYWORDS = [
  'explain', 'what is', "what's", 'define', 'summarize', 'list', 'show me',
  'describe', 'how does', 'what does', 'tell me', 'what are', 'why does',
  'who is', 'where is', 'when did', 'how many', 'how much', 'is it', 'can you',
];
const AUTO_POWERFUL_KEYWORDS = [
  'implement', 'build', 'create', 'refactor', 'rewrite', 'fix', 'debug',
  'architect', 'design', 'migrate', 'optimize', 'write', 'generate', 'add',
  'update', 'change', 'modify', 'test', 'review', 'analyse', 'analyze',
  'convert', 'integrate', 'deploy', 'configure', 'set up', 'setup',
];

/** Pick a model based on prompt complexity. Returns empty string if tiers are unconfigured. */
function selectAutoModel(prompt, cfg) {
  const text = prompt.toLowerCase().trim();
  const len = text.length;
  const am = cfg.autoModels || {};
  const wm = cfg.workhorseModels || {};
  const fast    = am.fast    || wm[1] || '';
  const medium  = am.medium  || wm[1] || '';
  const powerful = am.powerful || wm[2] || '';

  const hasFast     = AUTO_FAST_KEYWORDS.some(k => text.includes(k));
  const hasPowerful = AUTO_POWERFUL_KEYWORDS.some(k => text.includes(k));

  if (len > 200 || hasPowerful) return powerful;
  if (len < 80 && hasFast && !hasPowerful) return fast;
  return medium;
}

/** Return 'fast' | 'medium' | 'powerful' classification label for a prompt. */
function classifyPrompt(prompt) {
  const text = prompt.toLowerCase().trim();
  const len = text.length;
  if (len > 200 || AUTO_POWERFUL_KEYWORDS.some(k => text.includes(k))) return 'powerful';
  if (len < 80 && AUTO_FAST_KEYWORDS.some(k => text.includes(k))) return 'fast';
  return 'medium';
}

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
    this.wakeWord = new WakeWordListener(cfg);
    this._busy = false;
    this._pid = process.pid;
    this._tokensIn = 0;
    this._tokensOut = 0;
    this._exchanges = 0;
    this._outputBuf = ''; // rolling plain-text buffer for token/model parsing
    this._autoMode = false;
    this._autoInputBuf = ''; // shadow buffer tracking typed input when auto mode is on
    this._autoCursor = 0;
    this._autoInputDirty = false;
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

    // Write initial state for the monitor
    agentState.writeState(this._pid, {
      cwd: process.cwd(),
      startedAt: new Date().toISOString(),
      status: 'idle',
      model: this._resolveCurrentModel(),
      tokensIn: 0,
      tokensOut: 0,
      exchanges: 0,
    });

    shell.onData(data => {
      if (!this.palette.isOpen) process.stdout.write(data);
      this._handlePtyOutput(data);
    });
    shell.onExit(({ exitCode }) => {
      agentState.clearState(this._pid);
      process.exit(exitCode);
    });

    process.stdout.on('resize', () => {
      try { shell.resize(process.stdout.columns, process.stdout.rows); } catch {}
    });

    // Disable Win32 Input Mode if active — Windows Terminal may send all key
    // events as CSI sequences which breaks raw control-code comparisons.
    if (IS_WIN) process.stdout.write('\x1b[?9001l');

    process.stdin.resume();
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
      process.on('exit', () => {
        try { process.stdin.setRawMode(false); } catch {}
      });
      process.stdin.on('data', data => {
        this._markActive();
        this._handleInput(data);
      });
    } else {
      process.stdin.on('data', data => {
        shell.write(data.toString());
      });
    }

    // Voice activation: wake phrase -> record until pause -> inject -> resume listening
    if (this.cfg.wakeWord && this.cfg.wakeWord.enabled) {
      // Mark this instance active on startup so the first-opened tab wins by default.
      this._markActive();

      this.wakeWord.on('detected', () => {
        if (this._busy || this.voice.isRecording) return;
        // Only the instance the user most recently typed in should respond.
        if (!this._isActiveInstance()) return;
        this._startVoiceAutoStop();
      });
      this.wakeWord.on('heard', text => {
        // Briefly flash what whisper heard in the terminal title so you can see
        // if the wake phrase is being picked up (disappears after 1.5s).
        const preview = text.length > 40 ? text.slice(0, 37) + '…' : text;
        this._setTitle(`👂 ${preview}`);
        setTimeout(() => this._setTitle('copilot'), 1500);
      });
      this.wakeWord.on('error', err => {
        this._notify('⚠️ Voice activation error', err.message.slice(0, 60));
      });
      this.wakeWord.start().catch(err => {
        this._notify('⚠️ Voice activation unavailable', err.message.slice(0, 60));
      });
    }

    process.on('exit', () => {
      if (this.voice.isRecording) this.voice.cancel();
      if (this.wakeWord.isListening) this.wakeWord.stop();
      agentState.clearState(this._pid);
    });
    process.on('SIGTERM', () => process.exit(0));
  }

  /** Returns the best-known current model name (from config or runtime tracking). */
  _resolveCurrentModel() {
    const model = this._currentModel || (this.cfg.workhorseModels || {})[1] || '';
    return this._autoMode ? `⚡auto(${model || '?'})` : model;
  }

  /** Called on every PTY data chunk — parses for tokens and model name. */
  _handlePtyOutput(data) {
    const plain = stripAnsi(typeof data === 'string' ? data : data.toString());

    // Rolling buffer — keep last 2 KB of plain text
    this._outputBuf = (this._outputBuf + plain).slice(-2048);

    let didFindTokens = false;

    for (const pat of TOKEN_PATTERNS) {
      if (pat.in && pat.out) {
        const mIn  = pat.in.exec(this._outputBuf);
        const mOut = pat.out.exec(this._outputBuf);
        if (mIn && mOut) {
          const newIn  = parseNum(mIn[1]);
          const newOut = parseNum(mOut[1]);
          if (newIn > this._tokensIn || newOut > this._tokensOut) {
            this._tokensIn  = Math.max(this._tokensIn,  newIn);
            this._tokensOut = Math.max(this._tokensOut, newOut);
            didFindTokens = true;
          }
          break;
        }
      } else if (pat.total) {
        const m = pat.total.exec(this._outputBuf);
        if (m) {
          const total = parseNum(m[1]);
          if (total > this._tokensIn + this._tokensOut) {
            // rough split
            this._tokensIn  = Math.round(total * 0.65);
            this._tokensOut = total - this._tokensIn;
            didFindTokens = true;
          }
          break;
        }
      }
    }

    // Try to detect current model name from output
    for (const re of MODEL_PATTERNS) {
      const m = re.exec(this._outputBuf);
      if (m && m[1] && m[1].length > 3) {
        this._currentModel = m[1];
        break;
      }
    }

    agentState.writeState(this._pid, {
      status: this._deriveStatus(),
      model: this._resolveCurrentModel(),
      tokensIn: this._tokensIn,
      tokensOut: this._tokensOut,
      exchanges: this._exchanges,
      lastOutputAt: new Date().toISOString(),
    });
  }

  /** Derive the current status string from live state (not attention — monitor computes that). */
  _deriveStatus() {
    if (this.voice.isRecording) return 'recording';
    if (this._busy) return 'transcribing';
    return 'idle';
  }

  _handleInput(data) {
    const key = data.toString();

    if (this.palette.isOpen) {
      this.palette.handleInput(data);
      return;
    }

    // Ctrl+Shift+1–5 (CSI u modifier 6): switch workhorse model slots / auto
    const modelCsi = MODEL_SLOT_CSI_U_RE.exec(key);
    if (modelCsi) {
      const code = parseInt(modelCsi[1], 10);
      if (code >= 49 && code <= 53) {
        this._switchModel(code - 48);
        return;
      }
    }

    // Option+Shift+1–5 (macOS Terminal.app / iTerm2 with "Use Option as Meta Key")
    const modelMeta = MODEL_SLOT_META_RE.exec(key);
    if (modelMeta) {
      const slot = META_SHIFTED_MAP[modelMeta[1]];
      if (slot) {
        this._switchModel(slot);
        return;
      }
    }

    const macroSlot = this.macros.parseSlot(key);
    if (macroSlot !== null) {
      const prompt = this.macros.get(macroSlot);
      if (prompt) {
        if (this.cfg.autoSubmit) this._resetAutoInputTracking();
        else this._markAutoInputDirty();
        this._shell.write(prompt + (this.cfg.autoSubmit ? '\r' : ''));
        this._notify(`⌨️ Macro ${macroSlot}`, prompt.length > 50 ? prompt.slice(0, 47) + '…' : prompt);
      } else {
        this._notify(`⌨️ Macro ${macroSlot}`, '(empty — set it via Ctrl+K command palette)');
      }
      return;
    }

    if (key === CTRL_K) {
      this._openPalette();
      return;
    }

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

    if (key === CTRL_C && this.voice.isRecording) {
      this.voice.cancel();
      this._setTitle('copilot');
      this._notify('🚫 Recording cancelled', '');
      return;
    }

    // Track shadow buffer for auto mode (best-effort; handles common editing keys)
    if (this._autoMode) {
      this._trackAutoInput(key);
    }

    // Track when user submits a prompt (Enter key) for the monitor's attention heuristic
    if (key === '\r' || key === '\n') {
      // In auto mode, intercept Enter to inject an automatic model switch before submitting
      if (this._autoMode && !this._autoInputDirty && this._autoInputBuf.trim()) {
        const prompt = this._autoInputBuf.trim();
        this._resetAutoInputTracking();
        this._injectAutoModel(prompt);
        return; // _injectAutoModel handles sending Enter (and the prompt) to the shell
      }
      this._resetAutoInputTracking();
      this._exchanges++;
      agentState.writeState(this._pid, {
        lastInputAt: new Date().toISOString(),
        exchanges: this._exchanges,
        status: 'idle',
      });
    }

    this._shell.write(key);
  }

  _openPalette() {
    if (this._busy) return;

    const phrase = (this.cfg.wakeWord && this.cfg.wakeWord.phrase) || 'hey copilot';
    const vaLabel = (this.cfg.wakeWord && this.cfg.wakeWord.enabled)
      ? `🗣️   Voice Activation: ON  (say "${phrase}")`
      : '🗣️   Voice Activation: off';

    const actions = [
      { id: 'voice', label: '🎙  Voice Recording', hint: 'Ctrl+R' },
      { id: 'screenshot', label: '📸  Screenshot', hint: 'Ctrl+P' },
      { id: 'voice-activation-toggle', label: vaLabel, hint: 'toggle' },
    ];

    const autoModeLabel = this._autoMode
      ? '⚡  Auto Mode: ON  (per-prompt model routing)'
      : '⚡  Auto Mode: off';
    actions.push({ id: 'auto-mode-toggle', label: autoModeLabel, hint: 'Opt+⇧5 / Ctrl+Shift+5' });

    const autoModels = this.cfg.autoModels || {};
    const AUTO_TIERS = [
      { key: 'fast',     hint: 'short Q&A' },
      { key: 'medium',   hint: 'general'   },
      { key: 'powerful', hint: 'complex tasks' },
    ];
    for (const { key, hint } of AUTO_TIERS) {
      const model = autoModels[key] || '';
      const preview = model || '(not set — falls back to workhorse slot)';
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      actions.push({
        id: `auto-model-${key}`,
        label: `⚡  Auto ${label}: ${preview}`,
        hint,
        editable: true,
        editTitle: `Auto ${label} Model`,
        value: model,
      });
    }

    const workhorseModels = this.cfg.workhorseModels || {};
    for (let i = 1; i <= 4; i++) {
      const model = workhorseModels[i] || '';
      const preview = model || '(not set — press Enter to configure)';
      actions.push({
        id: `model-${i}`,
        label: `🤖  Workhorse ${i}: ${preview}`,
        hint: `Opt+⇧${i} / Ctrl+Shift+${i}`,
        editable: true,
        editTitle: `Workhorse Model ${i}`,
        value: model,
      });
    }

    for (let i = 1; i <= 9; i++) {
      const prompt = this.macros.get(i);
      const preview = prompt
        ? (prompt.length > 25 ? prompt.slice(0, 22) + '…' : prompt)
        : '(empty — press Enter to set)';
      actions.push({
        id: `macro-${i}`,
        label: `⌨️   Macro ${i}: ${preview}`,
        hint: `Opt+${i}`,
        editable: true,
        value: prompt || '',
      });
    }

    actions.push({ id: 'preferences', label: '⚙️   Open Preferences', hint: '--preferences' });

    this.palette.open(actions).then(result => {
      this._nudgeResize();
      if (!result) return;

      if (typeof result === 'object') {
        if (result.id.startsWith('auto-model-')) {
          const tier = result.id.replace('auto-model-', '');
          this.cfg.autoModels = Object.assign({}, this.cfg.autoModels, { [tier]: result.value });
          config.patch({ autoModels: { [tier]: result.value } });
          this._notify(`⚡ Auto ${tier} saved`, result.value || '(cleared — will use workhorse fallback)');
          return;
        }

        if (result.id.startsWith('model-')) {
          const slot = parseInt(result.id.split('-')[1], 10);
          this.cfg.workhorseModels = Object.assign({}, this.cfg.workhorseModels, { [slot]: result.value });
          config.patch({ workhorseModels: { [slot]: result.value } });
          this._notify(
            `🤖 Workhorse ${slot} saved`,
            result.value || '(cleared)'
          );
          if (result.run && result.value) {
            this._switchModel(slot);
          }
          return;
        }

        const slot = parseInt(result.id.split('-')[1], 10);
        this.macros.set(slot, result.value);
        this.cfg.macros = Object.assign({}, this.cfg.macros, { [slot]: result.value });
        config.patch({ macros: { [slot]: result.value } });
        this._notify(
          `⌨️ Macro ${slot} saved`,
          result.value.length > 50 ? result.value.slice(0, 47) + '…' : result.value || '(cleared)'
        );
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
      case 'auto-mode-toggle':
        this._switchModel(5);
        break;
      case 'voice':
        if (this.voice.isRecording) this._stopVoice();
        else this._startVoice();
        break;
      case 'screenshot':
        this._doScreenshot();
        break;
      case 'voice-activation-toggle':
        if (this.wakeWord.isListening) {
          this.wakeWord.stop();
          this.cfg.wakeWord.enabled = false;
          config.patch({ wakeWord: { enabled: false } });
          this._notify('🗣️ Voice Activation off', 'Run copilot+ --preferences to re-enable');
        } else {
          this.cfg.wakeWord.enabled = true;
          config.patch({ wakeWord: { enabled: true } });
          this.wakeWord.start()
            .then(() => {
              const phrase = (this.cfg.wakeWord && this.cfg.wakeWord.phrase) || 'hey copilot';
              this._notify('🗣️ Voice Activation on', `Say "${phrase}" to start recording`);
            })
            .catch(err => {
              this._notify('⚠️ Voice activation unavailable', err.message.slice(0, 60));
            });
        }
        break;
      case 'preferences':
        this._notify('⚙️ Preferences', 'Exit and run: copilot+ --preferences');
        break;
      default:
        if (actionId.startsWith('auto-model-')) {
          // handled via object result (editable) — no-op here
        } else if (actionId.startsWith('model-')) {
          const slot = parseInt(actionId.split('-')[1], 10);
          this._switchModel(slot);
        } else if (actionId.startsWith('macro-')) {
          const slot = parseInt(actionId.split('-')[1], 10);
          const prompt = this.macros.get(slot);
          if (prompt) {
            if (this.cfg.autoSubmit) this._resetAutoInputTracking();
            else this._markAutoInputDirty();
            this._shell.write(prompt + (this.cfg.autoSubmit ? '\r' : ''));
          }
        }
        break;
    }
  }

  _switchModel(slot) {
    // Slot 5 is the special "auto" mode toggle
    if (slot === 5) {
      this._autoMode = !this._autoMode;
      this._resetAutoInputTracking();
      if (this._autoMode) {
        this._setTitle('copilot [⚡ auto]');
        this._notify('⚡ Auto Mode ON', 'Model selected per prompt complexity (fast / medium / powerful)');
      } else {
        this._setTitle('copilot');
        this._notify('⚡ Auto Mode OFF', 'Manual model selection restored');
      }
      agentState.writeState(this._pid, { model: this._resolveCurrentModel() });
      return;
    }

    const model = this.cfg.workhorseModels && this.cfg.workhorseModels[slot];
    if (!model) {
      this._notify(`🤖 Workhorse ${slot} not set`, 'Press Ctrl+K to configure model slots');
      return;
    }
    this._autoMode = false; // switching to an explicit slot turns auto mode off
    this._resetAutoInputTracking();
    this._currentModel = model;
    agentState.writeState(this._pid, { model });
    // Ctrl+U clears the current input line before injecting the /model command
    this._shell.write(`\x15/model ${model}\r`);
    this._notify(`🤖 Switched to Workhorse ${slot}`, model);
  }

  /** Analyse prompt complexity, optionally switch model, then submit the prompt. */
  _injectAutoModel(prompt) {
    const target = selectAutoModel(prompt, this.cfg);
    const tier   = classifyPrompt(prompt);
    this._exchanges++;
    agentState.writeState(this._pid, {
      lastInputAt: new Date().toISOString(),
      exchanges: this._exchanges,
      status: 'idle',
    });

    if (target && target !== this._currentModel) {
      this._currentModel = target;
      agentState.writeState(this._pid, { model: this._resolveCurrentModel() });
      // Clear current line, switch model, re-submit the buffered prompt in one sequence.
      // Copilot's readline processes these line-by-line from the PTY buffer.
      this._shell.write(`\x15/model ${target}\r${prompt}\r`);
      this._notify(`⚡ Auto → ${target}`, `${tier} prompt`);
    } else {
      // Model is already correct — just submit normally
      this._shell.write('\r');
    }
  }

  _resetAutoInputTracking() {
    this._autoInputBuf = '';
    this._autoCursor = 0;
    this._autoInputDirty = false;
  }

  _markAutoInputDirty() {
    this._autoInputBuf = '';
    this._autoCursor = 0;
    this._autoInputDirty = true;
  }

  _trackAutoInput(key) {
    if (key === '\r' || key === '\n') return;

    if (key === '\x7f' || key === '\x08') {
      if (this._autoCursor === 0) return;
      this._autoInputBuf =
        this._autoInputBuf.slice(0, this._autoCursor - 1) +
        this._autoInputBuf.slice(this._autoCursor);
      this._autoCursor -= 1;
      return;
    }

    if (key === '\x15') {
      this._resetAutoInputTracking();
      return;
    }

    if (key === '\x17') {
      const before = this._autoInputBuf.slice(0, this._autoCursor);
      const after = this._autoInputBuf.slice(this._autoCursor);
      const nextBefore = before.replace(/\S+\s*$/, '');
      this._autoInputBuf = nextBefore + after;
      this._autoCursor = nextBefore.length;
      return;
    }

    if (key === '\x01' || key === '\x1b[H' || key === '\x1b[1~' || key === '\x1bOH') {
      this._autoCursor = 0;
      return;
    }

    if (key === '\x05' || key === '\x1b[F' || key === '\x1b[4~' || key === '\x1bOF') {
      this._autoCursor = this._autoInputBuf.length;
      return;
    }

    if (key === '\x1b[D') {
      this._autoCursor = Math.max(0, this._autoCursor - 1);
      return;
    }

    if (key === '\x1b[C') {
      this._autoCursor = Math.min(this._autoInputBuf.length, this._autoCursor + 1);
      return;
    }

    if (key === '\x1b[3~') {
      this._autoInputBuf =
        this._autoInputBuf.slice(0, this._autoCursor) +
        this._autoInputBuf.slice(this._autoCursor + 1);
      return;
    }

    if (/^[^\x00-\x1F\x7F]+$/u.test(key)) {
      this._autoInputBuf =
        this._autoInputBuf.slice(0, this._autoCursor) +
        key +
        this._autoInputBuf.slice(this._autoCursor);
      this._autoCursor += key.length;
      return;
    }

    this._markAutoInputDirty();
  }

  _startVoice() {
    if (this._busy) return;
    if (this.wakeWord.isListening) this.wakeWord.stop();
    try {
      this.voice.start();
      agentState.writeState(this._pid, { status: 'recording' });
      this._setTitle('🎙 Recording… (Ctrl+R to stop, Ctrl+C to cancel)');
      this._notify('🎙 Recording started', 'Press Ctrl+R to stop');
    } catch (err) {
      this._notify('❌ Could not start recording', err.message);
      if (this.cfg.wakeWord && this.cfg.wakeWord.enabled) {
        this.wakeWord.start().catch(() => {});
      }
    }
  }

  _startVoiceAutoStop() {
    if (this._busy) return;
    this._busy = true;
    if (this.wakeWord.isListening) this.wakeWord.stop();

    this._setTitle('🎙 Listening… (speak now)');
    this._notify('🗣️ Listening', 'Speak your prompt — auto-stops on silence');

    this.voice.startAutoStop()
      .then(text => {
        this._setTitle('copilot');
        if (text) {
          if (this.cfg.autoSubmit) this._resetAutoInputTracking();
          else this._markAutoInputDirty();
          const phrase = ((this.cfg.wakeWord && this.cfg.wakeWord.phrase) || '').toLowerCase().trim();
          let cleaned = text;
          if (phrase && cleaned.toLowerCase().startsWith(phrase)) {
            cleaned = cleaned.slice(phrase.length).replace(/^[\s,.:]+/, '');
          }
          if (cleaned) {
            this._shell.write(cleaned + (this.cfg.autoSubmit ? '\r' : ''));
            this._notify('✅ Done', cleaned.length > 80 ? cleaned.slice(0, 77) + '…' : cleaned);
          } else {
            this._notify('⚠️ Nothing heard after wake phrase', 'Speak right after the phrase');
          }
        } else {
          this._notify('⚠️ Nothing heard', 'Speak right after the wake phrase');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        this._notify('❌ Transcription failed', err.message.slice(0, 80));
      })
      .finally(() => {
        this._busy = false;
        if (this.cfg.wakeWord && this.cfg.wakeWord.enabled && !this.wakeWord.isListening) {
          this.wakeWord.start().catch(() => {});
        }
      });
  }

  _stopVoice() {
    if (this._busy) return;
    this._busy = true;
    agentState.writeState(this._pid, { status: 'transcribing' });
    this._setTitle('⏳ Transcribing…');
    this._notify('⏳ Transcribing…', 'Please wait');

    this.voice.stopAndTranscribe()
      .then(text => {
        this._setTitle('copilot');
        agentState.writeState(this._pid, { status: 'idle' });
        if (text) {
          if (this.cfg.autoSubmit) this._resetAutoInputTracking();
          else this._markAutoInputDirty();
          this._shell.write(text + (this.cfg.autoSubmit ? '\r' : ''));
          this._notify('✅ Done', text.length > 80 ? text.slice(0, 77) + '…' : text);
        } else {
          this._notify('⚠️ Nothing heard', 'Try speaking more clearly');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        agentState.writeState(this._pid, { status: 'idle' });
        this._notify('❌ Transcription failed', err.message.slice(0, 80));
      })
      .finally(() => {
        this._busy = false;
        if (this.cfg.wakeWord && this.cfg.wakeWord.enabled && !this.wakeWord.isListening) {
          this.wakeWord.start().catch(() => {});
        }
      });
  }

  _doScreenshot() {
    if (this._busy) return;
    this._busy = true;
    this._setTitle('📸 Select area…');
    this._notify('📸 Screenshot', 'Draw to select · Esc to cancel');

    screenshot.capture()
      .then(filePath => {
        this._setTitle('copilot');
        if (filePath) {
          this._markAutoInputDirty();
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

  _nudgeResize() {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    try {
      this._shell.resize(cols, rows + 1);
      setTimeout(() => { try { this._shell.resize(cols, rows); } catch {} }, 60);
    } catch {}
  }

  /** Write this process's PID to the shared active-instance file. */
  _markActive() {
    try {
      fs.mkdirSync(path.dirname(ACTIVE_PID_FILE), { recursive: true });
      fs.writeFileSync(ACTIVE_PID_FILE, String(process.pid));
    } catch {}
  }

  /**
   * Returns true if this process is the "last focused" copilot+ instance.
   * Used to ensure only one tab handles wake word activation at a time.
   */
  _isActiveInstance() {
    try {
      const pid = parseInt(fs.readFileSync(ACTIVE_PID_FILE, 'utf8').trim(), 10);
      return pid === process.pid;
    } catch {
      return true; // If the file doesn't exist, assume we're the only instance.
    }
  }

  _setTitle(title) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }

  _notify(title, subtitle) {
    if (IS_WIN) {
      const ps = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $title = $env:COPILOT_PLUS_NOTIFY_TITLE
        $subtitle = $env:COPILOT_PLUS_NOTIFY_SUBTITLE
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, $title, $subtitle, [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Sleep -Milliseconds 3500
        $n.Dispose()
      `;
      execPowerShell(ps, ['-STA', '-WindowStyle', 'Hidden'], {
        env: Object.assign({}, process.env, {
          COPILOT_PLUS_NOTIFY_TITLE: title,
          COPILOT_PLUS_NOTIFY_SUBTITLE: subtitle,
        }),
        windowsHide: true,
      }).on('error', () => {}).unref();
    } else {
      execFile('osascript', [
        '-e',
        `display notification ${JSON.stringify(subtitle)} with title ${JSON.stringify(title)}`,
      ]).on('error', () => {}).unref();
    }
  }
}

module.exports = CopilotWrapper;
