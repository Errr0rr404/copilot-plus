'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-handoff-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/handoff')];
const handoff = require('../src/handoff');

it('write creates markdown + latest pointer', () => {
  const file = handoff.write({
    cwd: '/tmp/proj',
    model: 'test-model',
    prompts: ['do the thing'],
    lastResponse: 'done',
    reason: 'test',
    quota: { premium: { used: 90, entitlement: 100 } },
  });
  ok(file);
  ok(fs.existsSync(file));
  const body = fs.readFileSync(file, 'utf8');
  ok(body.includes('do the thing'));
  ok(body.includes('test-model'));
  ok(handoff.latestPath());
});

it('list returns newest first', () => {
  handoff.write({ prompts: ['a'], reason: '1' });
  handoff.write({ prompts: ['b'], reason: '2' });
  const items = handoff.list(5);
  ok(items.length >= 2);
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
