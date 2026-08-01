#!/usr/bin/env node
'use strict';

/**
 * Zero-dependency test runner for copilot-plus.
 *
 * Discovers every *.test.js file in this directory, requires it, runs the
 * registered tests, and exits non-zero if any fail. Compatible with `node
 * tests/run.js` from the repo root or `npm test`.
 *
 * Tests use the global `it(name, fn)`. Failed assertions throw — see
 * tests/_assert.js for helpers.
 */

const fs   = require('fs');
const path = require('path');

const tests = [];
global.it = (name, fn) => tests.push({ name, fn });

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

for (const f of files) require(path.join(dir, f));

(async () => {
  let pass = 0, fail = 0;
  const failures = [];

  for (const t of tests) {
    try {
      const r = t.fn();
      if (r && typeof r.then === 'function') await r;
      pass++;
      process.stdout.write('.');
    } catch (err) {
      fail++;
      failures.push({ name: t.name, error: err });
      process.stdout.write('F');
    }
  }

  process.stdout.write('\n\n');

  if (failures.length) {
    for (const f of failures) {
      process.stdout.write(`\x1b[31mFAIL\x1b[0m ${f.name}\n`);
      process.stdout.write(`     ${f.error && f.error.stack ? f.error.stack.split('\n').slice(0, 6).join('\n     ') : f.error}\n\n`);
    }
  }
  process.stdout.write(`${pass + fail} tests · \x1b[32m${pass} passed\x1b[0m · ${fail ? `\x1b[31m${fail} failed\x1b[0m` : `${fail} failed`}\n`);
  process.exit(fail ? 1 : 0);
})();
