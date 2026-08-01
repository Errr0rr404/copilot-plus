'use strict';

/**
 * context — smart auto-context injection.
 *
 * Gathers useful situational context (git diff, recent files, last test
 * failure, current branch) and formats it as a compact text block ready to
 * be prepended to the user's next prompt.
 *
 * Triggered via Ctrl+G in the wrapper, or programmatically by hooks/plugins.
 * Everything is best-effort — missing git, no repo, no tests → returns "".
 */

const { spawnSync, execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const IS_WIN = os.platform() === 'win32';
const MAX_DIFF_LINES = 200;

function _run(bin, args, opts = {}) {
  try {
    const r = spawnSync(bin, args, {
      encoding: 'utf8', timeout: opts.timeout || 3000,
      cwd: opts.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return r.status === 0 ? (r.stdout || '').trimEnd() : '';
  } catch {
    return '';
  }
}

/** True if cwd is inside a git repo. */
function inGitRepo(cwd = process.cwd()) {
  return _run('git', ['rev-parse', '--is-inside-work-tree'], { cwd }) === 'true';
}

function currentBranch(cwd = process.cwd()) {
  return _run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
}

/**
 * Returns the most useful diff:
 *   1. If anything is staged → `git diff --staged`
 *   2. Else if anything is dirty → `git diff`
 *   3. Else → diff against upstream / main
 * Trimmed to MAX_DIFF_LINES.
 */
function gitDiff(cwd = process.cwd()) {
  if (!inGitRepo(cwd)) return '';
  let diff = _run('git', ['diff', '--staged'], { cwd, timeout: 5000 });
  if (!diff) diff = _run('git', ['diff'], { cwd, timeout: 5000 });
  if (!diff) {
    const base = _run('git', ['rev-parse', '--abbrev-ref', '@{u}'], { cwd })
              || _run('git', ['rev-parse', '--verify', 'main'], { cwd }) && 'main'
              || _run('git', ['rev-parse', '--verify', 'master'], { cwd }) && 'master';
    if (base) diff = _run('git', ['diff', `${base}...HEAD`], { cwd, timeout: 5000 });
  }
  if (!diff) return '';
  const lines = diff.split('\n');
  if (lines.length > MAX_DIFF_LINES) {
    return lines.slice(0, MAX_DIFF_LINES).join('\n')
      + `\n…(${lines.length - MAX_DIFF_LINES} more lines truncated)`;
  }
  return diff;
}

/**
 * Return the N most-recently modified tracked files in the repo,
 * skipping binaries and lockfiles. Best-effort, no sorting fallback if git
 * isn't available.
 */
function recentFiles(cwd = process.cwd(), n = 6) {
  const out = _run('git', ['ls-files', '-z'], { cwd, timeout: 5000 });
  if (!out) return [];
  const SKIP_RE = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|\.DS_Store|node_modules\/)/;
  const files = out.split('\0')
    .filter(Boolean)
    .filter(f => !SKIP_RE.test(f));

  const stats = [];
  for (const f of files) {
    try {
      const full = path.join(cwd, f);
      const st = fs.statSync(full);
      if (st.size > 256 * 1024) continue; // skip giant files
      stats.push({ f, mtime: st.mtimeMs });
    } catch { /* gone */ }
  }
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats.slice(0, n).map(s => s.f);
}

/** git status --short (with branch line). */
function gitStatus(cwd = process.cwd()) {
  if (!inGitRepo(cwd)) return '';
  return _run('git', ['-c', 'color.status=never', 'status', '--short', '--branch'], { cwd });
}

/**
 * Heuristic — pick which contexts apply to a given prompt.
 * Returns a sorted list of context kinds the wrapper should gather.
 */
function suggestKinds(promptText = '') {
  const t = promptText.toLowerCase();
  const kinds = new Set();
  if (/\b(diff|change|commit|review|pr|pull request)\b/.test(t)) kinds.add('diff');
  if (/\b(test|spec|failing|coverage)\b/.test(t))                 kinds.add('status');
  if (/\b(file|module|class|function|method)\b/.test(t))          kinds.add('recent');
  if (kinds.size === 0) { kinds.add('status'); kinds.add('diff'); }
  return [...kinds];
}

/**
 * Build a full context block for the prompt.
 * `kinds` is an array of strings: 'diff' | 'status' | 'recent' | 'branch'.
 */
function build(kinds, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  if (!inGitRepo(cwd)) {
    return { text: '', summary: 'not in a git repo' };
  }
  const parts = [];
  const summary = [];

  if (kinds.includes('branch')) {
    const b = currentBranch(cwd);
    if (b) { parts.push(`Current branch: ${b}`); summary.push(`branch ${b}`); }
  }
  if (kinds.includes('status')) {
    const s = gitStatus(cwd);
    if (s) { parts.push(`Git status:\n\`\`\`\n${s}\n\`\`\``); summary.push('status'); }
  }
  if (kinds.includes('diff')) {
    const d = gitDiff(cwd);
    if (d) {
      parts.push(`Diff:\n\`\`\`diff\n${d}\n\`\`\``);
      summary.push(`${d.split('\n').length} diff lines`);
    }
  }
  if (kinds.includes('recent')) {
    const r = recentFiles(cwd);
    if (r.length) {
      parts.push(`Recently modified files:\n${r.map(f => `- @${f}`).join('\n')}`);
      summary.push(`${r.length} recent files`);
    }
  }
  if (!parts.length) return { text: '', summary: 'no context found' };
  return {
    text: `\n[context]\n${parts.join('\n\n')}\n[/context]\n`,
    summary: summary.join(' · '),
  };
}

module.exports = { build, gitDiff, gitStatus, recentFiles, currentBranch, suggestKinds, inGitRepo };
