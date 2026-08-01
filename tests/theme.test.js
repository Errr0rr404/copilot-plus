'use strict';

const theme = require('../src/theme');
const { ok, eq, includes } = require('./_assert');

it('has dark, light, solarized, monokai, auto themes', () => {
  const names = theme.names();
  for (const n of ['dark', 'light', 'solarized', 'monokai', 'auto']) ok(names.includes(n));
});

it('falls back to dark on unknown theme', () => {
  theme.set('does-not-exist');
  const t = theme.get({ theme: 'does-not-exist' });
  ok(t);
  eq(typeof t.reset, 'string');
});

it('every theme defines every semantic role', () => {
  const roles = ['fg','dim','bold','reset','accent','success','warn','error','info','select_bg','border','quota_ok','quota_hi'];
  for (const name of theme.names()) {
    const t = theme.THEMES[name];
    for (const role of roles) ok(role in t, `${name}.${role} missing`);
  }
});
