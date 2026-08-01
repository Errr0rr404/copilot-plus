'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-wf-'));
const wfDir = path.join(TMP, '.copilot', 'workflows');
fs.mkdirSync(wfDir, { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/workflows')];
const workflows = require('../src/workflows');

it('parseSimpleYaml reads name and steps', () => {
  const y = `
name: Fix & Test
steps:
  - prompt: "Run tests"
    wait: true
  - prompt: 'Fix them'
    wait: false
`;
  const w = workflows.parseSimpleYaml(y);
  eq(w.name, 'Fix & Test');
  eq(w.steps.length, 2);
  eq(w.steps[0].prompt, 'Run tests');
  eq(w.steps[1].wait, false);
});

it('expandVars substitutes cwd and date', () => {
  const out = workflows.expandVars('in {{cwd}} on {{date}}', { cwd: '/tmp/x', date: '2026-01-01' });
  eq(out, 'in /tmp/x on 2026-01-01');
});

it('list + loadByName from disk', () => {
  fs.writeFileSync(path.join(wfDir, 'demo.yaml'), [
    'name: demo',
    'steps:',
    '  - prompt: "hello {{cwd}}"',
    '    wait: true',
  ].join('\n'));
  const list = workflows.list({});
  ok(list.some(w => w.name === 'demo'));
  const w = workflows.loadByName('demo', {});
  eq(w.steps[0].prompt, 'hello {{cwd}}');
});

it('run executes steps in order', async () => {
  const sent = [];
  const w = {
    name: 't',
    steps: [
      { prompt: 'one', wait: true },
      { prompt: 'two', wait: false },
    ],
  };
  const res = await workflows.run(w, {
    send: (p) => { sent.push(p); },
    waitForSettle: async () => {},
  });
  ok(res.ok);
  eq(sent.join(','), 'one,two');
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
