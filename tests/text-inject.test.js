'use strict';

const { eq } = require('./_assert');
const { sanitizeInjectedText, formatAtPath } = require('../src/text-inject');

it('sanitizeInjectedText flattens newlines so Copilot does not multi-submit', () => {
  eq(sanitizeInjectedText('foo\nbar\r\nbaz'), 'foo bar baz');
});

it('sanitizeInjectedText keeps inner spaces', () => {
  eq(sanitizeInjectedText('hello  world'), 'hello  world');
});

it('formatAtPath quotes paths with spaces', () => {
  eq(formatAtPath('/Users/Jane Doe/shot.png'), '@"/Users/Jane Doe/shot.png" ');
});

it('formatAtPath leaves simple paths unquoted', () => {
  eq(formatAtPath('/tmp/shot.png'), '@/tmp/shot.png ');
});
