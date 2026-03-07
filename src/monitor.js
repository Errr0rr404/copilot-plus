'use strict';

/**
 * AgentMonitor — full-screen TUI dashboard for copilot+ --monitor.
 *
 * Reads ~/.copilot/agents/<PID>.json files every REFRESH_MS milliseconds,
 * computes display status from timestamps, and renders a live card view.
 * Press q / Q / Ctrl+C / Esc to exit.
 */

const agentState = require('./agent-state');
const { fetchQuota } = require('./copilot-api');
const os = require('os');

const REFRESH_MS  = 1500;
const QUOTA_MS    = 5 * 60 * 1000; // refresh quota every 5 min
const HOME        = os.homedir();

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const E      = '\x1b';
const R      = `${E}[0m`;
const BOLD   = `${E}[1m`;
const DIM    = `${E}[2m`;
const GREEN  = `${E}[32m`;
const YELLOW = `${E}[33m`;
const BLUE   = `${E}[34m`;
const CYAN   = `${E}[36m`;

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '');
}

/** Visible length of a string (ignores ANSI codes, counts emoji as 2). */
function vlen(s) {
  const plain = stripAnsi(s);
  // Count wide (emoji / CJK) characters as 2 columns
  let w = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    w += (cp > 0x2E7F) ? 2 : 1;
  }
  return w;
}

/** Pad string to targetWidth based on visible length. */
function rpad(s, targetWidth) {
  return s + ' '.repeat(Math.max(0, targetWidth - vlen(s)));
}

/**
 * Truncate an ANSI-coded string so its visible width ≤ max.
 * Walks the string character by character, tracking visible width.
 */
function truncVis(s, max) {
  let vis = 0;
  let i   = 0;
  while (i < s.length) {
    // Skip ANSI escape sequences
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const end = s.indexOf('m', i);
      if (end !== -1) { i = end + 1; continue; }
    }
    const cp = s.codePointAt(i);
    const w  = cp > 0x2E7F ? 2 : 1;
    if (vis + w > max) break;
    vis += w;
    i   += cp > 0xFFFF ? 2 : 1;
  }
  return s.slice(0, i) + R; // reset at truncation point
}

function truncCwd(s, max) {
  if (!s) return '';
  s = s.replace(HOME, '~');
  if (s.length <= max) return s;
  return '…' + s.slice(-(max - 1));
}

function timeSince(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs <  5)    return 'now';
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function fmtNum(n) {
  if (!n) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/** Render a compact text progress bar, e.g. "████░░░░░░░░" for pct=33 */
function _miniBar(pct, width) {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const color  = pct >= 80 ? YELLOW : DIM;
  return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}${R}`;
}

// ── Display status (computed from live timestamps + status field) ─────────────
function displayStatus(agent) {
  if (agent.status === 'recording')    return { label: 'RECORDING',    color: BLUE,            bullet: '🎙' };
  if (agent.status === 'transcribing') return { label: 'TRANSCRIBING', color: CYAN,            bullet: '⏳' };
  if (agent.status === 'done')         return { label: 'DONE',         color: DIM,             bullet: '✓ ' };

  // Attention: copilot responded but user hasn't typed in >30 s
  if (agent.lastOutputAt && agent.lastInputAt) {
    const outTime  = new Date(agent.lastOutputAt);
    const inTime   = new Date(agent.lastInputAt);
    const outAgeMs = Date.now() - outTime.getTime();
    if (outTime > inTime && outAgeMs > 30_000) {
      return { label: 'ATTENTION', color: `${BOLD}${YELLOW}`, bullet: '⚠ ' };
    }
  }

  // Thinking: user last submitted but no output yet (or output is older than input)
  if (agent.lastInputAt) {
    const inTime  = new Date(agent.lastInputAt);
    const outTime = agent.lastOutputAt ? new Date(agent.lastOutputAt) : null;
    if (!outTime || inTime > outTime) {
      const inputAgeMs = Date.now() - inTime.getTime();
      if (inputAgeMs < 120_000) {
        return { label: 'THINKING', color: CYAN, bullet: '💭' };
      }
    }
  }

  return { label: 'IDLE', color: GREEN, bullet: '● ' };
}

// ── AgentMonitor class ────────────────────────────────────────────────────────
class AgentMonitor {
  constructor() {
    this._timer      = null;
    this._quota      = null;   // cached quota from GitHub API
    this._quotaTime  = 0;
  }

  _refreshQuota() {
    if (Date.now() - this._quotaTime < QUOTA_MS) return;
    this._quotaTime = Date.now(); // mark as in-flight
    fetchQuota().then(q => { this._quota = q; }).catch(() => {});
  }

  start() {
    // Hide cursor, clear screen
    process.stdout.write(`${E}[?25l${E}[2J`);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', data => {
        const s = data.toString();
        if (s === 'q' || s === 'Q' || s === '\x03' || s === '\x1b') {
          process.exit(0);
        }
      });
    }

    process.stdout.on('resize', () => this._render());
    process.on('exit',   () => process.stdout.write(`${E}[?25h${E}[0m\n`));
    process.on('SIGTERM', () => process.exit(0));

    this._render();
    this._refreshQuota();
    this._timer = setInterval(() => { this._render(); this._refreshQuota(); }, REFRESH_MS);
  }

  _render() {
    const cols   = process.stdout.columns || 80;
    const w      = Math.max(64, Math.min(cols, 110));
    const inner  = w - 2;

    const agents   = agentState.readAll();
    const enriched = agents.map(a => ({ ...a, ds: displayStatus(a) }));

    const attentionCount = enriched.filter(a => a.ds.label === 'ATTENTION').length;
    const activeCount    = enriched.filter(a => a.status !== 'done').length;
    const doneCount      = enriched.filter(a => a.status === 'done').length;

    // Box chars
    const H = '─', V = '│', TL = '╭', TR = '╮', BL = '╰', BR = '╯';
    const ML = '├', MR = '┤';

    const lines = [];

    // ── Header ────────────────────────────────────────────────────────────────
    const titleTxt = ' copilot+ monitor ';
    const tPadL = Math.floor((inner - titleTxt.length) / 2);
    const tPadR = inner - titleTxt.length - tPadL;
    lines.push(`${TL}${H.repeat(tPadL)}${BOLD}${titleTxt}${R}${H.repeat(tPadR)}${TR}`);

    // ── Summary bar (agents left, quota right) ────────────────────────────────
    let summaryL;
    if (agents.length === 0) {
      summaryL = `  ${DIM}no agents running${R}`;
    } else {
      const parts = [];
      if (activeCount)    parts.push(`${BOLD}${activeCount} active${R}`);
      if (attentionCount) parts.push(`${BOLD}${YELLOW}${attentionCount} need attention${R}`);
      if (doneCount)      parts.push(`${DIM}${doneCount} done${R}`);
      summaryL = `  ${parts.join(`  ${DIM}·${R}  `)}`;
    }
    const now       = new Date().toLocaleTimeString();
    const summaryR  = `${DIM}updates every ${REFRESH_MS / 1000}s  ·  ${now}  ·  q quit${R}  `;
    const gapWidth  = inner - vlen(summaryL) - vlen(summaryR);
    lines.push(`${V}${summaryL}${' '.repeat(Math.max(0, gapWidth))}${summaryR}${V}`);

    // ── Quota bar ─────────────────────────────────────────────────────────────
    const q = this._quota;
    if (q) {
      const planLabel = q.plan.replace(/_/g, ' ');
      let quotaStr;
      if (q.premium.unlimited) {
        quotaStr = `${DIM}${planLabel}  ·  premium requests: unlimited${R}`;
      } else if (q.premium.used !== null) {
        const pct  = Math.round(100 * q.premium.used / (q.premium.entitlement || 1));
        const bar  = _miniBar(pct, 12);
        const reset = q.resetDate ? `  resets ${q.resetDate}` : '';
        quotaStr = `${DIM}${planLabel}  ·  ${R}${BOLD}${q.premium.used}${R}${DIM}/${q.premium.entitlement} premium req  ${bar}${reset}${R}`;
      } else {
        quotaStr = `${DIM}${planLabel}${R}`;
      }
      const qLine = `  ${quotaStr}`;
      lines.push(`${V}${rpad(qLine, inner)}${V}`);
    }

    // ── Agent cards ───────────────────────────────────────────────────────────
    if (agents.length === 0) {
      lines.push(`${ML}${H.repeat(inner)}${MR}`);
      const msg = `${DIM}  No copilot+ agents detected. Start one with: copilot+${R}`;
      lines.push(`${V}${rpad(msg, inner)}${V}`);
      lines.push(`${V}${' '.repeat(inner)}${V}`);
    } else {
      for (let i = 0; i < enriched.length; i++) {
        const a   = enriched[i];
        const ds  = a.ds;

        // Separator between cards — dashed for same-status group, solid between groups
        const sep = (i === 0 || enriched[i - 1].ds.label !== ds.label)
          ? `${ML}${H.repeat(inner)}${MR}`
          : `${ML}${DIM}${' ─'.repeat(Math.ceil(inner / 2)).slice(0, inner)}${R}${MR}`;
        lines.push(sep);

        // ── Card line 1: bullet + status + pid + model/type + cwd ───────────
        // Column widths (visible)
        const STATUS_W = 14;  // "TRANSCRIBING" is 12 chars
        const PID_W    = 7;
        const MODEL_W  = 24;
        // cwd gets the remainder
        const CWD_W = Math.max(10, inner - 2 - STATUS_W - 2 - PID_W - 2 - MODEL_W - 2);

        const statusPlain = `${ds.bullet} ${ds.label}`;
        const statusFmt   = `${ds.color}${BOLD}${ds.bullet} ${ds.label}${R}`;
        const pidFmt      = `${DIM}pid${R} ${a.pid || '?'}`;

        // Native (unmanaged) processes show their type tag; managed show model name
        let modelRaw;
        if (a._native) {
          modelRaw = `${DIM}[${a._type || 'copilot CLI'}]${R}`;
        } else if (a.model) {
          modelRaw = truncCwd(a.model, MODEL_W);
        } else {
          modelRaw = `${DIM}unknown${R}`;
        }
        const modelFmt = rpad(modelRaw, MODEL_W + (vlen(modelRaw) - vlen(stripAnsi(modelRaw))));
        const cwdFmt   = `${DIM}${truncCwd(a.cwd || '', CWD_W)}${R}`;

        const line1 = `  ${rpad(statusFmt, STATUS_W + (vlen(statusFmt) - vlen(statusPlain)))}` +
                      `  ${pidFmt}  ${modelFmt}  ${cwdFmt}`;
        lines.push(`${V}${rpad(line1, inner)}${V}`);

        // ── Card line 2: requests + timing ───────────────────────────────
        // Token counts aren't exposed by the CLI, so we show exchange count instead
        let reqStr;
        if (a.tokensIn || a.tokensOut) {
          // Future-proof: if token data ever appears, show it
          reqStr = `↑ ${rpad(fmtNum(a.tokensIn), 5)} ↓ ${rpad(fmtNum(a.tokensOut), 5)} tok`;
        } else if (a._native) {
          reqStr = `${DIM}[unmanaged – no stats]${R}  `;
        } else if (a.exchanges) {
          reqStr = `${BOLD}${a.exchanges}${R}${DIM} premium req${R}              `;
        } else {
          reqStr = `${DIM}0 requests so far${R}          `;
        }

        const timeParts = [];
        if (a.startedAt)    timeParts.push(`started ${timeSince(a.startedAt)}`);
        if (a.exchanges)    timeParts.push(`${a.exchanges} msg${a.exchanges === 1 ? '' : 's'}`);
        const lastTime = a.status === 'done' && a.endedAt
          ? `ended ${timeSince(a.endedAt)}`
          : (a.lastOutputAt || a.lastInputAt)
            ? `active ${timeSince(a.lastOutputAt || a.lastInputAt)}`
            : '';
        if (lastTime) timeParts.push(lastTime);

        const timeFmt  = `${DIM}${timeParts.join(`  ·  `)}${R}`;
        const indent   = ' '.repeat(2 + STATUS_W);
        const line2raw = `${indent}${reqStr}  ${timeFmt}`;

        // Truncate line2 to inner width if needed (protects box alignment)
        const line2 = vlen(line2raw) > inner
          ? truncVis(line2raw, inner)
          : line2raw;
        lines.push(`${V}${rpad(line2, inner)}${V}`);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    // Emit — move to top-left then write all lines at once to avoid flicker
    process.stdout.write(`${E}[H${lines.join('\n')}\n`);
  }
}

module.exports = AgentMonitor;
