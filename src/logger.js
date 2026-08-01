'use strict';

/**
 * logger — leveled logger that writes to ~/.copilot/copilot-plus.log
 *
 * Levels: 'debug' (10) < 'info' (20) < 'warn' (30) < 'error' (40)
 * Default level is 'warn'; raise with COPILOT_PLUS_LOG=debug.
 *
 * The file rotates when it exceeds MAX_BYTES so a long-running wrapper never
 * fills the disk. We keep one rotated file (.log.1) for crash analysis.
 *
 * `forUser()` returns a friendly single-line message suitable for the
 * notification system — strips paths, code frames, and trims to N chars.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const LOG_PATH   = path.join(os.homedir(), '.copilot', 'copilot-plus.log');
const ROT_PATH   = LOG_PATH + '.1';
const MAX_BYTES  = 1 * 1024 * 1024; // 1 MB

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function _envLevel() {
  const e = String(process.env.COPILOT_PLUS_LOG || '').toLowerCase();
  return LEVELS[e] || LEVELS.warn;
}

let _level = _envLevel();
let _dirOk = false;

function _ensureDir() {
  if (_dirOk) return;
  try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); _dirOk = true; } catch {}
}

function _rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_PATH);
    if (st.size > MAX_BYTES) {
      try { fs.renameSync(LOG_PATH, ROT_PATH); } catch {}
    }
  } catch {}
}

function _write(level, args) {
  if (LEVELS[level] < _level) return;
  _ensureDir();
  _rotateIfNeeded();
  const line = `${new Date().toISOString()} [${level}] ${args.map(_fmt).join(' ')}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
}

function _fmt(v) {
  if (v instanceof Error) return v.stack || v.message;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function setLevel(level) {
  if (LEVELS[level]) _level = LEVELS[level];
}

function debug(...args) { _write('debug', args); }
function info(...args)  { _write('info',  args); }
function warn(...args)  { _write('warn',  args); }
function error(...args) { _write('error', args); }

/**
 * Convert an Error or message into a short user-friendly line.
 * Strips home directory, collapses whitespace, and trims to maxLen.
 */
function forUser(err, maxLen = 80) {
  let msg = '';
  if (err instanceof Error) msg = err.message || String(err);
  else msg = String(err == null ? '' : err);
  msg = msg.replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~');
  msg = msg.replace(/\s+/g, ' ').trim();
  if (msg.length > maxLen) msg = msg.slice(0, maxLen - 1) + '…';
  return msg;
}

module.exports = { debug, info, warn, error, forUser, setLevel, LOG_PATH };
