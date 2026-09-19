'use strict';

const { eq, ok } = require('./_assert');
const { titlePads } = require('../src/cheatsheet');

it('titlePads never returns negative repeat counts', () => {
  const a = titlePads(10, 22);
  ok(a.padL >= 0 && a.padR >= 0);
  eq(a.padL + a.padR, 0);

  const b = titlePads(22, 22);
  eq(b.padL, 0);
  eq(b.padR, 0);

  const c = titlePads(40, 22);
  eq(c.padL + c.padR, 18);
});
