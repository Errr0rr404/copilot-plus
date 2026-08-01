'use strict';

const WakeWordListener = require('../src/wakeword');
const { ok, eq } = require('./_assert');

function newListener(phrase = 'hey copilot') {
  return new WakeWordListener({
    audioDevice: ':0', modelPath: '/x',
    wakeWord: { enabled: true, phrase },
  });
}

it('matches exact phrase', () => {
  ok(newListener()._matchesWakePhrase('hey copilot what is this'));
});

it('matches without leading filler', () => {
  ok(newListener()._matchesWakePhrase('copilot do the thing'));
});

it('matches a fuzzy mis-transcription', () => {
  // distance 3 from 'copilot' is fine (40% of 7 = 3)
  ok(newListener()._matchesWakePhrase('hey coballot help me'));
});

it('rejects unrelated speech', () => {
  ok(!newListener()._matchesWakePhrase('what a nice day it is today'));
});

it('handles punctuation', () => {
  ok(newListener()._matchesWakePhrase('Hey, Copilot. Show me the diff.'));
});

it('empty text returns false', () => {
  eq(newListener()._matchesWakePhrase(''), false);
});
