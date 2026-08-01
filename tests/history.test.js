'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

// Re-route history storage to a temp dir so tests don't touch ~/.copilot
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-test-'));
const real = path.join(TMP, '.copilot');
fs.mkdirSync(real, { recursive: true });

const realHistoryPath = path.join(real, 'history.jsonl');
const Module = require('module');
const originalResolve = Module._resolveFilename;
// Stub HOME so the history module writes into TMP
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

// Clear require cache so history.js picks up the new HOME
delete require.cache[require.resolve('../src/history')];
const history = require('../src/history');

it('writes to the right path under stubbed HOME', () => {
  eq(history.HISTORY_PATH, realHistoryPath);
});

it('append + readAll round-trip', () => {
  history.clear();
  history.append({ prompt: 'first prompt' });
  history.append({ prompt: 'second prompt about ducks' });
  const all = history.readAll();
  eq(all.length, 2);
  eq(all[0].prompt, 'first prompt');
});

it('search returns AND-token matches', () => {
  history.clear();
  history.append({ prompt: 'ducks are great' });
  history.append({ prompt: 'cats and dogs' });
  history.append({ prompt: 'ducks beat cats' });
  const hits = history.search('ducks cats');
  eq(hits.length, 1);
  ok(hits[0].prompt.includes('ducks'));
  ok(hits[0].prompt.includes('cats'));
});

it('search with empty query returns recent', () => {
  history.clear();
  for (let i = 0; i < 5; i++) history.append({ prompt: 'x' + i });
  const hits = history.search('');
  eq(hits.length, 5);
});

it('stats reports count and bytes', () => {
  history.clear();
  history.append({ prompt: 'one' });
  const s = history.stats();
  eq(s.count, 1);
  ok(s.bytes > 0);
});

// Don't leak — clean the temp dir even if tests fail.
process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
