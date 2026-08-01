'use strict';

/**
 * worktree — create an isolated git worktree for parallel agent sessions.
 *
 * Layout: <repo>/.copilot-worktrees/<name>  (or sibling when preferred)
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

function isGitRepo(cwd = process.cwd()) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    });
    return true;
  } catch {
    return false;
  }
}

function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
  } catch {
    return null;
  }
}

function currentBranch(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
  } catch {
    return 'HEAD';
  }
}

/**
 * Create a worktree.
 * opts: { name, branch, base, cwd }
 * Returns { ok, path, branch, error? }
 */
function create(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const root = repoRoot(cwd);
  if (!root) return { ok: false, error: 'not a git repository' };

  const name = (opts.name || `agent-${Date.now().toString(36)}`).replace(/[^\w.-]+/g, '-');
  const baseBranch = opts.base || currentBranch(root);
  const newBranch = opts.branch || `copilot+/${name}`;
  const wtParent = path.join(root, '.copilot-worktrees');
  const wtPath = path.join(wtParent, name);

  if (fs.existsSync(wtPath)) {
    return { ok: true, path: wtPath, branch: newBranch, existed: true };
  }

  try {
    fs.mkdirSync(wtParent, { recursive: true });
    // Ensure base is a valid ref
    execFileSync('git', ['rev-parse', '--verify', baseBranch], {
      cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000,
    });
    // Create branch from base if needed, then worktree
    try {
      execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${newBranch}`], {
        cwd: root, stdio: 'ignore', timeout: 2000,
      });
      // branch exists
      execFileSync('git', ['worktree', 'add', wtPath, newBranch], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
      });
    } catch {
      execFileSync('git', ['worktree', 'add', '-b', newBranch, wtPath, baseBranch], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
      });
    }
    return { ok: true, path: wtPath, branch: newBranch, existed: false };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || String(err)).toString().trim() };
  }
}

function list(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  if (!root) return [];
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    const items = [];
    let cur = {};
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (cur.path) items.push(cur);
        cur = { path: line.slice(9) };
      } else if (line.startsWith('branch ')) {
        cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
      } else if (line.startsWith('HEAD ')) {
        cur.head = line.slice(5);
      } else if (line === '') {
        if (cur.path) items.push(cur);
        cur = {};
      }
    }
    if (cur.path) items.push(cur);
    return items;
  } catch {
    return [];
  }
}

/**
 * Spawn a new copilot+ (or custom cmd) in the worktree directory.
 * Non-blocking; returns ChildProcess or null.
 */
function launch(wtPath, opts = {}) {
  const bin = opts.bin || process.argv[1] || 'copilot+';
  const args = opts.args || [];
  try {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: wtPath,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    return child;
  } catch {
    return null;
  }
}

module.exports = { isGitRepo, repoRoot, currentBranch, create, list, launch };
