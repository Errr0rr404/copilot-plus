'use strict';

const { summarizeResponse } = require('../src/tts');
const { eq, ok, includes } = require('./_assert');

it('strips fenced code blocks', () => {
  const out = summarizeResponse('hello\n```js\nconst x = 1;\n```\nworld');
  ok(!out.includes('const x'));
  includes(out, 'hello');
  includes(out, 'world');
});

it('strips inline code spans', () => {
  const out = summarizeResponse('use `foo` not `bar`');
  ok(!out.includes('foo'));
});

it('strips markdown headers', () => {
  const out = summarizeResponse('# Title\nbody');
  ok(!out.startsWith('#'));
  includes(out, 'Title');
});

it('truncates long output', () => {
  const big = 'a'.repeat(5000);
  const out = summarizeResponse(big);
  ok(out.length <= 2100);
  includes(out, 'truncated');
});

it('empty input returns empty', () => {
  eq(summarizeResponse(''), '');
  eq(summarizeResponse(null), '');
});
