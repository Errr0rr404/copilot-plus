'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const CONFIG_PATH = path.join(os.homedir(), '.copilot', 'copilot-plus.json');

const WHISPER_MODEL_CANDIDATES = [
  path.join(os.homedir(), '.copilot', 'whisper-model.bin'),
  path.join(os.homedir(), '.copilot', 'models', 'ggml-base.en.bin'),
  path.join(os.homedir(), '.copilot', 'models', 'ggml-small.en.bin'),
  path.join(os.homedir(), '.copilot', 'models', 'ggml-tiny.en.bin'),
  path.join(__dirname, '..', 'models', 'ggml-base.en.bin'),
  path.join(__dirname, '..', 'models', 'ggml-small.en.bin'),
  path.join(__dirname, '..', 'models', 'ggml-tiny.en.bin'),
  // macOS Homebrew paths
  '/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin',
  '/opt/homebrew/share/whisper.cpp/models/ggml-small.en.bin',
  '/opt/homebrew/share/whisper.cpp/models/ggml-tiny.en.bin',
  '/usr/local/share/whisper.cpp/models/ggml-base.en.bin',
  // Windows common paths
  path.join(os.homedir(), 'AppData', 'Local', 'whisper.cpp', 'models', 'ggml-base.en.bin'),
  path.join(os.homedir(), 'AppData', 'Local', 'whisper.cpp', 'models', 'ggml-small.en.bin'),
  'C:\\whisper.cpp\\models\\ggml-base.en.bin',
  'C:\\whisper.cpp\\models\\ggml-small.en.bin',
];

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';
const IS_MAC   = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

/** Score an audio device name — higher = more likely to be the real microphone. */
function scoreMicDevice(name) {
  const n = name.toLowerCase();
  if (/teams|zoom|loopback|soundflower|blackhole|virtual|aggregate|multi.output|stereo mix|wave out/.test(n)) return -1;
  if (n.includes('built-in')) return 100;
  if (n.includes('macbook') && n.includes('microphone')) return 90;
  if (n.includes('microphone') || n.includes('mic')) return 80;
  if (n.includes('iphone') || n.includes('ipad')) return 50;
  return 10;
}

/**
 * Detect the best available microphone for the current platform.
 * Returns a string suitable as the `audioDevice` config value, or null.
 *  - macOS:  ":N" (avfoundation index)
 *  - Windows: device name (used with audio="name")
 *  - Linux:  "pulse:<source>" or "alsa:<hw>"
 */
function detectMicrophone() {
  if (IS_WIN)   return detectMicrophoneWindows();
  if (IS_LINUX) return detectMicrophoneLinux();

  try {
    const output = execFileSync('ffmpeg', [
      '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return parseBestMicMac(output);
  } catch (err) {
    return parseBestMicMac(err.stderr || '');
  }
}

/**
 * Linux mic detection — prefer pulseaudio's default source (`@DEFAULT_SOURCE@`)
 * since most desktop distros run pulse/pipewire. Falls back to scanning
 * `pactl list short sources` then `arecord -l` for ALSA.
 */
function detectMicrophoneLinux() {
  // 1) Pulse / pipewire — default source is the cleanest choice.
  try {
    const r = spawnSync('pactl', ['info'], { encoding: 'utf8', timeout: 1500 });
    if (r.status === 0) return 'pulse:default';
  } catch {}
  // 2) Pulse alternate — pick first non-monitor source.
  try {
    const r = spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8', timeout: 1500 });
    if (r.status === 0) {
      const line = r.stdout.split('\n').map(l => l.trim()).find(l =>
        l && !/\.monitor\b/.test(l)
      );
      if (line) {
        const cols = line.split(/\s+/);
        if (cols[1]) return `pulse:${cols[1]}`;
      }
    }
  } catch {}
  // 3) ALSA fallback.
  try {
    const r = spawnSync('arecord', ['-l'], { encoding: 'utf8', timeout: 1500 });
    const m = (r.stdout || '').match(/card (\d+):.*device (\d+):/);
    if (m) return `alsa:hw:${m[1]},${m[2]}`;
  } catch {}
  return null;
}

function detectMicrophoneWindows() {
  // Use spawnSync so we always capture stderr regardless of exit code.
  // Some ffmpeg builds on Windows exit 0 for device listing, so
  // execFileSync's catch-based stderr access doesn't work reliably.
  try {
    const result = spawnSync('ffmpeg', [
      '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return parseBestMicWindows(result.stderr || '');
  } catch {
    return null;
  }
}

function parseBestMicWindows(output) {
  const devices = parseMicDevicesWindows(output);
  if (!devices.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const { id, name } of devices) {
    const score = scoreMicDevice(name);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best; // Windows uses the device name directly: audio="Microphone (Realtek Audio)"
}

function parseBestMicMac(output) {
  const devices = parseMicDevicesMac(output);
  if (!devices.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const { id, name } of devices) {
    const score = scoreMicDevice(name);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

/** Return all audio input devices on macOS as [{ id, name }]. */
function parseMicDevicesMac(output) {
  // Match lines like: [AVFoundation indev @ 0x...] [2] MacBook Pro Microphone
  const deviceRe = /\[AVFoundation.*?\]\s+\[(\d+)\]\s+(.+)/g;
  const devices = [];
  let inAudioSection = false;

  for (const line of output.split('\n')) {
    if (line.includes('AVFoundation audio devices')) { inAudioSection = true; continue; }
    if (line.includes('AVFoundation video devices')) { inAudioSection = false; continue; }
    if (!inAudioSection) continue;

    const m = deviceRe.exec(line);
    deviceRe.lastIndex = 0;
    if (!m) continue;

    const [, index, name] = m;
    devices.push({ id: `:${index}`, name: name.trim() });
  }
  return devices;
}

/** Return all audio input devices on Windows as [{ id, name }]. */
function parseMicDevicesWindows(output) {
  const deviceRe = /\[dshow.*?\]\s+"([^"]+)"\s+\(audio\)/g;
  const devices = [];
  let m;
  while ((m = deviceRe.exec(output)) !== null) {
    const name = m[1].trim();
    devices.push({ id: name, name });
  }
  return devices;
}

/**
 * Return all detected audio input devices as [{ id, name }].
 *   - macOS:  id is ":N" (avfoundation index)
 *   - Windows: id is the device name string
 *   - Linux:  id is "pulse:<src>" or "alsa:<hw>"
 */
function listMicDevices() {
  if (IS_WIN) {
    try {
      const result = spawnSync('ffmpeg', [
        '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy',
      ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
      return parseMicDevicesWindows(result.stderr || '');
    } catch {
      return [];
    }
  }
  if (IS_LINUX) {
    return parseMicDevicesLinux();
  }
  try {
    const output = execFileSync('ffmpeg', [
      '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return parseMicDevicesMac(output);
  } catch (err) {
    return parseMicDevicesMac(err.stderr || '');
  }
}

function parseMicDevicesLinux() {
  const out = [];
  // Pulse first
  try {
    const r = spawnSync('pactl', ['list', 'short', 'sources'], { encoding: 'utf8', timeout: 1500 });
    if (r.status === 0) {
      for (const line of r.stdout.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 2) continue;
        const name = cols[1];
        if (!name || /\.monitor\b/.test(name)) continue;
        out.push({ id: `pulse:${name}`, name: `(pulse) ${name}` });
      }
    }
  } catch {}
  // ALSA second
  try {
    const r = spawnSync('arecord', ['-l'], { encoding: 'utf8', timeout: 1500 });
    if (r.status === 0) {
      const re = /card (\d+):\s+([^,]+?),\s+device (\d+):\s+(.+)$/gm;
      let m;
      while ((m = re.exec(r.stdout)) !== null) {
        const id = `alsa:hw:${m[1]},${m[3]}`;
        out.push({ id, name: `(alsa) ${m[2].trim()} — ${m[4].trim()}` });
      }
    }
  } catch {}
  return out;
}

function findWhisperModel() {
  return WHISPER_MODEL_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

function defaultConfig() {
  return {
    modelPath: findWhisperModel(),
    autoSubmit: false,
    firstRunComplete: false,
    macros: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '', 8: '', 9: '' },
    wakeWord: { enabled: false, phrase: 'hey copilot', chunkSeconds: 2 },
    workhorseModels: { 1: '', 2: '', 3: '', 4: '' },
    autoModels: { fast: '', medium: '', powerful: '' },

    // — appearance
    theme: 'dark', // dark | light | solarized | monokai | auto

    // — voice
    voiceLanguage: 'en',     // 'en' | 'auto' | ISO 639-1 (es, ja, de, …)
    voicePreview:  false,    // if true, transcribed text waits for Enter before sending

    // — extras
    shellPrefix:   '!',      // type "!cmd" then Enter to run a shell command
    historyEnabled: true,    // append every prompt to ~/.copilot/history.jsonl
    tts: { enabled: false, rate: 200, voice: '' },
    safety: { enabled: true, disabledKinds: [], autoRedact: false },
    contextHotkey: { kinds: ['status', 'diff'] }, // Ctrl+G default set
    notifications: {
      quiet: false,
      sound: false,
      webhookUrl: '',
      rules: [
        { when: 'session_idle', channels: ['os'] },
        { when: 'waiting_input', afterMs: 60000, channels: ['os', 'bell'] },
        { when: 'quota_above', pct: 80, channels: ['os'] },
      ],
    },
    queue: { whenBusy: true, maxSize: 20 },
    usage: { dailyBudget: 0, handoffAtPct: 90 },
    workflowsDir: '', // empty → ~/.copilot/workflows
  };
}

function load() {
  const fileConfig = fs.existsSync(CONFIG_PATH)
    ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; } })()
    : {};

  // Auto-detect the microphone unless the user has explicitly set audioDevice in their config
  let defaultDevice;
  if (IS_WIN)        defaultDevice = null;
  else if (IS_LINUX) defaultDevice = 'pulse:default';
  else               defaultDevice = ':0';
  const audioDevice = fileConfig.audioDevice || detectMicrophone() || defaultDevice;

  const defaults = defaultConfig();

  // Auto-heal stale modelPath: if the saved path no longer exists, re-detect
  let modelPath = fileConfig.modelPath;
  if (modelPath && !fs.existsSync(modelPath)) {
    modelPath = findWhisperModel();
  }

  // Deep-merge nested objects so partial config doesn't obliterate defaults
  const merged = Object.assign({}, defaults, fileConfig, { audioDevice, modelPath });
  merged.macros          = Object.assign({}, defaults.macros,          fileConfig.macros);
  merged.wakeWord        = Object.assign({}, defaults.wakeWord,        fileConfig.wakeWord);
  merged.workhorseModels = Object.assign({}, defaults.workhorseModels, fileConfig.workhorseModels);
  merged.autoModels      = Object.assign({}, defaults.autoModels,      fileConfig.autoModels);
  merged.tts             = Object.assign({}, defaults.tts,             fileConfig.tts);
  merged.safety          = Object.assign({}, defaults.safety,          fileConfig.safety);
  merged.contextHotkey   = Object.assign({}, defaults.contextHotkey,   fileConfig.contextHotkey);
  merged.notifications   = Object.assign({}, defaults.notifications,   fileConfig.notifications);
  merged.queue           = Object.assign({}, defaults.queue,           fileConfig.queue);
  merged.usage           = Object.assign({}, defaults.usage,           fileConfig.usage);
  // Preserve custom notification rules when provided
  if (Array.isArray(fileConfig.notifications && fileConfig.notifications.rules)) {
    merged.notifications.rules = fileConfig.notifications.rules;
  }

  return merged;
}

/**
 * Validate a config object — returns a list of human-readable warnings.
 * Used by --doctor and tests; the runtime is forgiving and will fall back
 * to defaults for any invalid key.
 */
function validate(cfg) {
  const warns = [];
  if (cfg.theme && !['dark', 'light', 'solarized', 'monokai', 'auto'].includes(cfg.theme)) {
    warns.push(`unknown theme: ${cfg.theme}`);
  }
  if (cfg.voiceLanguage && !/^([a-z]{2,3}|auto)$/.test(cfg.voiceLanguage)) {
    warns.push(`voiceLanguage should be ISO 639-1 or 'auto', got: ${cfg.voiceLanguage}`);
  }
  if (cfg.shellPrefix && cfg.shellPrefix.length !== 1) {
    warns.push(`shellPrefix should be 1 character, got: ${JSON.stringify(cfg.shellPrefix)}`);
  }
  if (cfg.modelPath && !fs.existsSync(cfg.modelPath)) {
    warns.push(`modelPath does not exist: ${cfg.modelPath}`);
  }
  if (cfg.tts && (typeof cfg.tts.rate !== 'number' || cfg.tts.rate < 50 || cfg.tts.rate > 500)) {
    warns.push(`tts.rate must be 50–500 wpm`);
  }
  if (cfg.queue && cfg.queue.maxSize != null && (typeof cfg.queue.maxSize !== 'number' || cfg.queue.maxSize < 1)) {
    warns.push(`queue.maxSize must be a positive number`);
  }
  if (cfg.usage && cfg.usage.handoffAtPct != null) {
    const p = cfg.usage.handoffAtPct;
    if (typeof p !== 'number' || p < 1 || p > 100) warns.push(`usage.handoffAtPct must be 1–100`);
  }
  return warns;
}

function save(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Read the raw saved config from disk, shallow-merge `updates` (with
 * one-level deep merge for known object keys like macros, wakeWord, etc.),
 * and write back.  This avoids persisting runtime-derived values such as
 * the auto-detected audioDevice.
 */
function patch(updates) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
        && raw[key] !== null && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
      raw[key] = Object.assign({}, raw[key], value);
    } else {
      raw[key] = value;
    }
  }
  save(raw);
}

module.exports = {
  load, save, patch, validate,
  findWhisperModel, detectMicrophone, listMicDevices,
  CONFIG_PATH,
};
