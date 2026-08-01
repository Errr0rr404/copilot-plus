'use strict';

const { eq, ok } = require('./_assert');
const notify = require('../src/notify-rules');

it('matchRules filters by type', () => {
  const rules = [
    { when: 'session_idle', channels: ['os'] },
    { when: 'quota_above', pct: 80, channels: ['os'] },
  ];
  eq(notify.matchRules(rules, { type: 'session_idle' }).length, 1);
  eq(notify.matchRules(rules, { type: 'quota_above', quotaPct: 50 }).length, 0);
  eq(notify.matchRules(rules, { type: 'quota_above', quotaPct: 90 }).length, 1);
});

it('waiting_input respects afterMs', () => {
  const rules = [{ when: 'waiting_input', afterMs: 1000, channels: ['bell'] }];
  eq(notify.matchRules(rules, { type: 'waiting_input', waitedMs: 500 }).length, 0);
  eq(notify.matchRules(rules, { type: 'waiting_input', waitedMs: 1500 }).length, 1);
});

it('fire invokes channel handlers', async () => {
  const calls = [];
  const res = await notify.fire(
    [{ when: 'session_idle', channels: ['os', 'bell'] }],
    { type: 'session_idle', title: 't', body: 'b' },
    {
      os: (title, body) => calls.push(['os', title, body]),
      bell: () => calls.push(['bell']),
    }
  );
  eq(res.fired, 2);
  ok(calls.some(c => c[0] === 'os'));
  ok(calls.some(c => c[0] === 'bell'));
});

it('cooldown blocks rapid repeats', () => {
  const cd = notify.createCooldown(60_000);
  ok(cd.allow('a'));
  eq(cd.allow('a'), false);
  ok(cd.allow('b'));
});
