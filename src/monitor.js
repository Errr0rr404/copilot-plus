'use strict';

/**
 * AgentMonitor — full-screen TUI dashboard for `copilot+ --monitor`.
 *
 * Reads ~/.copilot/agents/<PID>.json every REFRESH_MS, computes display
 * status from timestamps, and renders a live card view.
 *
 * Interactive keys:
 *   ↑ / k          select previous agent
 *   ↓ / j          select next agent
 *   /              filter (type, Enter applies, Esc clears)
 *   s              cycle sort order
 *   K              send SIGTERM to selected agent (confirm with shift)
 *   r              refresh quota now
 *   o              open the selected agent's cwd in a new terminal tab (best-effort)
 *   ?              toggle inline help
 *   q / Q / Esc    exit
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const agentState = require('./agent-state');
const { fetchQuota } = require('./copilot-api');
const theme = require('./theme');

const REFRESH_MS  = 1500;
const QUOTA_MS    = 5 * 60 * 1000;
const HOME        = os.homedir();
const PLATFORM    = os.platform();
const IS_MAC      = PLATFORM === 'darwin';
const IS_WIN      = PLATFORM === 'win32';

const SORT_MODES = ['status', 'started', 'activity', 'pid'];

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const E      = '\x1b';
const R      = `${E}[0m`;
const BOLD   = `${E}[1m`;
const DIM    = `${E}[2m`;
const REVERSE = `${E}[7m`;

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '');
}

function vlen(s) {
  const plain = stripAnsi(s);
  let w = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    w += (cp > 0x2E7F) ? 2 : 1;
  }
  return w;
}

function rpad(s, targetWidth) {
  return s + ' '.repeat(Math.max(0, targetWidth - vlen(s)));
}

function truncVis(s, max) {
  let vis = 0, i = 0;
  while (i < s.length) {
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
  return s.slice(0, i) + R;
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

function _miniBar(pct, width, t) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty  = width - filled;
  const color  = pct >= 80 ? t.quota_hi : t.quota_ok;
  return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}${t.reset}`;
}

function displayStatus(agent, t) {
  if (agent.status === 'recording')    return { label: 'RECORDING',    color: t.info,                 bullet: '🎙' };
  if (agent.status === 'transcribing') return { label: 'TRANSCRIBING', color: t.accent,               bullet: '⏳' };
  if (agent.status === 'done')         return { label: 'DONE',         color: t.dim,                  bullet: '✓ ' };

  if (agent.lastOutputAt && agent.lastInputAt) {
    const outTime  = new Date(agent.lastOutputAt);
    const inTime   = new Date(agent.lastInputAt);
    if (outTime > inTime && Date.now() - outTime.getTime() > 30_000) {
      return { label: 'ATTENTION', color: `${BOLD}${t.warn}`, bullet: '⚠ ' };
    }
  }
  if (agent.lastInputAt) {
    const inTime  = new Date(agent.lastInputAt);
    const outTime = agent.lastOutputAt ? new Date(agent.lastOutputAt) : null;
    if (!outTime || inTime > outTime) {
      const inputAgeMs = Date.now() - inTime.getTime();
      if (inputAgeMs < 120_000) return { label: 'THINKING', color: t.accent, bullet: '💭' };
    }
  }
  return { label: 'IDLE', color: t.success, bullet: '● ' };
}

// ── AgentMonitor ──────────────────────────────────────────────────────────────
class AgentMonitor {
  constructor(opts = {}) {
    this._timer      = null;
    this._quota      = null;
    this._quotaTime  = 0;
    this._cfg        = opts.cfg || {};
    this._selectedPid = null;
    this._sortMode    = 'status';
    this._filter      = '';
    this._inFilter    = false;
    this._showHelp    = false;
    this._lastAgents  = [];
    this._renderedRows = 0;
    this._notice      = null; // transient status string, cleared on next render
  }

  _refreshQuota(force = false) {
    if (!force && Date.now() - this._quotaTime < QUOTA_MS) return;
    this._quotaTime = Date.now();
    fetchQuota()
      .then(q => { if (q) this._quota = q; else this._quotaTime = 0; })
      .catch(() => { this._quotaTime = 0; });
  }

  start() {
    process.stdout.write(`${E}[?25l${E}[2J`);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', data => this._handleKey(data));
    }

    process.stdout.on('resize', () => this._render());
    process.on('exit',  () => {
      try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
      process.stdout.write(`${E}[?25h${E}[0m\n`);
    });
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGHUP',  () => process.exit(0));
    process.on('SIGINT',  () => process.exit(0));

    this._render();
    this._refreshQuota();
    this._timer = setInterval(() => { this._render(); this._refreshQuota(); }, REFRESH_MS);
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _handleKey(data) {
    const s = data.toString();

    if (this._inFilter) {
      if (s === '\x1b') { this._filter = ''; this._inFilter = false; this._render(); return; }
      if (s === '\r' || s === '\n') { this._inFilter = false; this._render(); return; }
      if (s === '\x7f' || s === '\x08') { this._filter = this._filter.slice(0, -1); this._render(); return; }
      if (s === '\x03') { process.exit(0); }
      if (s.length === 1 && s.charCodeAt(0) >= 32 && s.charCodeAt(0) < 127) {
        this._filter += s; this._render(); return;
      }
      return;
    }

    if (s === 'q' || s === 'Q' || s === '\x03' || s === '\x1b') process.exit(0);

    if (s === 'j' || s === '\x1b[B') { this._move(+1); return; }
    if (s === 'k' || s === '\x1b[A') { this._move(-1); return; }

    if (s === '/') { this._inFilter = true; this._filter = ''; this._render(); return; }
    if (s === 's') { this._sortMode = SORT_MODES[(SORT_MODES.indexOf(this._sortMode) + 1) % SORT_MODES.length]; this._notice = `sort: ${this._sortMode}`; this._render(); return; }
    if (s === 'r') { this._refreshQuota(true); this._notice = 'quota refresh requested'; this._render(); return; }
    if (s === '?') { this._showHelp = !this._showHelp; this._render(); return; }
    if (s === 'K') { this._killSelected(); return; }
    if (s === 'o') { this._openSelected(); return; }
    if (s === '\r' || s === '\n') { this._showSelectedDetail(); return; }
  }

  _move(delta) {
    const list = this._lastAgents;
    if (!list.length) return;
    let idx = list.findIndex(a => a.pid === this._selectedPid);
    if (idx === -1) idx = 0;
    idx = Math.max(0, Math.min(list.length - 1, idx + delta));
    this._selectedPid = list[idx].pid;
    this._render();
  }

  _killSelected() {
    if (!this._selectedPid) { this._notice = 'no agent selected'; this._render(); return; }
    try {
      process.kill(this._selectedPid, 'SIGTERM');
      this._notice = `sent SIGTERM to pid ${this._selectedPid}`;
    } catch (err) {
      this._notice = `kill failed: ${err.code || err.message}`;
    }
    this._render();
  }

  _openSelected() {
    const sel = (this._lastAgents || []).find(a => a.pid === this._selectedPid);
    if (!sel || !sel.cwd) { this._notice = 'no cwd to open'; this._render(); return; }
    try {
      if (IS_MAC) {
        // Open a new Terminal.app tab cd'd into the cwd
        const script = `tell application "Terminal" to do script "cd '${sel.cwd.replace(/'/g, "'\\''")}' && copilot+"`;
        spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      } else if (IS_WIN) {
        spawn('wt', ['-d', sel.cwd], { detached: true, stdio: 'ignore' }).unref();
      } else {
        // Linux best-effort
        for (const term of ['gnome-terminal', 'konsole', 'xterm']) {
          if (spawnSync('which', [term]).status === 0) {
            spawn(term, ['--working-directory=' + sel.cwd], { detached: true, stdio: 'ignore' }).unref();
            break;
          }
        }
      }
      this._notice = `opening ${sel.cwd}`;
    } catch (err) {
      this._notice = `open failed: ${err.code || err.message}`;
    }
    this._render();
  }

  _showSelectedDetail() {
    // Toggle help on Enter for now — detail panel is a future iteration.
    this._showHelp = true;
    this._render();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  _sortAgents(agents) {
    const order = { recording: 0, transcribing: 1, idle: 2, done: 3 };
    const m = this._sortMode;
    const copy = [...agents];
    if (m === 'status') {
      copy.sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
    } else if (m === 'started') {
      copy.sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
    } else if (m === 'activity') {
      copy.sort((a, b) =>
        new Date(b.lastOutputAt || b.lastInputAt || 0) - new Date(a.lastOutputAt || a.lastInputAt || 0));
    } else if (m === 'pid') {
      copy.sort((a, b) => (a.pid || 0) - (b.pid || 0));
    }
    return copy;
  }

  _filterAgents(agents) {
    if (!this._filter) return agents;
    const q = this._filter.toLowerCase();
    return agents.filter(a =>
      String(a.pid || '').includes(q)
      || (a.cwd   || '').toLowerCase().includes(q)
      || (a.model || '').toLowerCase().includes(q)
      || (a.status|| '').toLowerCase().includes(q)
    );
  }

  _render() {
    const t = theme.get(this._cfg);
    const cols   = process.stdout.columns || 80;
    const w      = Math.max(64, Math.min(cols, 110));
    const inner  = w - 2;

    let agents   = agentState.readAll();
    agents = this._sortAgents(this._filterAgents(agents));
    this._lastAgents = agents;

    // Ensure selectedPid is valid
    if (this._selectedPid && !agents.find(a => a.pid === this._selectedPid)) {
      this._selectedPid = agents[0] ? agents[0].pid : null;
    } else if (!this._selectedPid && agents[0]) {
      this._selectedPid = agents[0].pid;
    }

    const enriched = agents.map(a => ({ ...a, ds: displayStatus(a, t) }));

    const attentionCount = enriched.filter(a => a.ds.label === 'ATTENTION').length;
    const activeCount    = enriched.filter(a => a.status !== 'done').length;
    const doneCount      = enriched.filter(a => a.status === 'done').length;

    const H = '─', V = '│', TL = '╭', TR = '╮', BL = '╰', BR = '╯', ML = '├', MR = '┤';
    const lines = [];

    // Header
    const titleTxt = ' copilot+ monitor ';
    const tPadL = Math.max(0, Math.floor((inner - titleTxt.length) / 2));
    const tPadR = Math.max(0, inner - titleTxt.length - tPadL);
    lines.push(`${TL}${H.repeat(tPadL)}${BOLD}${titleTxt}${R}${H.repeat(tPadR)}${TR}`);

    // Summary
    let summaryL;
    if (agents.length === 0) {
      summaryL = `  ${t.dim}no agents running${t.reset}`;
    } else {
      const parts = [];
      if (activeCount)    parts.push(`${BOLD}${activeCount} active${R}`);
      if (attentionCount) parts.push(`${BOLD}${t.warn}${attentionCount} need attention${t.reset}`);
      if (doneCount)      parts.push(`${t.dim}${doneCount} done${t.reset}`);
      summaryL = `  ${parts.join(`  ${t.dim}·${t.reset}  `)}`;
    }
    const now      = new Date().toLocaleTimeString();
    const sortBadge = `${t.dim}sort:${t.reset}${this._sortMode}`;
    const filterBadge = this._filter || this._inFilter
      ? `  ${t.dim}/${t.reset}${this._filter}${this._inFilter ? '_' : ''}`
      : '';
    const summaryR = `${t.dim}${sortBadge}  ·  ${now}  ·  ? help${t.reset}${filterBadge}  `;
    const gap = inner - vlen(summaryL) - vlen(summaryR);
    lines.push(`${V}${summaryL}${' '.repeat(Math.max(0, gap))}${summaryR}${V}`);

    // Quota
    const q = this._quota;
    if (q) {
      const planLabel = q.plan.replace(/_/g, ' ');
      let quotaStr;
      if (q.premium.unlimited) {
        quotaStr = `${t.dim}${planLabel}  ·  premium requests: unlimited${t.reset}`;
      } else if (q.premium.used !== null) {
        const pct  = Math.round(100 * q.premium.used / (q.premium.entitlement || 1));
        const bar  = _miniBar(pct, 12, t);
        const reset = q.resetDate ? `  resets ${q.resetDate}` : '';
        quotaStr = `${t.dim}${planLabel}  ·  ${t.reset}${BOLD}${q.premium.used}${R}${t.dim}/${q.premium.entitlement} premium req  ${bar}${reset}${t.reset}`;
      } else {
        quotaStr = `${t.dim}${planLabel}${t.reset}`;
      }
      lines.push(`${V}${rpad(`  ${quotaStr}`, inner)}${V}`);
    }

    // Cards
    if (agents.length === 0) {
      lines.push(`${ML}${H.repeat(inner)}${MR}`);
      const msg = `${t.dim}  No copilot+ agents detected. Start one with: copilot+${t.reset}`;
      lines.push(`${V}${rpad(msg, inner)}${V}`);
      lines.push(`${V}${' '.repeat(inner)}${V}`);
    } else {
      for (let i = 0; i < enriched.length; i++) {
        const a   = enriched[i];
        const ds  = a.ds;
        const isSel = a.pid === this._selectedPid;

        const sep = (i === 0 || enriched[i - 1].ds.label !== ds.label)
          ? `${ML}${H.repeat(inner)}${MR}`
          : `${ML}${t.dim}${' ─'.repeat(Math.ceil(inner / 2)).slice(0, inner)}${t.reset}${MR}`;
        lines.push(sep);

        const STATUS_W = 14;
        const PID_W    = 7;
        const MODEL_W  = 24;
        const CWD_W = Math.max(10, inner - 2 - STATUS_W - 2 - PID_W - 2 - MODEL_W - 2);

        const arrow = isSel ? `${t.accent}${BOLD}▶${t.reset} ` : '  ';
        const statusPlain = `${ds.bullet} ${ds.label}`;
        const statusFmt   = `${ds.color}${BOLD}${ds.bullet} ${ds.label}${t.reset}`;
        const pidFmt      = `${t.dim}pid${t.reset} ${a.pid || '?'}`;

        let modelRaw;
        if (a._native) {
          modelRaw = `${t.dim}[${a._type || 'copilot CLI'}]${t.reset}`;
        } else if (a.model) {
          modelRaw = truncCwd(a.model, MODEL_W);
        } else {
          modelRaw = `${t.dim}unknown${t.reset}`;
        }
        const modelFmt = rpad(modelRaw, MODEL_W + (vlen(modelRaw) - vlen(stripAnsi(modelRaw))));
        const cwdFmt   = `${t.dim}${truncCwd(a.cwd || '', CWD_W)}${t.reset}`;

        const line1 = `${arrow}${rpad(statusFmt, STATUS_W + (vlen(statusFmt) - vlen(statusPlain)))}` +
                      `  ${pidFmt}  ${modelFmt}  ${cwdFmt}`;
        const open  = isSel ? REVERSE : '';
        const close = isSel ? R       : '';
        lines.push(`${V}${open}${rpad(line1, inner)}${close}${V}`);

        let reqStr;
        if (a.tokensIn || a.tokensOut) {
          reqStr = `↑ ${rpad(fmtNum(a.tokensIn), 5)} ↓ ${rpad(fmtNum(a.tokensOut), 5)} tok`;
        } else if (a._native) {
          reqStr = `${t.dim}[unmanaged – no stats]${t.reset}  `;
        } else if (a.exchanges) {
          reqStr = `${BOLD}${a.exchanges}${R}${t.dim} premium req${t.reset}              `;
        } else {
          reqStr = `${t.dim}0 requests so far${t.reset}          `;
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

        const timeFmt  = `${t.dim}${timeParts.join('  ·  ')}${t.reset}`;
        const indent   = ' '.repeat(2 + STATUS_W);
        const line2raw = `${indent}${reqStr}  ${timeFmt}`;
        const line2 = vlen(line2raw) > inner ? truncVis(line2raw, inner) : line2raw;
        lines.push(`${V}${rpad(line2, inner)}${V}`);
      }
    }

    // Notice / help
    if (this._notice) {
      lines.push(`${V}${rpad(`  ${t.accent}${this._notice}${t.reset}`, inner)}${V}`);
      this._notice = null;
    }

    if (this._showHelp) {
      lines.push(`${ML}${H.repeat(inner)}${MR}`);
      const helpLines = [
        '  j/k ↑↓ navigate    /  filter     s  cycle sort',
        '  o  open cwd        K  SIGTERM    r  refresh quota',
        '  ? toggle help      q  quit',
      ];
      for (const l of helpLines) lines.push(`${V}${rpad(`${t.dim}${l}${t.reset}`, inner)}${V}`);
    }

    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    // Emit
    process.stdout.write(`${E}[H${lines.join('\n')}\n${E}[J`);
    this._renderedRows = lines.length;
  }
}

module.exports = AgentMonitor;
