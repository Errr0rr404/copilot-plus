'use strict';

/**
 * CheatSheet — overlay that lists every hotkey copilot+ provides.
 *
 * Toggled with `?` (printable) or Ctrl+/ (\x1f). While open, all stdin
 * is consumed. Closes on any key. The list is generated dynamically so it
 * always reflects the active config (only enabled features are highlighted).
 *
 * Designed for first-time discoverability — most users never read the README,
 * but everyone will press `?` once they see "Press ? for help" in the title.
 */

const os    = require('os');
const theme = require('./theme');

const IS_MAC = os.platform() === 'darwin';

const TL = '╭', TR = '╮', BL = '╰', BR = '╯', H = '─', V = '│';

class CheatSheet {
  constructor() {
    this._open = false;
    this._resolve = null;
  }

  get isOpen() { return this._open; }

  open(cfg) {
    if (this._open) return Promise.resolve();
    this._open = true;
    this._render(cfg);
    return new Promise(res => { this._resolve = res; });
  }

  handleInput(/* data */) {
    if (!this._open) return false;
    this._close();
    return true;
  }

  _close() {
    if (!this._open) return;
    this._open = false;
    process.stdout.write('\x1b8');                   // restore cursor
    process.stdout.write('\x1b[J');                  // clear from cursor
    if (this._resolve) { const r = this._resolve; this._resolve = null; r(); }
  }

  _render(cfg) {
    const t = theme.get(cfg);
    const rows  = process.stdout.rows    || 24;
    const cols  = process.stdout.columns || 80;
    const w     = Math.min(74, cols - 4);
    const inner = w - 2;
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    const modKey  = IS_MAC ? 'Opt'    : 'Ctrl+Shift';
    const macroKey = IS_MAC ? 'Opt'    : 'Ctrl';
    const phrase  = (cfg && cfg.wakeWord && cfg.wakeWord.phrase) || 'hey copilot';

    const sections = [
      { title: 'Input', items: [
        ['Ctrl+R',         'Start / stop voice recording'],
        ['Ctrl+P',         'Capture a screenshot, inject as @path'],
        ['Ctrl+Y',         'Paste clipboard (text or image) as context'],
        ['Ctrl+G',         'Inject smart context (git diff, recent files)'],
        ['Ctrl+O',         'Attach a project file as @path'],
        ['Ctrl+S',         'Stash current prompt draft'],
        ['!cmd',           'Type ! + shell command → injects stdout'],
        ['Enter (busy)',   'Queue prompt while agent is responding'],
      ]},
      { title: 'Models & Macros', items: [
        [`${modKey}+1–4`,  'Switch to workhorse model slot 1–4'],
        [`${modKey}+5`,    'Toggle ⚡ Auto Mode'],
        [`${macroKey}+1–9`,'Run prompt macro 1–9'],
      ]},
      { title: 'UI', items: [
        ['Ctrl+K',         'Open command palette (workflows, queue, …)'],
        ['Ctrl+E',         'Open last response in $EDITOR'],
        ['Ctrl+T',         'Toggle text-to-speech reading of responses'],
        ['Ctrl+B',         'Bookmark the last response'],
        ['?  /  Ctrl+/',   'Show this cheatsheet'],
      ]},
      { title: 'Voice activation', items: [
        ['Wake phrase',    cfg && cfg.wakeWord && cfg.wakeWord.enabled
                            ? `Say "${phrase}" (currently ON)`
                            : 'Disabled — toggle via Ctrl+K'],
      ]},
      { title: 'Tools', items: [
        ['copilot+ --monitor',        'Live multi-session dashboard'],
        ['copilot+ --history',        'Search past sessions'],
        ['copilot+ --snippets',       'Browse bookmarked responses'],
        ['copilot+ --usage',          'Local + premium usage summary'],
        ['copilot+ --workflows',      'List prompt workflow chains'],
        ['copilot+ --export-config',  'Share team config package'],
        ['copilot+ --worktree',       'Isolated git worktree session'],
      ]},
    ];

    const lines = [];
    const title = ' copilot+ cheatsheet ';
    const padL = Math.floor((inner - title.length) / 2);
    const padR = inner - title.length - padL;
    lines.push(`${TL}${H.repeat(padL)}${t.bold}${title}${t.reset}${H.repeat(padR)}${TR}`);

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      const sLabel = `  ${t.accent}${sec.title}${t.reset}`;
      lines.push(`${V}${_pad(sLabel, inner)}${V}`);
      for (const [k, desc] of sec.items) {
        const left  = `    ${t.bold}${k}${t.reset}`;
        const right = `${t.dim}${desc}${t.reset}`;
        const gap   = Math.max(2, inner - _vlen(left) - _vlen(right) - 2);
        lines.push(`${V}${_truncPad(left + ' '.repeat(gap) + right, inner)}${V}`);
      }
      if (s < sections.length - 1) {
        lines.push(`${V}${' '.repeat(inner)}${V}`);
      }
    }
    lines.push(`${V}${' '.repeat(inner)}${V}`);
    const hint = `${t.dim}  Press any key to close${t.reset}`;
    lines.push(`${V}${_pad(hint, inner)}${V}`);
    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    // Clamp visible rows; if cheatsheet is taller than the terminal,
    // we still render the top portion (better than crashing).
    const maxRows = Math.max(8, rows - startRow - 1);
    const rendered = lines.slice(0, maxRows);

    let out = '\x1b7'; // save cursor
    for (let i = 0; i < rendered.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${rendered[i]}`;
    }
    process.stdout.write(out);
  }
}

function _vlen(s) { return s.replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '').length; }
function _pad(s, w) { return s + ' '.repeat(Math.max(0, w - _vlen(s))); }
function _truncPad(s, w) {
  if (_vlen(s) <= w) return _pad(s, w);
  // Walk and truncate preserving ANSI sequences.
  let vis = 0, i = 0, out = '';
  while (i < s.length && vis < w) {
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const m = s.slice(i).match(/^\x1b\[[0-9;]*[mA-Za-z]/);
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    out += s[i]; vis++; i++;
  }
  return out + '\x1b[0m';
}

module.exports = CheatSheet;
