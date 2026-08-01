'use strict';

/**
 * notify-rules — evaluate configurable notification rules and fire channels.
 *
 * Rule shape:
 *   { when: 'session_idle' | 'waiting_input' | 'quota_above' | 'session_done',
 *     afterMs?: number, pct?: number,
 *     channels?: ['os','bell','webhook'] }
 *
 * Channel handlers are injected by the wrapper so this stays pure/testable.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const DEFAULT_RULES = [
  { when: 'session_idle', channels: ['os'] },
  { when: 'waiting_input', afterMs: 60000, channels: ['os', 'bell'] },
  { when: 'quota_above', pct: 80, channels: ['os'] },
];

/**
 * Given rules + an event, return the list of matching rules.
 * event: { type, waitedMs?, quotaPct?, title?, body? }
 */
function matchRules(rules, event) {
  const list = Array.isArray(rules) && rules.length ? rules : DEFAULT_RULES;
  return list.filter(r => {
    if (!r || r.when !== event.type) return false;
    if (r.when === 'waiting_input') {
      const need = typeof r.afterMs === 'number' ? r.afterMs : 60000;
      return (event.waitedMs || 0) >= need;
    }
    if (r.when === 'quota_above') {
      const thr = typeof r.pct === 'number' ? r.pct : 80;
      return (event.quotaPct || 0) >= thr;
    }
    return true;
  });
}

/**
 * Fire channels for matching rules.
 * handlers: { os(title, body), bell(), webhook(payload) }
 */
async function fire(rules, event, handlers = {}, opts = {}) {
  const matches = matchRules(rules, event);
  if (!matches.length) return { fired: 0, matches: [] };

  const title = event.title || 'copilot+';
  const body  = event.body  || event.type;
  const channels = new Set();
  for (const r of matches) {
    for (const c of (r.channels || ['os'])) channels.add(c);
  }

  let fired = 0;
  for (const ch of channels) {
    try {
      if (ch === 'os' && handlers.os) {
        await Promise.resolve(handlers.os(title, body));
        fired++;
      } else if (ch === 'bell' && handlers.bell) {
        await Promise.resolve(handlers.bell());
        fired++;
      } else if (ch === 'webhook' && handlers.webhook) {
        await Promise.resolve(handlers.webhook({
          title, body, type: event.type,
          waitedMs: event.waitedMs,
          quotaPct: event.quotaPct,
          ts: new Date().toISOString(),
          ...event.extra,
        }));
        fired++;
      } else if (ch === 'webhook' && opts.webhookUrl) {
        await postWebhook(opts.webhookUrl, {
          title, body, type: event.type,
          waitedMs: event.waitedMs,
          quotaPct: event.quotaPct,
          ts: new Date().toISOString(),
        });
        fired++;
      }
    } catch {
      // swallow channel errors
    }
  }
  return { fired, matches };
}

function postWebhook(urlStr, payload) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch { return resolve(false); }
    const lib = u.protocol === 'http:' ? http : https;
    const data = JSON.stringify(payload);
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'copilot-plus',
      },
      timeout: 5000,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(data);
    req.end();
  });
}

/**
 * Cooldown tracker so the same rule doesn't spam.
 * key = `${type}:${extra}` → last fire ts
 */
function createCooldown(ms = 60000) {
  const last = new Map();
  return {
    allow(key) {
      const now = Date.now();
      const prev = last.get(key) || 0;
      if (now - prev < ms) return false;
      last.set(key, now);
      return true;
    },
    reset(key) { last.delete(key); },
  };
}

module.exports = {
  DEFAULT_RULES,
  matchRules,
  fire,
  postWebhook,
  createCooldown,
};
