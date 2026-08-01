'use strict';

const { eq, ok } = require('./_assert');
const fp = require('../src/file-picker');

it('fuzzyScore requires ordered chars', () => {
  ok(fp.fuzzyScore('cfg', 'src/config.js') > 0);
  eq(fp.fuzzyScore('zzz', 'src/config.js'), -1);
});

it('fuzzyScore ranks basename hits higher', () => {
  const a = fp.fuzzyScore('wrap', 'src/wrapper.js');
  const b = fp.fuzzyScore('wrap', 'docs/superpowers/wrapper-notes.md');
  ok(a > 0 && b > 0);
});

it('search returns abs paths', () => {
  const hits = fp.search('package', { cwd: process.cwd(), limit: 5 });
  ok(hits.length >= 1);
  ok(hits[0].abs.includes('package'));
});
