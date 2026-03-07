'use strict';

/**
 * CommandPalette — terminal overlay that lists available actions.
 *
 * Renders an ANSI box with navigable/filterable action list.
 * While open, all stdin input is consumed by the palette.
 */

const PALETTE_WIDTH = 52;
const MAX_VISIBLE = 12;

// Box-drawing chars
const TL = '╭', TR = '╮', BL = '╰', BR = '╯', H = '─', V = '│';

class CommandPalette {
  constructor() {
    this._open = false;
    this._resolve = null;
    this._filter = '';
    this._selectedIdx = 0;
    this._actions = [];
    this._filtered = [];
    this._savedCursor = '';
  }

  get isOpen() { return this._open; }

  /**
   * Open the palette and return a Promise that resolves to the selected
   * action id or null (if dismissed).
   * @param {Array<{id: string, label: string, hint?: string}>} actions
   * @returns {Promise<string|null>}
   */
  open(actions) {
    if (this._open) return Promise.resolve(null);
    this._open = true;
    this._actions = actions;
    this._filter = '';
    this._selectedIdx = 0;
    this._applyFilter();
    this._render();

    return new Promise(resolve => { this._resolve = resolve; });
  }

  /** Feed raw stdin data while the palette is open. Returns true if consumed. */
  handleInput(data) {
    if (!this._open) return false;
    const str = typeof data === 'string' ? data : data.toString();

    // Escape → dismiss
    if (str === '\x1b') {
      this._close(null);
      return true;
    }

    // Enter → select
    if (str === '\r' || str === '\n') {
      const item = this._filtered[this._selectedIdx];
      this._close(item ? item.id : null);
      return true;
    }

    // Arrow up / Ctrl+P
    if (str === '\x1b[A' || str === '\x10') {
      this._selectedIdx = Math.max(0, this._selectedIdx - 1);
      this._render();
      return true;
    }

    // Arrow down / Ctrl+N
    if (str === '\x1b[B' || str === '\x0e') {
      this._selectedIdx = Math.min(this._filtered.length - 1, this._selectedIdx + 1);
      this._render();
      return true;
    }

    // Backspace
    if (str === '\x7f' || str === '\x08') {
      if (this._filter.length > 0) {
        this._filter = this._filter.slice(0, -1);
        this._selectedIdx = 0;
        this._applyFilter();
        this._render();
      }
      return true;
    }

    // Ctrl+C → dismiss
    if (str === '\x03') {
      this._close(null);
      return true;
    }

    // Printable characters → filter
    if (str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      this._filter += str;
      this._selectedIdx = 0;
      this._applyFilter();
      this._render();
      return true;
    }

    return true; // swallow everything else while open
  }

  _applyFilter() {
    const q = this._filter.toLowerCase();
    this._filtered = q
      ? this._actions.filter(a => a.label.toLowerCase().includes(q))
      : [...this._actions];
  }

  _render() {
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const inner = w - 2; // content width inside borders

    // Position: centered horizontally, near top
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    const lines = [];

    // Header
    const title = ' Command Palette ';
    const padLeft = Math.floor((inner - title.length) / 2);
    const padRight = inner - title.length - padLeft;
    lines.push(`${TL}${H.repeat(padLeft)}${title}${H.repeat(padRight)}${TR}`);

    // Filter input
    const filterDisplay = this._filter || '';
    const prompt = ` > ${filterDisplay}`;
    lines.push(`${V}${prompt.padEnd(inner)}${V}`);
    lines.push(`${V}${H.repeat(inner)}${V}`);

    // Visible items (scrolling window)
    const visible = Math.min(MAX_VISIBLE, this._filtered.length, rows - 8);
    let scrollTop = 0;
    if (this._selectedIdx >= scrollTop + visible) {
      scrollTop = this._selectedIdx - visible + 1;
    }
    if (this._selectedIdx < scrollTop) {
      scrollTop = this._selectedIdx;
    }

    if (this._filtered.length === 0) {
      lines.push(`${V}${'  (no matches)'.padEnd(inner)}${V}`);
    } else {
      for (let i = scrollTop; i < scrollTop + visible && i < this._filtered.length; i++) {
        const item = this._filtered[i];
        const selected = i === this._selectedIdx;
        const marker = selected ? '\x1b[7m' : ''; // reverse video for selection
        const reset = selected ? '\x1b[0m' : '';
        const hint = item.hint ? `  \x1b[2m${item.hint}\x1b[0m` : '';
        const label = ` ${item.label}`;
        // Truncate if needed (accounting for ANSI codes in hint)
        const visibleLen = label.length + (item.hint ? item.hint.length + 2 : 0);
        let content;
        if (visibleLen > inner) {
          content = label.slice(0, inner);
        } else {
          content = label.padEnd(inner - (item.hint ? item.hint.length + 2 : 0)) + hint;
        }
        // Pad to inner width for reverse-video highlight
        const plainContent = label + (item.hint ? `  ${item.hint}` : '');
        const padded = plainContent.length < inner
          ? label.padEnd(inner - (item.hint ? item.hint.length + 2 : 0)) + (item.hint ? `  ${item.hint}` : '')
          : label.slice(0, inner);
        lines.push(`${V}${marker}${padded.padEnd(inner)}${reset}${V}`);
      }
    }

    // Footer
    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    // Write overlay
    let out = '\x1b7'; // save cursor
    for (let i = 0; i < lines.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${lines[i]}`;
    }
    out += `\x1b[${startRow + 1};${startCol + 4 + filterDisplay.length}H`; // position cursor in filter input
    process.stdout.write(out);
  }

  _close(result) {
    if (!this._open) return;
    this._open = false;

    // Erase the palette by restoring cursor and requesting a repaint
    process.stdout.write('\x1b8'); // restore cursor
    // Clear the area where the palette was drawn
    const rows = Math.min(MAX_VISIBLE + 4, this._filtered.length + 4);
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));
    let clear = '';
    for (let i = 0; i < rows; i++) {
      clear += `\x1b[${startRow + i};${startCol}H${' '.repeat(w)}`;
    }
    clear += '\x1b8';
    process.stdout.write(clear);

    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(result);
    }
  }
}

module.exports = CommandPalette;
