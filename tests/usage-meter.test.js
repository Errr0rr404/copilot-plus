'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { eq, ok } = require('./_assert');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-plus-usage-'));
fs.mkdirSync(path.join(TMP, '.copilot'), { recursive: true });
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

delete require.cache[require.resolve('../src/history')];
delete require.cache[require.resolve('../src/usage-meter')];
const history = require('../src/history');
const usage = require('../src/usage-meter');

it('localStats counts today', () => {
  history.clear();
  history.append({ prompt: 'one', model: 'gpt' });
  history.append({ prompt: 'two', model: 'claude' });
  const s = usage.localStats({ days: 30 });
  eq(s.total, 2);
  eq(s.today, 2);
  ok(s.byModel.gpt >= 1);
});

it('shouldHandoff at threshold', () => {
  eq(usage.shouldHandoff({ premium: { used: 95, entitlement: 100 } }, 90), true);
  eq(usage.shouldHandoff({ premium: { used: 50, entitlement: 100 } }, 90), false);
  eq(usage.shouldHandoff({ premium: { unlimited: true, used: 0, entitlement: 0 } }, 90), false);
});

it('summary includes budget when set', () => {
  history.clear();
  history.append({ prompt: 'x' });
  const sum = usage.summary(null, { dailyBudget: 10 });
  eq(sum.budget.limit, 10);
  eq(sum.budget.used, 1);
  ok(usage.formatCli(sum).includes('Local prompt history'));
});

process.on('exit', () => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});
