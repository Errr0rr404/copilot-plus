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

/** Score an audio device name — higher = more likely to be the real microphone. */
function scoreMicDevice(name) {
  const n = name.toLowerCase();
  if (/teams|zoom|loopback|soundflower|blackhole|virtual|aggregate|multi.output|stereo mix|wave out/.test(n)) return -1;
  if (n.includes('built-in')) return 100;
  if (n.includes('macbook') && n.includes('microphone')) return 90;
  if (n.includes('microphone')) return 80;
  if (n.includes('iphone') || n.includes('ipad')) return 50;
  return 10;
}

/**
 * Parse `ffmpeg -f avfoundation -list_devices true -i ""` stderr and return
 * the avfoundation index (e.g. ":2") for the best microphone found.
 * Returns null if detection fails.
 */
function detectMicrophone() {
  if (os.platform() === 'win32') return detectMicrophoneWindows();

  try {
    const output = execFileSync('ffmpeg', [
      '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return parseBestMicMac(output);
  } catch (err) {
    return parseBestMicMac(err.stderr || '');
  }
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
 * On macOS id is ":N", on Windows id is the device name string.
 */
function listMicDevices() {
  if (os.platform() === 'win32') {
    try {
      const result = spawnSync('ffmpeg', [
        '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy',
      ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
      return parseMicDevicesWindows(result.stderr || '');
    } catch {
      return [];
    }
  } else {
    try {
      const output = execFileSync('ffmpeg', [
        '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
      ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
      return parseMicDevicesMac(output);
    } catch (err) {
      return parseMicDevicesMac(err.stderr || '');
    }
  }
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
  };
}

function load() {
  const fileConfig = fs.existsSync(CONFIG_PATH)
    ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; } })()
    : {};

  // Auto-detect the microphone unless the user has explicitly set audioDevice in their config
  const defaultDevice = os.platform() === 'win32' ? null : ':0';
  const audioDevice = fileConfig.audioDevice || detectMicrophone() || defaultDevice;

  const defaults = defaultConfig();

  // Auto-heal stale modelPath: if the saved path no longer exists, re-detect
  let modelPath = fileConfig.modelPath;
  if (modelPath && !fs.existsSync(modelPath)) {
    modelPath = findWhisperModel();
  }

  // Deep-merge nested objects so partial config doesn't obliterate defaults
  const merged = Object.assign({}, defaults, fileConfig, { audioDevice, modelPath });
  merged.macros = Object.assign({}, defaults.macros, fileConfig.macros);
  merged.wakeWord = Object.assign({}, defaults.wakeWord, fileConfig.wakeWord);
  merged.workhorseModels = Object.assign({}, defaults.workhorseModels, fileConfig.workhorseModels);
  merged.autoModels = Object.assign({}, defaults.autoModels, fileConfig.autoModels);

  return merged;
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

module.exports = { load, save, patch, findWhisperModel, detectMicrophone, listMicDevices, CONFIG_PATH };
