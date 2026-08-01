'use strict';

const ctx = require('../src/context');
const { ok, deepEq } = require('./_assert');

it('suggestKinds picks diff for review/PR prompts', () => {
  const kinds = ctx.suggestKinds('review this diff please');
  ok(kinds.includes('diff'));
});

it('suggestKinds picks status for test prompts', () => {
  const kinds = ctx.suggestKinds('the tests are failing');
  ok(kinds.includes('status'));
});

it('suggestKinds picks recent for file prompts', () => {
  const kinds = ctx.suggestKinds('open the user module file');
  ok(kinds.includes('recent'));
});

it('suggestKinds defaults to status+diff for unrelated prompts', () => {
  const kinds = ctx.suggestKinds('what time is it');
  ok(kinds.includes('status'));
  ok(kinds.includes('diff'));
});
