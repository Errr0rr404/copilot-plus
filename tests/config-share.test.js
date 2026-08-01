'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-share-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/config-share')];
const share = require('../src/config-share');

it('buildPackage picks safe keys only', () => {
  const pkg = share.buildPackage({
    theme: 'monokai',
    macros: { 1: 'hello' },
    audioDevice: ':0',
    modelPath: '/secret/model.bin',
  });
  eq(pkg.format, 'copilot-plus-config');
  eq(pkg.config.theme, 'monokai');
  eq(pkg.config.macros[1], 'hello');
  eq(pkg.config.audioDevice, undefined);
  eq(pkg.config.modelPath, undefined);
});

it('export + import merge', () => {
  const file = path.join(TMP, 'pkg.json');
  share.exportToFile({ theme: 'solarized', macros: { 1: 'a', 2: '' } }, file);
  const res = share.importFromFile(file, { theme: 'dark', macros: { 1: 'keep', 2: 'b' } }, { overwrite: false });
  eq(res.patch.theme, 'solarized');
  // merge keeps local keys and overlays
  eq(res.config.macros[1], 'a');
});

it('rejects invalid package', () => {
  let threw = false;
  try { share.applyPackage({ format: 'nope' }, {}); } catch { threw = true; }
  ok(threw);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
