'use strict';

/**
 * Tiny assertion helpers used by the in-repo test suite.
 * All helpers throw on failure with a clear, single-line message.
 */

function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'eq'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function ok(val, msg) {
  if (!val) throw new Error(`${msg || 'ok'}: expected truthy, got ${JSON.stringify(val)}`);
}

function deepEq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || 'deepEq'}: expected ${sb}, got ${sa}`);
}

function throws(fn, msg) {
  let thrown = false;
  try { fn(); } catch { thrown = true; }
  if (!thrown) throw new Error(`${msg || 'throws'}: expected function to throw`);
}

function includes(haystack, needle, msg) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${msg || 'includes'}: expected ${JSON.stringify(haystack).slice(0, 60)} to include ${JSON.stringify(needle)}`);
  }
}

module.exports = { eq, ok, deepEq, throws, includes };
