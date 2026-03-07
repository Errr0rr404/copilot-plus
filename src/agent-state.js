'use strict';

/**
 * agent-state — lightweight file-based IPC for the copilot+ monitor.
 *
 * Each running copilot+ wrapper writes its live state to:
 *   ~/.copilot/agents/<PID>.json
 *
 * copilot+ --monitor reads all files in that directory every polling cycle,
 * checks whether each PID is still alive, and discards stale files.
 *
 * Additionally, scanNativeProcesses() detects bare `copilot` / `gh copilot`
 * CLI processes that are not managed by copilot+ (no state file).
 */

const fs            = require('fs');
const os            = require('os');
const path          = require('path');
const { execSync }  = require('child_process');

const AGENTS_DIR  = path.join(os.homedir(), '.copilot', 'agents');
const STALE_MS    = 5 * 60 * 1000; // remove dead-process files after 5 min

function _filePath(pid) {
  return path.join(AGENTS_DIR, `${pid}.json`);
}

/** Returns true if the process with the given PID is still running. */
function _isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write (or update) the state file for the current process.
 * Merges `patch` into whatever is already on disk.
 */
function writeState(pid, patch) {
  try {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(_filePath(pid), 'utf8')); } catch {}
    const next = Object.assign({}, existing, patch, { pid, updatedAt: new Date().toISOString() });
    fs.writeFileSync(_filePath(pid), JSON.stringify(next));
  } catch {}
}

/**
 * Read all agent state files, remove stale ones (dead process + old file),
 * and return a sorted array:  attention → recording/transcribing → thinking → idle → done.
 */
function readAll() {
  try { fs.mkdirSync(AGENTS_DIR, { recursive: true }); } catch {}

  let files;
  try { files = fs.readdirSync(AGENTS_DIR).filter(f => /^\d+\.json$/.test(f)); }
  catch { return []; }

  const agents    = [];
  const knownPids = new Set();

  for (const file of files) {
    const fp = path.join(AGENTS_DIR, file);
    let state;
    try { state = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }

    const pid = parseInt(file, 10);
    if (!state.pid) state.pid = pid;
    knownPids.add(pid);

    if (state.status !== 'done' && !_isAlive(pid)) {
      // Process is gone — mark done or prune stale files
      const age = Date.now() - new Date(state.updatedAt || 0).getTime();
      if (age > STALE_MS) {
        try { fs.unlinkSync(fp); } catch {}
        continue;
      }
      state.status = 'done';
      state.endedAt = state.endedAt || state.updatedAt;
    }

    agents.push(state);
  }

  // Also include bare copilot / gh copilot processes not managed by copilot+
  const native = scanNativeProcesses(knownPids);
  agents.push(...native);

  const ORDER = { recording: 0, transcribing: 1, idle: 2, done: 3 };
  return agents.sort((a, b) => (ORDER[a.status] ?? 2) - (ORDER[b.status] ?? 2));
}

/** Remove the state file for this process (called on clean exit). */
function clearState(pid) {
  try { fs.unlinkSync(_filePath(pid)); } catch {}
}

// ── Native process scanning ───────────────────────────────────────────────────

/**
 * Parse `etime` column from `ps` (format: [[DD-]HH:]MM:SS) → seconds elapsed.
 */
function _parseEtime(s) {
  if (!s) return 0;
  s = s.trim();
  const dashIdx = s.indexOf('-');
  let days = 0;
  let timePart = s;
  if (dashIdx !== -1) {
    days = parseInt(s.slice(0, dashIdx), 10);
    timePart = s.slice(dashIdx + 1);
  }
  const parts = timePart.split(':').map(Number);
  let secs = 0;
  if (parts.length === 3)      secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
  else                         secs = parts[0];
  return days * 86400 + secs;
}

/**
 * Batch-fetch working directories for a list of PIDs via lsof.
 * Returns { [pid]: cwdPath }
 */
function _batchCwds(pids) {
  if (!pids.length) return {};
  try {
    const pidList = pids.join(',');
    const out = execSync(`lsof -p ${pidList} 2>/dev/null`, {
      encoding: 'utf8', timeout: 3000,
    });
    const cwdMap = {};
    for (const line of out.split('\n')) {
      if (!line.includes(' cwd ')) continue;
      const cols = line.trim().split(/\s+/);
      const pid  = parseInt(cols[1], 10);
      if (!isNaN(pid)) cwdMap[pid] = cols[cols.length - 1];
    }
    return cwdMap;
  } catch {
    return {};
  }
}

/**
 * Scan running processes for bare `copilot` or `gh copilot` sessions
 * that are NOT already tracked via a state file.
 *
 * Returns synthetic agent objects marked with `_native: true`.
 */
function scanNativeProcesses(knownPids) {
  const selfPid = process.pid;
  const results = [];

  let psOut;
  try {
    psOut = execSync('ps -eo pid,etime,args 2>/dev/null', {
      encoding: 'utf8', timeout: 3000,
    });
  } catch {
    return results;
  }

  const targetPids = [];
  const processMap = {};

  for (const line of psOut.split('\n').slice(1)) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) continue;

    const pid   = parseInt(m[1], 10);
    const etime = m[2];
    const args  = m[3].trim();

    if (pid === selfPid)         continue;  // monitor itself
    if (knownPids.has(pid))      continue;  // already tracked via state file
    if (args.includes('--monitor')) continue;

    // Match bare `copilot` binary — exact name or /path/to/copilot, NOT copilot+
    const isBare = /(?:^|\/)(copilot)(?:\s|$)/.test(args) &&
                   !args.includes('copilot+') &&
                   !args.includes('copilot-plus');
    // Match `gh copilot ...`
    const isGh   = /^gh\s+copilot/.test(args);

    if (!isBare && !isGh) continue;

    const elapsed   = _parseEtime(etime);
    const startedAt = elapsed > 0
      ? new Date(Date.now() - elapsed * 1000).toISOString()
      : null;

    targetPids.push(pid);
    processMap[pid] = { pid, startedAt, args, isGh };
  }

  if (!targetPids.length) return results;

  const cwdMap = _batchCwds(targetPids);

  for (const pid of targetPids) {
    const p = processMap[pid];
    results.push({
      pid,
      cwd:        cwdMap[pid] || null,
      startedAt:  p.startedAt,
      model:      null,
      status:     'idle',
      tokensIn:   0,
      tokensOut:  0,
      exchanges:  0,
      updatedAt:  new Date().toISOString(),
      _native:    true,
      _type:      p.isGh ? 'gh copilot' : 'copilot CLI',
    });
  }

  return results;
}

module.exports = { writeState, readAll, clearState, scanNativeProcesses, AGENTS_DIR };
