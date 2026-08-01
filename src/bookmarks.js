'use strict';

/**
 * bookmarks — pinned AI responses worth keeping.
 *
 * Storage: ~/.copilot/bookmarks.json  (small, JSON object)
 *
 * Shape:
 *   {
 *     "<id>": { id, ts, title, body, tags, cwd, model }
 *   }
 *
 * `add(title, body, tags?)`   → returns the new id
 * `remove(id)`                 → boolean
 * `list({ tag, query })`       → newest-first filtered list
 * `setTags(id, tags)`          → boolean
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const BOOKMARKS_PATH = path.join(os.homedir(), '.copilot', 'bookmarks.json');

function _load() {
  try { return JSON.parse(fs.readFileSync(BOOKMARKS_PATH, 'utf8')); } catch { return {}; }
}

function _save(data) {
  try { fs.mkdirSync(path.dirname(BOOKMARKS_PATH), { recursive: true }); } catch {}
  fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify(data, null, 2));
}

function _id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Append a new bookmark and return its id.
 * `title` is auto-derived from `body` if not provided.
 */
function add({ title, body, tags = [], cwd, model } = {}) {
  if (!body || !body.trim()) return null;
  const data = _load();
  const id = _id();
  const inferredTitle = title || _inferTitle(body);
  data[id] = {
    id, title: inferredTitle, body, tags: Array.isArray(tags) ? tags : [],
    cwd: cwd || process.cwd(), model: model || '',
    ts: new Date().toISOString(),
  };
  _save(data);
  return id;
}

function remove(id) {
  const data = _load();
  if (!data[id]) return false;
  delete data[id];
  _save(data);
  return true;
}

function setTags(id, tags) {
  const data = _load();
  if (!data[id]) return false;
  data[id].tags = Array.isArray(tags) ? tags : [];
  _save(data);
  return true;
}

/**
 * List bookmarks, newest first.
 * @param {object} [opts]
 * @param {string} [opts.tag]   — filter to a specific tag
 * @param {string} [opts.query] — substring filter on title + body + tags
 */
function list(opts = {}) {
  const data = _load();
  let items = Object.values(data);
  if (opts.tag) items = items.filter(b => b.tags && b.tags.includes(opts.tag));
  if (opts.query) {
    const q = opts.query.toLowerCase();
    items = items.filter(b =>
      (b.title || '').toLowerCase().includes(q)
      || (b.body  || '').toLowerCase().includes(q)
      || (b.tags  || []).some(t => t.toLowerCase().includes(q))
    );
  }
  return items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
}

function get(id) {
  const data = _load();
  return data[id] || null;
}

/** Distinct tag list with counts. */
function tagCounts() {
  const counts = {};
  for (const b of Object.values(_load())) {
    for (const t of (b.tags || [])) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function _inferTitle(body) {
  const first = String(body).split('\n').map(l => l.trim()).find(Boolean) || 'bookmark';
  // Strip markdown headers / list markers for a clean title
  const cleaned = first.replace(/^#+\s+/, '').replace(/^[-*+>]\s+/, '');
  return cleaned.length > 60 ? cleaned.slice(0, 57) + '…' : cleaned;
}

module.exports = { add, remove, setTags, list, get, tagCounts, BOOKMARKS_PATH };
