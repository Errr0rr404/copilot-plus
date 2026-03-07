'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

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
  try {
    const output = execFileSync('ffmpeg', [
      '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return parseBestMicWindows(output);
  } catch (err) {
    return parseBestMicWindows(err.stderr || '');
  }
}

function parseBestMicWindows(output) {
  // Match lines like: [dshow @ 0x...] "Microphone (Realtek Audio)" (audio)
  const deviceRe = /\[dshow.*?\]\s+"([^"]+)"\s+\(audio\)/g;
  let best = null;
  let bestScore = -Infinity;
  let m;
  while ((m = deviceRe.exec(output)) !== null) {
    const name = m[1].trim();
    const score = scoreMicDevice(name);
    if (score > bestScore) { bestScore = score; best = name; }
  }
  return best; // Windows uses the device name directly: audio="Microphone (Realtek Audio)"
}

function parseBestMicMac(output) {
  // Match lines like: [AVFoundation indev @ 0x...] [2] MacBook Pro Microphone
  const deviceRe = /\[AVFoundation.*?\]\s+\[(\d+)\]\s+(.+)/g;

  let best = null;
  let bestScore = -Infinity;
  let inAudioSection = false;

  for (const line of output.split('\n')) {
    if (line.includes('AVFoundation audio devices')) { inAudioSection = true; continue; }
    if (line.includes('AVFoundation video devices')) { inAudioSection = false; continue; }
    if (!inAudioSection) continue;

    const m = deviceRe.exec(line);
    deviceRe.lastIndex = 0;
    if (!m) continue;

    const [, index, name] = m;
    const score = scoreMicDevice(name.trim());
    if (score > bestScore) { bestScore = score; best = `:${index}`; }
  }
  return best;
}

function findWhisperModel() {
  return WHISPER_MODEL_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

function load() {
  const fileConfig = fs.existsSync(CONFIG_PATH)
    ? (() => { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; } })()
    : {};

  // Auto-detect the microphone unless the user has explicitly set audioDevice in their config
  const audioDevice = fileConfig.audioDevice || detectMicrophone() || ':0';

  const defaults = {
    modelPath: findWhisperModel(),
    autoSubmit: false,
  };

  return Object.assign(defaults, fileConfig, { audioDevice });
}

function save(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, findWhisperModel, detectMicrophone, CONFIG_PATH };
