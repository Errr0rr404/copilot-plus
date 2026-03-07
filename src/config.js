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
  '/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin',
  '/opt/homebrew/share/whisper.cpp/models/ggml-small.en.bin',
  '/opt/homebrew/share/whisper.cpp/models/ggml-tiny.en.bin',
  '/usr/local/share/whisper.cpp/models/ggml-base.en.bin',
];

/** Score an audio device name — higher = more likely to be the real microphone. */
function scoreMicDevice(name) {
  const n = name.toLowerCase();

  // Hard skip — virtual/loopback/software devices almost never contain the user's voice
  if (/teams|zoom|loopback|soundflower|blackhole|virtual|aggregate|multi.output/.test(n)) return -1;

  if (n.includes('built-in')) return 100;
  if (n.includes('macbook') && n.includes('microphone')) return 90;
  if (n.includes('microphone')) return 80;   // any real-sounding mic
  if (n.includes('iphone') || n.includes('ipad')) return 50;  // continuity mic — fine but secondary

  return 10; // unknown device — prefer over virtual but below named mics
}

/**
 * Parse `ffmpeg -f avfoundation -list_devices true -i ""` stderr and return
 * the avfoundation index (e.g. ":2") for the best microphone found.
 * Returns null if detection fails.
 */
function detectMicrophone() {
  try {
    const output = execFileSync('ffmpeg', [
      '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
    ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });

    return parseBestMic(output);
  } catch (err) {
    // ffmpeg exits non-zero when listing devices — stderr is in err.stderr
    return parseBestMic(err.stderr || '');
  }
}

function parseBestMic(output) {
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
    deviceRe.lastIndex = 0; // reset for next iteration
    if (!m) continue;

    const [, index, name] = m;
    const score = scoreMicDevice(name.trim());
    if (score > bestScore) {
      bestScore = score;
      best = `:${index}`;
    }
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
