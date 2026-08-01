'use strict';

const shell = require('../src/shell-exec');
const { ok, eq, includes } = require('./_assert');

it('format wraps command + output in a shell code block', () => {
  const block = shell.format('ls -la', { ok: true, text: 'total 0', code: 0 });
  includes(block, '```shell');
  includes(block, '$ ls -la');
  includes(block, 'total 0');
});

it('format includes exit code on failure', () => {
  const block = shell.format('false', { ok: false, text: '', code: 1 });
  includes(block, '(exit 1)');
  includes(block, '(no output)');
});

it('empty command returns immediately', async () => {
  const r = await shell.exec('');
  eq(r.ok, false);
});
