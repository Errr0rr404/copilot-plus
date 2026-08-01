'use strict';

/**
 * prompt-stash — stack of parked draft prompts.
 *
 * Storage: ~/.copilot/prompt-stash.json
 * Used when the user is mid-prompt and needs to run /model, /diff, etc.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const STASH_PATH = path.join(os.homedir(), '.copilot', 'prompt-stash.json');
const MAX_STACK  = 20;

function _read() {
  try {
    const data = JSON.parse(fs.readFileSync(STASH_PATH, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function _write(items) {
  try {
    fs.mkdirSync(path.dirname(STASH_PATH), { recursive: true });
    fs.writeFileSync(STASH_PATH, JSON.stringify({ items: items.slice(0, MAX_STACK) }, null, 2));
  } catch {}
}

/** Push a draft. Returns new stack size, or 0 if empty text. */
function push(text, meta = {}) {
  const t = String(text || '').trim();
  if (!t) return 0;
  const items = _read();
  items.unshift({
    text: t,
    ts: new Date().toISOString(),
    cwd: meta.cwd || process.cwd(),
  });
  _write(items);
  return items.length;
}

/** Pop newest draft. Returns { text, ts, cwd } or null. */
function pop() {
  const items = _read();
  if (!items.length) return null;
  const top = items.shift();
  _write(items);
  return top;
}

/** Peek without removing. */
function peek() {
  const items = _read();
  return items[0] || null;
}

function list() {
  return _read();
}

function clear() {
  _write([]);
}

function size() {
  return _read().length;
}

module.exports = { push, pop, peek, list, clear, size, STASH_PATH, MAX_STACK };
