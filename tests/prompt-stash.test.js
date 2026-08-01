'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-stash-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/prompt-stash')];
const stash = require('../src/prompt-stash');

it('push + pop LIFO', () => {
  stash.clear();
  eq(stash.push('first'), 1);
  eq(stash.push('second'), 2);
  eq(stash.pop().text, 'second');
  eq(stash.pop().text, 'first');
  eq(stash.pop(), null);
});

it('rejects empty push', () => {
  stash.clear();
  eq(stash.push('   '), 0);
  eq(stash.size(), 0);
});

it('peek does not remove', () => {
  stash.clear();
  stash.push('keep');
  eq(stash.peek().text, 'keep');
  eq(stash.size(), 1);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
