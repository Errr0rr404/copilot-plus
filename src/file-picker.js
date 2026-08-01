'use strict';

/**
 * file-picker — list project files for @path injection.
 *
 * Prefers `git ls-files` when in a repo; falls back to a shallow walk.
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.next', '.cache', 'vendor', '__pycache__', '.venv', 'venv',
  'target', '.turbo', '.idea',
]);

const MAX_FILES = 5000;

function listGitFiles(cwd = process.cwd()) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean).slice(0, MAX_FILES);
  } catch {
    return null;
  }
}

function walkFiles(cwd = process.cwd(), maxDepth = 6) {
  const out = [];
  function walk(dir, depth) {
    if (out.length >= MAX_FILES || depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (out.length >= MAX_FILES) return;
      const name = ent.name;
      if (name.startsWith('.') && name !== '.env.example') continue;
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(name)) continue;
        walk(path.join(dir, name), depth + 1);
      } else if (ent.isFile()) {
        out.push(path.relative(cwd, path.join(dir, name)));
      }
    }
  }
  walk(cwd, 0);
  return out;
}

/** Return relative file paths under cwd. */
function listFiles(cwd = process.cwd()) {
  return listGitFiles(cwd) || walkFiles(cwd);
}

/**
 * Simple fuzzy score: all query chars must appear in order.
 * Higher = better. Returns -1 if no match.
 */
function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase();
  const t = String(text || '').toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      consecutive = (last === i - 1) ? consecutive + 1 : 1;
      score += 1 + consecutive * 3;
      if (i === 0 || t[i - 1] === '/' || t[i - 1] === '-' || t[i - 1] === '_') score += 8;
      last = i;
      qi++;
    }
  }
  if (qi < q.length) return -1;
  // prefer shorter paths / basename hits
  score += Math.max(0, 40 - t.length);
  const base = path.basename(t);
  if (base.startsWith(q)) score += 20;
  return score;
}

/** Rank files by fuzzy query; return top N with absolute paths. */
function search(query, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const limit = opts.limit || 30;
  const files = opts.files || listFiles(cwd);
  const q = String(query || '').trim();
  const scored = [];
  for (const rel of files) {
    const s = fuzzyScore(q, rel);
    if (s < 0) continue;
    scored.push({ rel, abs: path.resolve(cwd, rel), score: s });
  }
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  return scored.slice(0, limit);
}

module.exports = { listFiles, listGitFiles, walkFiles, fuzzyScore, search, IGNORE_DIRS, MAX_FILES };
