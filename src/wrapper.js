'use strict';

const pty = require('node-pty');
const { execFile, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config       = require('./config');
const VoiceRecorder = require('./voice');
const screenshot   = require('./screenshot');
const MacroManager = require('./macros');
const CommandPalette = require('./palette');
const WakeWordListener = require('./wakeword');
const CheatSheet   = require('./cheatsheet');
const clipboard    = require('./clipboard');
const shellExec    = require('./shell-exec');
const safety       = require('./safety');
const ctxBuilder   = require('./context');
const TTS          = require('./tts');
const history      = require('./history');
const bookmarks    = require('./bookmarks');
const theme        = require('./theme');
const logger       = require('./logger');
const { PluginManager } = require('./plugin');
const agentState   = require('./agent-state');
const { execPowerShell } = require('./windows-shell');
const promptStash  = require('./prompt-stash');
const { PromptQueue } = require('./prompt-queue');
const workflows    = require('./workflows');
const notifyRules  = require('./notify-rules');
const filePicker   = require('./file-picker');
const handoff      = require('./handoff');
const usageMeter   = require('./usage-meter');
const worktree     = require('./worktree');
const { fetchQuota } = require('./copilot-api');

// Shared file used to coordinate wake word activation across multiple copilot+ instances.
const ACTIVE_PID_FILE = path.join(os.homedir(), '.copilot', 'copilot-plus-active.pid');

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';

// Hotkey codes
const CTRL_B = '\x02';
const CTRL_E = '\x05';
const CTRL_G = '\x07';
const CTRL_K = '\x0b';
const CTRL_O = '\x0f';
const CTRL_P = '\x10';
const CTRL_R = '\x12';
const CTRL_S = '\x13';
const CTRL_T = '\x14';
const CTRL_Y = '\x19';
const CTRL_C = '\x03';
const CTRL_SLASH = '\x1f';            // some terminals send \x1f for Ctrl+/
const QUESTION = '?';

// Ctrl+Shift+1–5 in CSI u encoding (modifier 6)
const MODEL_SLOT_CSI_U_RE = /^\x1b\[(\d+);6u$/;

// Option+Shift+1–5 on macOS Terminal.app / iTerm2 with "Use Option as Meta Key"
const MODEL_SLOT_META_RE = /^\x1b([!@#$%])$/;
const META_SHIFTED_MAP = { '!': 1, '@': 2, '#': 3, '$': 4, '%': 5 };

// Token/model patterns scanned from stripped PTY output (best-effort)
const TOKEN_PATTERNS = [
  { in: /↑\s*([\d,]+)/, out: /↓\s*([\d,]+)/ },
  { in: /\bin(?:put)?[:\s]+([\d,]+)/i, out: /\bout(?:put)?[:\s]+([\d,]+)/i },
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
    return execFileSync(cmd, [name], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  } catch {
    return name;
  }
}

class CopilotWrapper {
  constructor(args, cfg) {
    this.args = args;
    this.cfg = cfg;
    theme.set(cfg.theme || 'dark');

    this.voice = new VoiceRecorder(cfg);
    this.macros = new MacroManager(cfg);
    this.palette = new CommandPalette({ cfg });
    this.cheatsheet = new CheatSheet();
    this.wakeWord = new WakeWordListener(cfg);
    this.tts = new TTS(cfg);
    this.plugins = new PluginManager();
    this.plugins.load({ config: cfg, version: _version() });
    if (cfg.tts && cfg.tts.enabled) this._ttsOn = true;

    this._busy = false;
    this._pid = process.pid;
    this._tokensIn = 0;
    this._tokensOut = 0;
    this._exchanges = 0;
    this._outputBuf = '';
    this._responseBuf = '';      // rolling buffer of recent AI output (for bookmark/TTS)
    this._lastResponse = '';     // settled previous response
    this._responseSettleTimer = null;
    this._autoMode = false;
    this._autoInputBuf = '';
    this._autoCursor = 0;
    this._autoInputDirty = false;
    this._inputLineBuf = '';     // shadow buffer for `!shell` detection on Enter
    this._inputCursor  = 0;
    this._inputLineDirty = false;

    // v1.2 — queue, workflows, notifications, usage
    const qcfg = cfg.queue || {};
    this.promptQueue = new PromptQueue({ maxSize: qcfg.maxSize || 20 });
    this._awaitingResponse = false;
    this._awaitingSince = 0;
    this._lastOutputAt = 0;
    this._waitingNotified = false;
    this._recentPrompts = [];
    this._workflowRunning = false;
    this._workflowCancel = false;
    this._settleWaiters = [];
    this._notifyCooldown = notifyRules.createCooldown(90000);
    this._handoffFired = false;
    this._quotaTimer = null;
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
      const visible = !this.palette.isOpen && !this.cheatsheet.isOpen;
      if (visible) process.stdout.write(data);
      this._handlePtyOutput(data);
    });
    shell.onExit(({ exitCode }) => {
      agentState.clearState(this._pid);
      process.exit(exitCode);
    });

    process.stdout.on('resize', () => {
      try { shell.resize(process.stdout.columns, process.stdout.rows); } catch {}
    });

    if (IS_WIN) process.stdout.write('\x1b[?9001l');

    // Periodic: waiting_input rules + quota / handoff checks
    this._quotaTimer = setInterval(() => this._tickBackground(), 15000);
    if (this._quotaTimer.unref) this._quotaTimer.unref();

    process.stdin.resume();
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
      process.on('exit', () => {
        try { process.stdin.setRawMode(false); } catch {}
        if (this._quotaTimer) clearInterval(this._quotaTimer);
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

    if (this.cfg.wakeWord && this.cfg.wakeWord.enabled) {
      this._markActive();
      this.wakeWord.on('detected', () => {
        if (this._busy || this.voice.isRecording) return;
        if (!this._isActiveInstance()) return;
        this._startVoiceAutoStop();
      });
      this.wakeWord.on('heard', text => {
        const preview = text.length > 40 ? text.slice(0, 37) + '…' : text;
        this._setTitle(`👂 ${preview}`);
        setTimeout(() => this._setTitle('copilot'), 1500);
      });
      this.wakeWord.on('error', err => {
        this._notify('⚠️ Voice activation error', logger.forUser(err, 60));
      });
      this.wakeWord.start().catch(err => {
        this._notify('⚠️ Voice activation unavailable', logger.forUser(err, 60));
      });
    }

    process.on('exit', () => {
      if (this.voice.isRecording) this.voice.cancel();
      if (this.wakeWord.isListening) this.wakeWord.stop();
      if (this.tts) this.tts.stop();
      agentState.clearState(this._pid);
    });
    process.on('SIGTERM', () => process.exit(0));

    // Friendly first-screen hint nudging discoverability — appears once after launch.
    setTimeout(() => {
      if (!this._busy && !this.palette.isOpen && !this.cheatsheet.isOpen) {
        process.stderr.write(
          `\x1b[2m  copilot+ ready · press ${this.cfg.theme === 'light' ? '\x1b[7m ? \x1b[0m\x1b[2m' : '? '} for help, Ctrl+K for the palette\x1b[0m\n`
        );
      }
    }, 500);
  }

  _resolveCurrentModel() {
    const model = this._currentModel || (this.cfg.workhorseModels || {})[1] || '';
    return this._autoMode ? `⚡auto(${model || '?'})` : model;
  }

  _handlePtyOutput(data) {
    const plain = stripAnsi(typeof data === 'string' ? data : data.toString());

    this._outputBuf  = (this._outputBuf  + plain).slice(-2048);
    this._responseBuf = (this._responseBuf + plain).slice(-16384);

    this._lastOutputAt = Date.now();
    this._waitingNotified = false;

    // Once output goes quiet, treat the current response buffer as "settled"
    // so Ctrl+B (bookmark) and Ctrl+T (TTS) have something to grab.
    clearTimeout(this._responseSettleTimer);
    this._responseSettleTimer = setTimeout(() => {
      const settled = this._responseBuf.trim();
      if (settled && settled !== this._lastResponse) {
        this._lastResponse = settled;
        if (this._ttsOn) this.tts.speak(settled);
        this.plugins.emit('afterReceive', settled);
      }
      // Response settled → clear awaiting, notify, flush queue / workflow waiters
      if (this._awaitingResponse) {
        this._awaitingResponse = false;
        this._waitingNotified = false;
        this._fireNotifyEvent({
          type: 'session_idle',
          title: 'copilot+ idle',
          body: 'Response ready',
        });
        this._resolveSettleWaiters();
        this._flushQueueNext();
      }
    }, 800);

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
          }
          break;
        }
      } else if (pat.total) {
        const m = pat.total.exec(this._outputBuf);
        if (m) {
          const total = parseNum(m[1]);
          if (total > this._tokensIn + this._tokensOut) {
            this._tokensIn  = Math.round(total * 0.65);
            this._tokensOut = total - this._tokensIn;
          }
          break;
        }
      }
    }

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

  _deriveStatus() {
    if (this.voice.isRecording) return 'recording';
    if (this._busy) return 'transcribing';
    return 'idle';
  }

  _handleInput(data) {
    const key = data.toString();

    if (this.cheatsheet.isOpen) {
      this.cheatsheet.handleInput(data);
      return;
    }
    if (this.palette.isOpen) {
      this.palette.handleInput(data);
      return;
    }

    // ── Model slot hotkeys ────────────────────────────────────────────────
    const modelCsi = MODEL_SLOT_CSI_U_RE.exec(key);
    if (modelCsi) {
      const code = parseInt(modelCsi[1], 10);
      if (code >= 49 && code <= 53) { this._switchModel(code - 48); return; }
    }
    const modelMeta = MODEL_SLOT_META_RE.exec(key);
    if (modelMeta) {
      const slot = META_SHIFTED_MAP[modelMeta[1]];
      if (slot) { this._switchModel(slot); return; }
    }

    // ── Macro slots ───────────────────────────────────────────────────────
    const macroSlot = this.macros.parseSlot(key);
    if (macroSlot !== null) {
      const prompt = this.macros.get(macroSlot);
      if (prompt) {
        const payload = this.plugins.emit('beforeSend', { text: prompt, kind: 'macro', cancel: false });
        if (payload && !payload.cancel) {
          const send = payload.replaceWith || payload.text;
          this._sendUserText(send, { kind: 'macro' });
        }
        this._notify(`⌨️ Macro ${macroSlot}`, prompt.length > 50 ? prompt.slice(0, 47) + '…' : prompt);
      } else {
        this._notify(`⌨️ Macro ${macroSlot}`, '(empty — set it via Ctrl+K)');
      }
      return;
    }

    // ── Overlays ──────────────────────────────────────────────────────────
    if (key === CTRL_K) { this._openPalette(); return; }
    if (key === CTRL_SLASH || (key === QUESTION && this._inputLineBuf === '')) {
      this._openCheatSheet(); return;
    }

    // ── Voice / screenshot ────────────────────────────────────────────────
    if (key === CTRL_R) {
      if (this.voice.isRecording) this._stopVoice();
      else this._startVoice();
      return;
    }
    if (key === CTRL_P) { this._doScreenshot(); return; }
    if (key === CTRL_C && this.voice.isRecording) {
      this.voice.cancel();
      this._setTitle('copilot');
      this._notify('🚫 Recording cancelled', '');
      return;
    }

    // ── New hotkeys: clipboard / context / TTS / bookmark / v1.2 ──────────
    if (key === CTRL_Y) { this._pasteClipboard(); return; }
    if (key === CTRL_G) { this._injectContext(); return; }
    if (key === CTRL_T) { this._toggleTTS(); return; }
    if (key === CTRL_B) { this._bookmarkLast(); return; }
    if (key === CTRL_E) { this._openLastInEditor(); return; }
    if (key === CTRL_S) { this._stashPrompt(); return; }
    if (key === CTRL_O) { this._pickFile(); return; }

    // ── Auto-mode shadow buffer ───────────────────────────────────────────
    if (this._autoMode) this._trackAutoInput(key);

    // Track raw input line so we can recognise "!cmd<Enter>"
    this._trackInputLine(key);

    if (key === '\r' || key === '\n') {
      // Queue while agent is generating (optional)
      const qcfg = this.cfg.queue || {};
      if (qcfg.whenBusy !== false && this._awaitingResponse && !this._inputLineDirty) {
        const pending = this._inputLineBuf.trim();
        if (pending && !pending.startsWith(this.cfg.shellPrefix || '!')) {
          const res = this.promptQueue.enqueue(pending);
          this._shell.write('\x15');
          this._resetInputLine();
          this._resetAutoInputTracking();
          if (res.ok) {
            this._notify('📥 Queued', `#${res.size} — will send when idle`);
          } else {
            this._notify('📥 Queue full', res.reason || 'cannot enqueue');
          }
          return;
        }
      }

      // Shell-prefix detection
      const prefix = this.cfg.shellPrefix || '!';
      const line = this._inputLineBuf;
      if (!this._inputLineDirty && line.trimStart().startsWith(prefix)) {
        const cmd = line.trimStart().slice(prefix.length);
        this._resetInputLine();
        this._resetAutoInputTracking();
        // Clear the visible prompt — shell-exec writes its own block.
        this._shell.write('\x15');
        this._runShell(cmd);
        return;
      }

      // Auto-mode model injection
      if (this._autoMode && !this._autoInputDirty && this._autoInputBuf.trim()) {
        const prompt = this._autoInputBuf.trim();
        this._resetAutoInputTracking();
        this._resetInputLine();
        this._injectAutoModel(prompt);
        return;
      }

      // Normal submit path — run safety / plugins / history
      const sendText = this._inputLineBuf;
      if (!this._inputLineDirty && sendText.trim()) {
        const payload = this.plugins.emit('beforeSend', { text: sendText, kind: 'prompt', cancel: false });
        if (payload && payload.cancel) { this._resetInputLine(); return; }
        const finalText = (payload && payload.replaceWith) || payload.text || sendText;

        if (finalText !== sendText) {
          // Plugin rewrote the text — clear the visible line and inject the new text.
          this._shell.write('\x15' + finalText + '\r');
          this._afterSubmit(finalText);
          this._resetAutoInputTracking();
          this._resetInputLine();
          return;
        }

        // Safety scan
        const findings = this.cfg.safety && this.cfg.safety.enabled !== false
          ? safety.scan(finalText, { disabledKinds: (this.cfg.safety && this.cfg.safety.disabledKinds) || [] })
          : [];
        if (findings.length) {
          if (this.cfg.safety && this.cfg.safety.autoRedact) {
            const redacted = safety.redact(finalText, findings);
            this._shell.write('\x15' + redacted + '\r');
            this._afterSubmit(redacted);
            this._notify('🔒 Redacted secrets', findings.map(f => f.kind).join(', '));
            this._resetAutoInputTracking();
            this._resetInputLine();
            return;
          }
          // Interactive confirm — pauses the wrapper briefly
          this._confirmSafety(findings).then(action => {
            if (action === 'cancel') {
              this._shell.write('\x15');
              this._notify('🔒 Cancelled', 'prompt held back');
              this._resetAutoInputTracking();
              this._resetInputLine();
              return;
            }
            const out = action === 'redact' ? safety.redact(finalText, findings) : finalText;
            this._shell.write('\x15' + out + '\r');
            this._afterSubmit(out);
            this._resetAutoInputTracking();
            this._resetInputLine();
          });
          return;
        }
        this._afterSubmit(finalText);
        this._resetAutoInputTracking();
        this._resetInputLine();
      } else {
        // Empty Enter or dirty buffer — let it through unchanged
        this._resetAutoInputTracking();
        this._resetInputLine();
        this._exchanges++;
        agentState.writeState(this._pid, {
          lastInputAt: new Date().toISOString(),
          exchanges: this._exchanges,
          status: 'idle',
        });
      }
    }

    this._shell.write(key);
  }

  /** Called after we let the user's submission flow into the PTY. */
  _afterSubmit(text) {
    this._exchanges++;
    this._awaitingResponse = true;
    this._awaitingSince = Date.now();
    this._waitingNotified = false;
    this._responseBuf = '';
    const trimmed = text.trim();
    if (trimmed) {
      this._recentPrompts.push(trimmed);
      if (this._recentPrompts.length > 12) this._recentPrompts.shift();
    }
    agentState.writeState(this._pid, {
      lastInputAt: new Date().toISOString(),
      exchanges: this._exchanges,
      status: 'idle',
      queueSize: this.promptQueue.length,
    });
    const record = {
      pid:   this._pid,
      cwd:   process.cwd(),
      model: this._resolveCurrentModel(),
      prompt: trimmed,
    };
    if (this.cfg.historyEnabled !== false) history.append(record);
    this.plugins.emit('afterPrompt', record);
  }

  /** Send user-generated text to the shell, optionally auto-submitting. */
  _sendUserText(text, { kind = 'prompt' } = {}) {
    if (!text) return;
    if (this.cfg.autoSubmit) this._resetAutoInputTracking();
    else this._markAutoInputDirty();
    this._shell.write(text + (this.cfg.autoSubmit ? '\r' : ''));
    if (this.cfg.autoSubmit) {
      this._afterSubmit(text);
      this._resetInputLine();
    } else {
      this._inputLineBuf  = text;
      this._inputCursor   = text.length;
      this._inputLineDirty = false;
    }
  }

  _confirmSafety(findings) {
    // Pause raw mode while readline takes over
    try { process.stdin.setRawMode(false); } catch {}
    return safety.confirm(findings).then(action => {
      try { process.stdin.setRawMode(true); } catch {}
      return action;
    });
  }

  _openCheatSheet() {
    if (this._busy) return;
    this.cheatsheet.open(this.cfg).then(() => this._nudgeResize());
  }

  _openPalette() {
    if (this._busy) return;
    this.palette.setConfig(this.cfg);

    const phrase = (this.cfg.wakeWord && this.cfg.wakeWord.phrase) || 'hey copilot';
    const vaLabel = (this.cfg.wakeWord && this.cfg.wakeWord.enabled)
      ? `🗣️   Voice Activation: ON  (say "${phrase}")`
      : '🗣️   Voice Activation: off';

    const stashN = promptStash.size();
    const queueN = this.promptQueue.length;
    const actions = [
      { id: 'voice',                     label: '🎙  Voice Recording',          hint: 'Ctrl+R' },
      { id: 'screenshot',                label: '📸  Screenshot',                hint: 'Ctrl+P' },
      { id: 'clipboard',                 label: '📋  Paste Clipboard',            hint: 'Ctrl+Y' },
      { id: 'context',                   label: '🧠  Inject Smart Context',       hint: 'Ctrl+G' },
      { id: 'file-picker',               label: '📎  Attach File (@path)',        hint: 'Ctrl+O' },
      { id: 'stash-prompt',              label: '💾  Stash Current Prompt',       hint: 'Ctrl+S' },
      { id: 'restore-stash',             label: `💾  Restore Stash${stashN ? ` (${stashN})` : ''}`, hint: 'pop' },
      { id: 'open-editor',               label: '📝  Open Last Response in Editor', hint: 'Ctrl+E' },
      { id: 'bookmark',                  label: '🔖  Bookmark Last Response',     hint: 'Ctrl+B' },
      { id: 'tts-toggle',                label: this._ttsOn ? '🔊  TTS: ON' : '🔊  TTS: off', hint: 'Ctrl+T' },
      { id: 'queue-flush',               label: `📥  Flush Prompt Queue${queueN ? ` (${queueN})` : ''}`, hint: 'send next' },
      { id: 'queue-clear',               label: '📥  Clear Prompt Queue',          hint: queueN ? `${queueN} items` : 'empty' },
      { id: 'run-workflow',              label: '⛓   Run Workflow…',               hint: 'chains' },
      { id: 'worktree',                  label: '🌳  Create Worktree Session',     hint: 'git' },
      { id: 'handoff-now',               label: '📦  Write Handoff Snapshot',      hint: 'quota' },
      { id: 'open-handoff',              label: '📦  Open Last Handoff',           hint: 'editor' },
      { id: 'cheatsheet',                label: '❓  Cheatsheet',                  hint: '?' },
      { id: 'voice-activation-toggle',   label: vaLabel,                          hint: 'toggle' },
    ];

    // Workflow entries (up to 12)
    try {
      const wfs = workflows.list(this.cfg).filter(w => !w.invalid).slice(0, 12);
      for (const w of wfs) {
        actions.push({
          id: `workflow:${w.name}`,
          label: `⛓   Workflow: ${w.name} (${w.steps} steps)`,
          hint: w.description || path.basename(w.file),
        });
      }
    } catch {}

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
        hint, editable: true,
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

    // Theme picker entries
    for (const name of theme.names()) {
      actions.push({
        id: `theme-${name}`,
        label: `🎨  Theme: ${name}${theme.get(this.cfg).name === name ? ' ✓' : ''}`,
        hint: 'switch',
      });
    }

    actions.push({ id: 'reload-plugins', label: '🧩  Reload plugins', hint: this.plugins.list().length + ' loaded' });
    actions.push({ id: 'preferences',    label: '⚙️   Open Preferences', hint: '--preferences' });

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
          this._notify(`🤖 Workhorse ${slot} saved`, result.value || '(cleared)');
          if (result.run && result.value) this._switchModel(slot);
          return;
        }
        if (result.id.startsWith('macro-')) {
          const slot = parseInt(result.id.split('-')[1], 10);
          this.macros.set(slot, result.value);
          this.cfg.macros = Object.assign({}, this.cfg.macros, { [slot]: result.value });
          config.patch({ macros: { [slot]: result.value } });
          this._notify(`⌨️ Macro ${slot} saved`,
            result.value.length > 50 ? result.value.slice(0, 47) + '…' : result.value || '(cleared)');
          if (result.run && result.value) this._shell.write(result.value + (this.cfg.autoSubmit ? '\r' : ''));
          return;
        }
        return;
      }

      this._executePaletteAction(result);
    });
  }

  _executePaletteAction(actionId) {
    switch (actionId) {
      case 'auto-mode-toggle':       this._switchModel(5); break;
      case 'voice':                  if (this.voice.isRecording) this._stopVoice(); else this._startVoice(); break;
      case 'screenshot':             this._doScreenshot(); break;
      case 'clipboard':              this._pasteClipboard(); break;
      case 'context':                this._injectContext(); break;
      case 'file-picker':            this._pickFile(); break;
      case 'stash-prompt':           this._stashPrompt(); break;
      case 'restore-stash':          this._restoreStash(); break;
      case 'open-editor':            this._openLastInEditor(); break;
      case 'bookmark':               this._bookmarkLast(); break;
      case 'tts-toggle':             this._toggleTTS(); break;
      case 'queue-flush':            this._flushQueueNext(true); break;
      case 'queue-clear':
        this.promptQueue.clear();
        this._notify('📥 Queue cleared', '');
        break;
      case 'run-workflow':
        this._notify('⛓ Workflows', 'Pick a named workflow from the palette list, or add ~/.copilot/workflows/*.yaml');
        break;
      case 'worktree':               this._createWorktree(); break;
      case 'handoff-now':            this._writeHandoff('manual'); break;
      case 'open-handoff':           this._openHandoff(); break;
      case 'cheatsheet':             this._openCheatSheet(); break;
      case 'reload-plugins':
        this.plugins.reload({ config: this.cfg, version: _version() });
        this._notify('🧩 Plugins reloaded', `${this.plugins.list().length} loaded`);
        break;
      case 'voice-activation-toggle':
        if (this.wakeWord.isListening) {
          this.wakeWord.stop();
          this.cfg.wakeWord.enabled = false;
          config.patch({ wakeWord: { enabled: false } });
          this._notify('🗣️ Voice Activation off', 'Re-enable via Ctrl+K');
        } else {
          this.cfg.wakeWord.enabled = true;
          config.patch({ wakeWord: { enabled: true } });
          this.wakeWord.start()
            .then(() => {
              const phrase = (this.cfg.wakeWord && this.cfg.wakeWord.phrase) || 'hey copilot';
              this._notify('🗣️ Voice Activation on', `Say "${phrase}" to start recording`);
            })
            .catch(err => this._notify('⚠️ Voice activation unavailable', logger.forUser(err, 60)));
        }
        break;
      case 'preferences':
        this._notify('⚙️ Preferences', 'Exit and run: copilot+ --preferences');
        break;
      default:
        if (actionId.startsWith('workflow:')) {
          const name = actionId.slice('workflow:'.length);
          this._runWorkflow(name);
        } else if (actionId.startsWith('theme-')) {
          const name = actionId.replace('theme-', '');
          theme.set(name);
          this.cfg.theme = name;
          config.patch({ theme: name });
          this._notify('🎨 Theme set', name);
        } else if (actionId.startsWith('model-')) {
          const slot = parseInt(actionId.split('-')[1], 10);
          this._switchModel(slot);
        } else if (actionId.startsWith('macro-')) {
          const slot = parseInt(actionId.split('-')[1], 10);
          const prompt = this.macros.get(slot);
          if (prompt) this._sendUserText(prompt, { kind: 'macro' });
        }
        break;
    }
  }

  _switchModel(slot) {
    if (slot === 5) {
      this._autoMode = !this._autoMode;
      this._resetAutoInputTracking();
      if (this._autoMode) {
        this._setTitle('copilot [⚡ auto]');
        this._notify('⚡ Auto Mode ON', 'Per-prompt model routing (fast / medium / powerful)');
      } else {
        this._setTitle('copilot');
        this._notify('⚡ Auto Mode OFF', 'Manual model selection restored');
      }
      agentState.writeState(this._pid, { model: this._resolveCurrentModel() });
      this.plugins.emit('onModelSwitch', { slot, model: this._resolveCurrentModel() });
      return;
    }
    const model = this.cfg.workhorseModels && this.cfg.workhorseModels[slot];
    if (!model) {
      this._notify(`🤖 Workhorse ${slot} not set`, 'Press Ctrl+K to configure model slots');
      return;
    }
    this._autoMode = false;
    this._resetAutoInputTracking();
    this._currentModel = model;
    agentState.writeState(this._pid, { model });
    this._shell.write(`\x15/model ${model}\r`);
    this._notify(`🤖 Switched to Workhorse ${slot}`, model);
    this.plugins.emit('onModelSwitch', { slot, model });
  }

  _injectAutoModel(prompt) {
    const target = selectAutoModel(prompt, this.cfg);
    const tier   = classifyPrompt(prompt);
    this._afterSubmit(prompt);

    if (target && target !== this._currentModel) {
      this._currentModel = target;
      agentState.writeState(this._pid, { model: this._resolveCurrentModel() });
      this._shell.write(`\x15/model ${target}\r${prompt}\r`);
      this._notify(`⚡ Auto → ${target}`, `${tier} prompt`);
    } else {
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
      this._autoInputBuf = this._autoInputBuf.slice(0, this._autoCursor - 1) + this._autoInputBuf.slice(this._autoCursor);
      this._autoCursor -= 1; return;
    }
    if (key === '\x15') { this._resetAutoInputTracking(); return; }
    if (key === '\x17') {
      const before = this._autoInputBuf.slice(0, this._autoCursor);
      const after = this._autoInputBuf.slice(this._autoCursor);
      const nextBefore = before.replace(/\S+\s*$/, '');
      this._autoInputBuf = nextBefore + after;
      this._autoCursor = nextBefore.length; return;
    }
    if (key === '\x01' || key === '\x1b[H' || key === '\x1b[1~' || key === '\x1bOH') { this._autoCursor = 0; return; }
    if (key === '\x05' || key === '\x1b[F' || key === '\x1b[4~' || key === '\x1bOF') { this._autoCursor = this._autoInputBuf.length; return; }
    if (key === '\x1b[D') { this._autoCursor = Math.max(0, this._autoCursor - 1); return; }
    if (key === '\x1b[C') { this._autoCursor = Math.min(this._autoInputBuf.length, this._autoCursor + 1); return; }
    if (key === '\x1b[3~') {
      this._autoInputBuf = this._autoInputBuf.slice(0, this._autoCursor) + this._autoInputBuf.slice(this._autoCursor + 1);
      return;
    }
    if (/^[^\x00-\x1F\x7F]+$/u.test(key)) {
      this._autoInputBuf = this._autoInputBuf.slice(0, this._autoCursor) + key + this._autoInputBuf.slice(this._autoCursor);
      this._autoCursor += key.length;
      return;
    }
    this._markAutoInputDirty();
  }

  /**
   * Mirror of _trackAutoInput but always active (not gated on auto mode).
   * Used to detect "!cmd"-prefix shell submission and to feed safety/history.
   */
  _trackInputLine(key) {
    if (key === '\r' || key === '\n') return;
    if (key === '\x7f' || key === '\x08') {
      if (this._inputCursor === 0) return;
      this._inputLineBuf = this._inputLineBuf.slice(0, this._inputCursor - 1) + this._inputLineBuf.slice(this._inputCursor);
      this._inputCursor -= 1; return;
    }
    if (key === '\x15') { this._resetInputLine(); return; }
    if (key === '\x17') {
      const before = this._inputLineBuf.slice(0, this._inputCursor);
      const after = this._inputLineBuf.slice(this._inputCursor);
      const nextBefore = before.replace(/\S+\s*$/, '');
      this._inputLineBuf = nextBefore + after;
      this._inputCursor = nextBefore.length; return;
    }
    if (key === '\x01' || key === '\x1b[H') { this._inputCursor = 0; return; }
    if (key === '\x05' || key === '\x1b[F') { this._inputCursor = this._inputLineBuf.length; return; }
    if (key === '\x1b[D') { this._inputCursor = Math.max(0, this._inputCursor - 1); return; }
    if (key === '\x1b[C') { this._inputCursor = Math.min(this._inputLineBuf.length, this._inputCursor + 1); return; }
    if (key === '\x1b[3~') {
      this._inputLineBuf = this._inputLineBuf.slice(0, this._inputCursor) + this._inputLineBuf.slice(this._inputCursor + 1);
      return;
    }
    if (/^[^\x00-\x1F\x7F]+$/u.test(key)) {
      this._inputLineBuf = this._inputLineBuf.slice(0, this._inputCursor) + key + this._inputLineBuf.slice(this._inputCursor);
      this._inputCursor += key.length;
      return;
    }
    this._inputLineDirty = true;
  }

  _resetInputLine() {
    this._inputLineBuf = '';
    this._inputCursor = 0;
    this._inputLineDirty = false;
  }

  // ── Feature handlers ─────────────────────────────────────────────────────

  _pasteClipboard() {
    if (this._busy) return;
    const text = clipboard.readText();
    if (text && text.trim()) {
      this._sendUserText(text);
      this._notify('📋 Clipboard', `${Math.min(text.length, 9999)} chars`);
      return;
    }
    const img = clipboard.readImage();
    if (img) {
      this._markAutoInputDirty();
      this._shell.write(`@${img} `);
      this._notify('📋 Clipboard image', img);
      this._nudgeResize();
      return;
    }
    this._notify('📋 Clipboard empty', 'Nothing to paste');
  }

  _injectContext() {
    if (this._busy) return;
    this._busy = true;
    const kinds = (this.cfg.contextHotkey && this.cfg.contextHotkey.kinds) || ['status', 'diff'];
    Promise.resolve().then(() => {
      try {
        const { text, summary } = ctxBuilder.build(kinds);
        if (!text) {
          this._notify('🧠 No context', summary || 'nothing to include');
          return;
        }
        this._markAutoInputDirty();
        this._shell.write(text);
        this._notify('🧠 Context attached', summary);
      } finally {
        this._busy = false;
      }
    });
  }

  _runShell(cmd) {
    if (!cmd.trim()) { this._notify('!shell', 'empty command'); return; }
    this._busy = true;
    this._setTitle(`⚙ ${cmd.slice(0, 30)}`);
    shellExec.exec(cmd).then(result => {
      const block = shellExec.format(cmd, result);
      this._markAutoInputDirty();
      this._shell.write(block);
      this._setTitle('copilot');
      this._notify(result.ok ? '⚙ shell ok' : `⚙ shell exit ${result.code}`, cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd);
    }).finally(() => { this._busy = false; });
  }

  _toggleTTS() {
    if (!this.tts.available()) {
      this._notify('🔊 TTS unavailable', PLATFORM === 'linux' ? 'Install spd-say or espeak-ng' : 'No system TTS found');
      return;
    }
    this._ttsOn = !this._ttsOn;
    if (!this._ttsOn) this.tts.stop();
    this._notify(this._ttsOn ? '🔊 TTS on' : '🔇 TTS off', this._ttsOn ? 'Responses will be read aloud' : '');
  }

  _bookmarkLast() {
    const body = this._lastResponse || this._responseBuf.trim();
    if (!body) { this._notify('🔖 Nothing to bookmark', 'Wait for a response first'); return; }
    const id = bookmarks.add({ body, cwd: process.cwd(), model: this._resolveCurrentModel() });
    if (id) {
      this._notify('🔖 Bookmarked', `Browse with: copilot+ --snippets`);
      this.plugins.emit('onBookmark', { id, body });
    }
  }

  // ── v1.2 features ────────────────────────────────────────────────────────

  _stashPrompt() {
    const text = this._inputLineBuf;
    if (!text.trim()) {
      this._notify('💾 Nothing to stash', 'Type a prompt first');
      return;
    }
    const n = promptStash.push(text, { cwd: process.cwd() });
    this._shell.write('\x15');
    this._resetInputLine();
    this._resetAutoInputTracking();
    this._notify('💾 Stashed', `${n} on stack — restore via Ctrl+K`);
  }

  _restoreStash() {
    const item = promptStash.pop();
    if (!item) { this._notify('💾 Stash empty', ''); return; }
    this._sendUserText(item.text);
    this._notify('💾 Restored', item.text.length > 60 ? item.text.slice(0, 57) + '…' : item.text);
  }

  _openLastInEditor() {
    const body = this._lastResponse || this._responseBuf.trim();
    if (!body) { this._notify('📝 Nothing to open', 'Wait for a response first'); return; }
    const tmp = path.join(os.tmpdir(), `copilot-plus-response-${Date.now()}.md`);
    try {
      fs.writeFileSync(tmp, body);
    } catch (err) {
      this._notify('📝 Write failed', logger.forUser(err, 60));
      return;
    }
    const editor = process.env.VISUAL || process.env.EDITOR || (IS_WIN ? 'notepad' : 'vi');
    const parts = editor.split(/\s+/);
    try {
      // Leave raw mode so the editor can take the TTY
      try { process.stdin.setRawMode(false); } catch {}
      const child = spawn(parts[0], [...parts.slice(1), tmp], {
        stdio: 'inherit',
        shell: IS_WIN,
      });
      child.on('exit', () => {
        try { process.stdin.setRawMode(true); } catch {}
        this._nudgeResize();
        this._notify('📝 Editor closed', path.basename(tmp));
      });
      child.on('error', err => {
        try { process.stdin.setRawMode(true); } catch {}
        this._notify('📝 Editor failed', logger.forUser(err, 60));
      });
    } catch (err) {
      try { process.stdin.setRawMode(true); } catch {}
      this._notify('📝 Editor failed', logger.forUser(err, 60));
    }
  }

  _pickFile() {
    if (this._busy) return;
    const files = filePicker.listFiles(process.cwd());
    if (!files.length) {
      this._notify('📎 No files found', 'Empty project?');
      return;
    }
    // Reuse palette as a file chooser
    const actions = files.slice(0, 200).map(rel => ({
      id: `file:${rel}`,
      label: `📎  ${rel}`,
      hint: '',
    }));
    this.palette.setConfig(this.cfg);
    this.palette.open(actions).then(result => {
      this._nudgeResize();
      if (!result || typeof result !== 'string' || !result.startsWith('file:')) return;
      const rel = result.slice('file:'.length);
      const abs = path.resolve(process.cwd(), rel);
      this._markAutoInputDirty();
      this._shell.write(`@${abs} `);
      this._notify('📎 Attached', rel);
    });
  }

  _flushQueueNext(force = false) {
    if (!force && this._awaitingResponse) return;
    const item = this.promptQueue.dequeue();
    if (!item) {
      if (force) this._notify('📥 Queue empty', '');
      return;
    }
    this._notify('📤 Dequeued', item.text.length > 50 ? item.text.slice(0, 47) + '…' : item.text);
    // Auto-submit queued prompts
    this._shell.write('\x15' + item.text + '\r');
    this._afterSubmit(item.text);
    this._resetInputLine();
  }

  _waitForSettle() {
    return new Promise(resolve => {
      // If already idle, resolve after a short quiet period
      if (!this._awaitingResponse) {
        const start = Date.now();
        const t = setInterval(() => {
          if (this._awaitingResponse || Date.now() - start > 1200) {
            clearInterval(t);
            if (!this._awaitingResponse) return resolve();
            this._settleWaiters.push(resolve);
          }
        }, 100);
        return;
      }
      this._settleWaiters.push(resolve);
    });
  }

  _resolveSettleWaiters() {
    const waiters = this._settleWaiters.splice(0);
    for (const w of waiters) {
      try { w(); } catch {}
    }
  }

  async _runWorkflow(name) {
    if (this._workflowRunning) {
      this._notify('⛓ Busy', 'A workflow is already running');
      return;
    }
    const wf = workflows.loadByName(name, this.cfg);
    if (!wf) {
      this._notify('⛓ Not found', name);
      return;
    }
    this._workflowRunning = true;
    this._workflowCancel = false;
    this._notify('⛓ Workflow', `${wf.name} — ${wf.steps.length} steps`);
    try {
      let clip = '';
      try { clip = clipboard.readText() || ''; } catch {}
      const result = await workflows.run(wf, {
        vars: { clipboard: clip },
        isCancelled: () => this._workflowCancel,
        onStep: (i, total) => {
          this._notify(`⛓ Step ${i + 1}/${total}`, wf.name);
        },
        send: async (prompt) => {
          this._shell.write('\x15' + prompt + '\r');
          this._afterSubmit(prompt);
          this._resetInputLine();
        },
        waitForSettle: () => this._waitForSettle(),
      });
      if (result.ok) this._notify('⛓ Done', wf.name);
      else this._notify('⛓ Stopped', result.reason || wf.name);
    } catch (err) {
      this._notify('⛓ Error', logger.forUser(err, 80));
    } finally {
      this._workflowRunning = false;
    }
  }

  _createWorktree() {
    if (!worktree.isGitRepo()) {
      this._notify('🌳 Not a git repo', '');
      return;
    }
    const name = `session-${Date.now().toString(36).slice(-6)}`;
    const res = worktree.create({ name });
    if (!res.ok) {
      this._notify('🌳 Worktree failed', res.error || '');
      return;
    }
    this._notify('🌳 Worktree ready', `${res.path} (${res.branch})`);
    // Print path to terminal for the user to open
    try {
      process.stdout.write(`\r\n[copilot+] worktree: cd ${res.path}\r\n`);
    } catch {}
  }

  _writeHandoff(reason = 'manual') {
    const file = handoff.write({
      cwd: process.cwd(),
      model: this._resolveCurrentModel(),
      prompts: this._recentPrompts.slice(),
      lastResponse: this._lastResponse,
      reason,
      quota: this._lastQuota || null,
    });
    if (file) this._notify('📦 Handoff saved', file);
    else this._notify('📦 Handoff failed', '');
    return file;
  }

  _openHandoff() {
    const p = handoff.latestPath();
    if (!p) { this._notify('📦 No handoffs', ''); return; }
    const editor = process.env.VISUAL || process.env.EDITOR || (IS_WIN ? 'notepad' : 'vi');
    const parts = editor.split(/\s+/);
    try {
      try { process.stdin.setRawMode(false); } catch {}
      const child = spawn(parts[0], [...parts.slice(1), p], { stdio: 'inherit', shell: IS_WIN });
      child.on('exit', () => {
        try { process.stdin.setRawMode(true); } catch {}
        this._nudgeResize();
      });
    } catch (err) {
      try { process.stdin.setRawMode(true); } catch {}
      this._notify('📦 Open failed', logger.forUser(err, 60));
    }
  }

  _fireNotifyEvent(event) {
    const ncfg = this.cfg.notifications || {};
    if (ncfg.quiet) return;
    const key = `${event.type}:${event.quotaPct || 0}`;
    if (!this._notifyCooldown.allow(key)) return;
    notifyRules.fire(ncfg.rules, event, {
      os: (title, body) => this._notify(title, body),
      bell: () => { try { process.stdout.write('\x07'); } catch {} },
      webhook: (payload) => {
        if (ncfg.webhookUrl) return notifyRules.postWebhook(ncfg.webhookUrl, payload);
      },
    }, { webhookUrl: ncfg.webhookUrl }).catch(() => {});
  }

  async _tickBackground() {
    // waiting_input: awaiting a response and no output for afterMs
    if (this._awaitingResponse && !this._waitingNotified) {
      const silentMs = Date.now() - (this._lastOutputAt || this._awaitingSince || Date.now());
      const rules = (this.cfg.notifications && this.cfg.notifications.rules) || [];
      const waitRule = rules.find(r => r.when === 'waiting_input')
        || { when: 'waiting_input', afterMs: 60000 };
      const need = typeof waitRule.afterMs === 'number' ? waitRule.afterMs : 60000;
      if (silentMs >= need) {
        this._waitingNotified = true;
        this._fireNotifyEvent({
          type: 'waiting_input',
          waitedMs: silentMs,
          title: 'copilot+ waiting',
          body: `No activity for ${Math.round(silentMs / 1000)}s`,
        });
      }
    }

    // Quota + handoff (best-effort)
    try {
      const q = await fetchQuota();
      if (!q) return;
      this._lastQuota = q;
      if (q.premium && q.premium.entitlement) {
        const pct = (q.premium.used / q.premium.entitlement) * 100;
        this._fireNotifyEvent({
          type: 'quota_above',
          quotaPct: pct,
          title: 'copilot+ quota',
          body: `${Math.round(pct)}% premium used`,
        });
        const thr = (this.cfg.usage && this.cfg.usage.handoffAtPct) || 90;
        if (!this._handoffFired && usageMeter.shouldHandoff(q, thr)) {
          this._handoffFired = true;
          this._writeHandoff(`quota ≥ ${thr}%`);
        }
      }
    } catch {}
  }

  // ── Voice ────────────────────────────────────────────────────────────────

  _startVoice() {
    if (this._busy) return;
    if (this.wakeWord.isListening) this.wakeWord.stop();
    try {
      this.voice.start();
      agentState.writeState(this._pid, { status: 'recording' });
      this._setTitle('🎙 Recording… (Ctrl+R to stop, Ctrl+C to cancel)');
      this._notify('🎙 Recording started', 'Press Ctrl+R to stop');
    } catch (err) {
      this._notify('❌ Could not start recording', logger.forUser(err));
      if (this.cfg.wakeWord && this.cfg.wakeWord.enabled) this.wakeWord.start().catch(() => {});
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
          const phrase = ((this.cfg.wakeWord && this.cfg.wakeWord.phrase) || '').toLowerCase().trim();
          let cleaned = text;
          if (phrase && cleaned.toLowerCase().startsWith(phrase)) {
            cleaned = cleaned.slice(phrase.length).replace(/^[\s,.:]+/, '');
          }
          this._handleVoiceResult(cleaned, 'wake');
        } else {
          this._notify('⚠️ Nothing heard', 'Speak right after the wake phrase');
        }
      })
      .catch(err => {
        this._setTitle('copilot');
        this._notify('❌ Transcription failed', logger.forUser(err));
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
        this._handleVoiceResult(text, 'manual');
      })
      .catch(err => {
        this._setTitle('copilot');
        agentState.writeState(this._pid, { status: 'idle' });
        this._notify('❌ Transcription failed', logger.forUser(err));
      })
      .finally(() => {
        this._busy = false;
        if (this.cfg.wakeWord && this.cfg.wakeWord.enabled && !this.wakeWord.isListening) {
          this.wakeWord.start().catch(() => {});
        }
      });
  }

  /**
   * Common voice-result handler.
   * If voicePreview is enabled, we drop the text into the input buffer
   * without sending (user reviews + edits + Enter). Else we send normally.
   */
  _handleVoiceResult(text, source) {
    if (!text) { this._notify('⚠️ Nothing heard', 'Try speaking more clearly'); return; }
    const payload = this.plugins.emit('beforeSend', { text, kind: 'voice', cancel: false });
    if (payload && payload.cancel) { this._notify('🛑 Voice cancelled by plugin', ''); return; }
    const finalText = (payload && payload.replaceWith) || payload.text || text;

    if (this.cfg.voicePreview) {
      // Type into the prompt but DO NOT submit. The user reviews/edits/Enter.
      this._markAutoInputDirty();
      this._shell.write(finalText);
      this._inputLineBuf  = finalText;
      this._inputCursor   = finalText.length;
      this._inputLineDirty = false;
      this._notify('✏️  Voice ready', 'Press Enter to send, edit first if needed');
      return;
    }
    if (this.cfg.autoSubmit) this._resetAutoInputTracking();
    else this._markAutoInputDirty();
    this._shell.write(finalText + (this.cfg.autoSubmit ? '\r' : ''));
    if (this.cfg.autoSubmit) this._afterSubmit(finalText);
    this._notify('✅ Done', finalText.length > 80 ? finalText.slice(0, 77) + '…' : finalText);
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
        this._notify('❌ Screenshot failed', logger.forUser(err));
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

  _markActive() {
    try {
      fs.mkdirSync(path.dirname(ACTIVE_PID_FILE), { recursive: true });
      fs.writeFileSync(ACTIVE_PID_FILE, String(process.pid));
    } catch {}
  }

  _isActiveInstance() {
    try {
      const pid = parseInt(fs.readFileSync(ACTIVE_PID_FILE, 'utf8').trim(), 10);
      return pid === process.pid;
    } catch {
      return true;
    }
  }

  _setTitle(title) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }

  _notify(title, subtitle) {
    if (this.cfg.notifications && this.cfg.notifications.quiet) {
      logger.info(`[notify] ${title} — ${subtitle}`);
      return;
    }
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
    } else if (PLATFORM === 'darwin') {
      execFile('osascript', [
        '-e',
        `display notification ${JSON.stringify(subtitle)} with title ${JSON.stringify(title)}`,
      ]).on('error', () => {}).unref();
    } else {
      // Linux: notify-send is part of libnotify (gnome / kde / generic).
      execFile('notify-send', [title, subtitle || ''], err => {
        // No notify-send available — silently log only.
        if (err) logger.debug('notify-send missing', err.code);
      }).on('error', () => {}).unref();
    }
  }
}

function _version() {
  try { return require('../package.json').version; } catch { return '0'; }
}

module.exports = CopilotWrapper;
module.exports._selectAutoModel = selectAutoModel;
module.exports._classifyPrompt = classifyPrompt;
