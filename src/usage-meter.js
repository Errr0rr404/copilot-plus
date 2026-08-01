'use strict';

/**
 * usage-meter — local prompt analytics + daily budget helpers.
 *
 * Uses history.jsonl for counts; optional live quota object from copilot-api.
 */

const history = require('./history');

function _dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate local usage from history.
 * Returns { total, today, byDay, byModel, avgPerDay, daysActive }
 */
function localStats(opts = {}) {
  const days = opts.days || 30;
  const all = history.readAll();
  const cutoff = Date.now() - days * 86400000;
  const today = _dayKey();
  const byDay = {};
  const byModel = {};
  let total = 0;
  let todayCount = 0;

  for (const r of all) {
    const ts = r.ts ? Date.parse(r.ts) : 0;
    if (ts && ts < cutoff) continue;
    total++;
    const day = r.ts ? r.ts.slice(0, 10) : 'unknown';
    byDay[day] = (byDay[day] || 0) + 1;
    if (day === today) todayCount++;
    const model = r.model || 'unknown';
    byModel[model] = (byModel[model] || 0) + 1;
  }

  const dayKeys = Object.keys(byDay).filter(k => k !== 'unknown');
  const daysActive = dayKeys.length || 1;
  const avgPerDay = total / daysActive;

  return {
    total,
    today: todayCount,
    byDay,
    byModel,
    avgPerDay: Math.round(avgPerDay * 10) / 10,
    daysActive: dayKeys.length,
    windowDays: days,
  };
}

/**
 * Combine local stats with API quota.
 * quota: { premium: { used, entitlement, percent_remaining }, planName, resetDate }
 */
function summary(quota, opts = {}) {
  const local = localStats(opts);
  const dailyBudget = opts.dailyBudget || 0;
  let premium = null;
  if (quota && quota.premium) {
    const used = quota.premium.used || 0;
    const ent  = quota.premium.entitlement || 0;
    const pctUsed = ent > 0
      ? Math.min(100, Math.round((used / ent) * 1000) / 10)
      : (quota.premium.percent_remaining != null
        ? Math.round((100 - quota.premium.percent_remaining) * 10) / 10
        : null);
    premium = {
      used,
      entitlement: ent,
      pctUsed,
      planName: quota.planName || null,
      resetDate: quota.resetDate || null,
      unlimited: !!quota.premium.unlimited,
    };
  }

  let budget = null;
  if (dailyBudget > 0) {
    budget = {
      limit: dailyBudget,
      used: local.today,
      remaining: Math.max(0, dailyBudget - local.today),
      pctUsed: Math.min(100, Math.round((local.today / dailyBudget) * 1000) / 10),
    };
  }

  return { local, premium, budget };
}

/** True if handoff should fire given pct threshold. */
function shouldHandoff(quota, handoffAtPct = 90) {
  if (!quota || !quota.premium || quota.premium.unlimited) return false;
  const ent = quota.premium.entitlement || 0;
  if (ent <= 0) return false;
  const pct = (quota.premium.used / ent) * 100;
  return pct >= handoffAtPct;
}

function formatCli(sum) {
  const lines = [];
  lines.push('Local prompt history');
  lines.push(`  today:       ${sum.local.today}`);
  lines.push(`  last ${sum.local.windowDays}d:   ${sum.local.total} prompts (${sum.local.avgPerDay}/day avg)`);
  lines.push(`  active days: ${sum.local.daysActive}`);
  const models = Object.entries(sum.local.byModel).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (models.length) {
    lines.push('  by model:');
    for (const [m, n] of models) lines.push(`    ${m}: ${n}`);
  }
  if (sum.budget) {
    lines.push('Daily budget');
    lines.push(`  ${sum.budget.used}/${sum.budget.limit} (${sum.budget.pctUsed}%)`);
  }
  if (sum.premium) {
    lines.push('Premium quota (API)');
    if (sum.premium.unlimited) {
      lines.push(`  plan: ${sum.premium.planName || '?'} · unlimited`);
    } else if (sum.premium.entitlement > 0 && sum.premium.pctUsed != null) {
      lines.push(`  ${sum.premium.used}/${sum.premium.entitlement} used (${sum.premium.pctUsed}%)`);
      if (sum.premium.resetDate) lines.push(`  resets: ${sum.premium.resetDate}`);
    } else {
      lines.push(`  used: ${sum.premium.used}${sum.premium.resetDate ? ` · resets ${sum.premium.resetDate}` : ''}`);
    }
  } else {
    lines.push('Premium quota: unavailable (no GitHub token)');
  }
  return lines.join('\n');
}

module.exports = {
  localStats,
  summary,
  shouldHandoff,
  formatCli,
  _dayKey,
};
