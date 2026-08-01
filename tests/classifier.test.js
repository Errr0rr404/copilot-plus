'use strict';

const wrapper = require('../src/wrapper');
const { eq } = require('./_assert');

const cfg = { autoModels: { fast: 'F', medium: 'M', powerful: 'P' }, workhorseModels: {} };

it('short Q→fast classification', () => {
  eq(wrapper._classifyPrompt('what is a closure'), 'fast');
});

it('long prompt→powerful classification', () => {
  eq(wrapper._classifyPrompt('please refactor the auth module and consolidate the user model into a single source of truth across the dashboard tests and pipeline scripts'), 'powerful');
});

it('default→medium classification', () => {
  // No fast/powerful keywords, mid-length prompt → medium tier
  eq(wrapper._classifyPrompt('hmm this seems off somehow not quite right'), 'medium');
});

it('selectAutoModel returns configured fast model', () => {
  eq(wrapper._selectAutoModel('what is a promise', cfg), 'F');
});

it('selectAutoModel returns powerful for refactor', () => {
  eq(wrapper._selectAutoModel('refactor this entire module', cfg), 'P');
});

it('selectAutoModel falls back to workhorse if tier missing', () => {
  const c = { autoModels: {}, workhorseModels: { 1: 'W1', 2: 'W2' } };
  eq(wrapper._selectAutoModel('hello', c), 'W1');
});
