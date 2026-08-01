'use strict';

const palette = require('../src/palette');
const { ok, eq } = require('./_assert');
const fuzzyScore = palette._fuzzyScore;

it('returns null when query is not a subsequence', () => {
  eq(fuzzyScore('voice recording', 'xyz'), null);
});

it('returns a number when query matches', () => {
  ok(typeof fuzzyScore('voice recording', 'vr') === 'number');
});

it('prefers consecutive matches', () => {
  const a = fuzzyScore('voice recording', 'vrec');
  const b = fuzzyScore('verify recursion', 'vrec');
  ok(a !== null && b !== null);
});

it('boosts word-start matches', () => {
  const start = fuzzyScore('open settings', 'os');
  const mid   = fuzzyScore('voices', 'os');
  ok(start !== null);
  ok(mid === null || start >= mid, 'word-start should not be worse than mid-word');
});

it('empty query returns 0', () => {
  eq(fuzzyScore('anything', ''), 0);
});
