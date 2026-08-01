'use strict';

/**
 * history — append-only JSONL log of every prompt the user sends.
 *
 * Storage: ~/.copilot/history.jsonl   (one JSON object per line)
 * Fields:  { ts, pid, cwd, model, prompt, response?, tokensIn?, tokensOut? }
 *
 * The wrapper appends a record on every Enter; responses are filled in
 * opportunistically when the PTY output buffer settles (best-effort).
 *
 * Lookup helpers:
 *   append(record)              — non-blocking, swallows errors
 *   search(query, opts)         — substring + simple AND tokenization
 *   readRecent(limit)           — newest N entries
 *   clear()                     — wipe the log (used by --history --clear)
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const HISTORY_PATH = path.join(os.homedir(), '.copilot', 'history.jsonl');
const MAX_BYTES    = 50 * 1024 * 1024; // 50 MB hard cap

function _ensureDir() {
  try { fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true }); } catch {}
}

function append(record) {
  if (!record || typeof record !== 'object') return;
  if (!record.prompt) return;
  _ensureDir();
  // Guard against runaway disk usage — rotate to .1 once we exceed cap.
  try {
    const st = fs.statSync(HISTORY_PATH);
    if (st.size > MAX_BYTES) {
      try { fs.renameSync(HISTORY_PATH, HISTORY_PATH + '.1'); } catch {}
    }
  } catch {}
  const entry = Object.assign({ ts: new Date().toISOString() }, record);
  try {
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  } catch {}
}

/**
 * Read the entire history file as an array of records (newest last).
 * Skips malformed lines silently.
 */
function readAll() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  const out = [];
  for (const line of fs.readFileSync(HISTORY_PATH, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

function readRecent(limit = 50) {
  const all = readAll();
  return all.slice(-limit).reverse();
}

/**
 * Token-AND search across prompt + response.
 * Tokenises the query on whitespace, lowercases everything, and returns
 * records that contain every token (substring match).
 */
function search(query, opts = {}) {
  const limit = opts.limit || 50;
  const q = String(query || '').toLowerCase().trim();
  const all = readAll();
  if (!q) return all.slice(-limit).reverse();
  const toks = q.split(/\s+/);
  const hits = [];
  for (let i = all.length - 1; i >= 0 && hits.length < limit; i--) {
    const r = all[i];
    const hay = ((r.prompt || '') + ' ' + (r.response || '')).toLowerCase();
    if (toks.every(t => hay.includes(t))) hits.push(r);
  }
  return hits;
}

function clear() {
  try { fs.unlinkSync(HISTORY_PATH); } catch {}
  try { fs.unlinkSync(HISTORY_PATH + '.1'); } catch {}
}

/** Stats — total count, byte size, oldest/newest timestamps. */
function stats() {
  try {
    const st = fs.statSync(HISTORY_PATH);
    const all = readAll();
    return {
      count:   all.length,
      bytes:   st.size,
      oldest:  all[0] ? all[0].ts : null,
      newest:  all[all.length - 1] ? all[all.length - 1].ts : null,
    };
  } catch {
    return { count: 0, bytes: 0, oldest: null, newest: null };
  }
}

module.exports = { append, search, readAll, readRecent, clear, stats, HISTORY_PATH };
