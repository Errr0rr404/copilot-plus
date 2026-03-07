'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.copilot', 'talk-to-copilot.json');

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

function findWhisperModel() {
  return WHISPER_MODEL_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

function load() {
  const defaults = {
    modelPath: findWhisperModel(),
    audioDevice: ':0',       // avfoundation default mic
    autoSubmit: false,       // whether to press Enter after injecting transcription
    recordKey: 'ctrl+r',
    screenshotKey: 'ctrl+p',
  };

  if (!fs.existsSync(CONFIG_PATH)) return defaults;

  try {
    return Object.assign(defaults, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return defaults;
  }
}

function save(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, findWhisperModel, CONFIG_PATH };
