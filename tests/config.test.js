'use strict';

const cfg = require('../src/config');
const { ok, eq } = require('./_assert');

it('validate accepts a normal config', () => {
  const warns = cfg.validate({
    theme: 'dark', voiceLanguage: 'en', shellPrefix: '!',
    tts: { rate: 200, voice: '' },
  });
  eq(warns.length, 0);
});

it('validate flags unknown theme', () => {
  const warns = cfg.validate({ theme: 'space-jam' });
  ok(warns.some(w => w.includes('theme')));
});

it('validate flags bad voice language', () => {
  const warns = cfg.validate({ voiceLanguage: 'english' });
  ok(warns.some(w => w.includes('voiceLanguage')));
});

it('validate flags multi-char shell prefix', () => {
  const warns = cfg.validate({ shellPrefix: '!!' });
  ok(warns.some(w => w.includes('shellPrefix')));
});

it('validate flags out-of-range tts rate', () => {
  const warns = cfg.validate({ tts: { rate: 9999, voice: '' } });
  ok(warns.some(w => w.includes('tts.rate')));
});
