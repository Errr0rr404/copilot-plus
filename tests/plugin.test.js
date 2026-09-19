'use strict';

const { eq } = require('./_assert');
const { PluginManager } = require('../src/plugin');

it('emit ignores null/undefined plugin returns', () => {
  const pm = new PluginManager();
  const payload = { text: 'hi', cancel: false };
  pm._plugins = [
    { name: 'nully', mod: { beforeSend: () => null } },
    { name: 'undef', mod: { beforeSend: () => undefined } },
  ];
  const out = pm.emit('beforeSend', payload);
  eq(out, payload);
  eq(out.text, 'hi');
});

it('emit adopts object returns', () => {
  const pm = new PluginManager();
  pm._plugins = [
    { name: 'rewriter', mod: { beforeSend: () => ({ text: 'safe', cancel: false }) } },
  ];
  const out = pm.emit('beforeSend', { text: 'secret', cancel: false });
  eq(out.text, 'safe');
});
