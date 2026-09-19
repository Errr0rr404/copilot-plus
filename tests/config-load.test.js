'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-cfgload-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/config')];
const cfg = require('../src/config');

it('load re-detects modelPath when the file omits it', () => {
  fs.writeFileSync(cfg.CONFIG_PATH, JSON.stringify({ theme: 'dark' }));
  const loaded = cfg.load();
  ok(loaded.modelPath === null || typeof loaded.modelPath === 'string');
  ok(loaded.modelPath !== undefined);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
