'use strict';

/**
 * copilot-api — lightweight read-only client for the GitHub Copilot user API.
 *
 * Used by copilot+ --monitor to display account-level quota information
 * (premium interactions used/remaining) in the dashboard header.
 *
 * Auth token is read from ~/.config/github-copilot/apps.json, which is
 * written by the copilot CLI on first login — no extra credentials needed.
 */

const fs    = require('fs');
const https = require('https');
const os    = require('os');
const path  = require('path');

const APPS_FILE = path.join(os.homedir(), '.config', 'github-copilot', 'apps.json');
const CACHE_MS  = 5 * 60 * 1000; // refresh quota every 5 minutes

// ── Auth token ────────────────────────────────────────────────────────────────
function _readOAuthToken() {
  try {
    const data = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
    for (const v of Object.values(data)) {
      if (v && v.oauth_token) return v.oauth_token;
    }
  } catch {}
  return null;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function _get(url, headers) {
  return new Promise((resolve) => {
    const u   = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers,
      timeout:  5000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end',  ()      => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Quota cache ───────────────────────────────────────────────────────────────
let _cache     = null;
let _cacheTime = 0;

/**
 * Fetch account-level Copilot quota from the GitHub API.
 * Returns a quota object or null if unavailable / not authenticated.
 *
 * Result shape:
 * {
 *   login:     string,
 *   plan:      string,              // e.g. "individual_pro"
 *   resetDate: string,              // "2026-04-01"
 *   premium: {
 *     entitlement: number,          // monthly total
 *     used:        number,
 *     remaining:   number,
 *     unlimited:   boolean,
 *   },
 * }
 */
async function fetchQuota() {
  if (_cache && Date.now() - _cacheTime < CACHE_MS) return _cache;

  const token = _readOAuthToken();
  if (!token) return null;

  const data = await _get('https://api.github.com/copilot_internal/user', {
    'Authorization':        `token ${token}`,
    'editor-version':       'vscode/1.85.0',
    'editor-plugin-version': 'copilot/1.150.0',
    'User-Agent':           'copilot-plus-monitor',
    'Accept':               'application/json',
  });

  if (!data || !data.quota_snapshots) return null;

  const prem = data.quota_snapshots.premium_interactions || {};
  const result = {
    login:     data.login,
    plan:      data.copilot_plan || 'unknown',
    resetDate: data.quota_reset_date || null,
    premium: {
      entitlement: prem.entitlement || 0,
      remaining:   typeof prem.remaining === 'number' ? prem.remaining : null,
      used:        typeof prem.remaining === 'number'
                     ? (prem.entitlement || 0) - prem.remaining
                     : null,
      unlimited:   prem.unlimited === true,
    },
  };

  _cache     = result;
  _cacheTime = Date.now();
  return result;
}

/** Invalidate the quota cache (e.g. after a model switch). */
function invalidateQuotaCache() {
  _cache     = null;
  _cacheTime = 0;
}

module.exports = { fetchQuota, invalidateQuotaCache };
