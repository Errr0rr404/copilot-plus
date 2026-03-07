'use strict';

/**
 * CommandPalette — terminal overlay that lists available actions.
 *
 * Renders an ANSI box with navigable/filterable action list.
 * While open, all stdin input is consumed by the palette.
 * Action items with `editable: true` and a `value` string support
 * inline text editing when selected — resolves with {id, value, run}.
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
    // Edit mode state
    this._editing = false;
    this._editItem = null;
    this._editText = '';
    this._editCursor = 0;
  }

  get isOpen() { return this._open; }

  /**
   * Open the palette and return a Promise that resolves to:
   *   - null                      — dismissed
   *   - string                    — regular action id selected
   *   - {id, value, run: bool}    — editable item saved
   * @param {Array<{id: string, label: string, hint?: string, editable?: bool, value?: string}>} actions
   */
  open(actions) {
    if (this._open) return Promise.resolve(null);
    this._open = true;
    this._editing = false;
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

    if (this._editing) return this._handleEditInput(str);

    // Escape → dismiss
    if (str === '\x1b') {
      this._close(null);
      return true;
    }

    // Enter → select (or enter edit mode for editable items)
    if (str === '\r' || str === '\n') {
      const item = this._filtered[this._selectedIdx];
      if (!item) { this._close(null); return true; }
      if (item.editable) {
        this._startEdit(item);
      } else {
        this._close(item.id);
      }
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

  // --- Edit mode ---

  _startEdit(item) {
    this._editing = true;
    this._editItem = item;
    this._editText = item.value || '';
    this._editCursor = this._editText.length;
    this._renderEdit();
  }

  _handleEditInput(str) {
    // Escape → back to list
    if (str === '\x1b') {
      this._editing = false;
      this._render();
      return true;
    }

    // Enter → save and run
    if (str === '\r' || str === '\n') {
      this._close({ id: this._editItem.id, value: this._editText, run: true });
      return true;
    }

    // Tab or Ctrl+S → save without running
    if (str === '\t' || str === '\x13') {
      this._close({ id: this._editItem.id, value: this._editText, run: false });
      return true;
    }

    // Ctrl+C → dismiss entirely
    if (str === '\x03') {
      this._close(null);
      return true;
    }

    // Arrow left
    if (str === '\x1b[D') {
      this._editCursor = Math.max(0, this._editCursor - 1);
      this._renderEdit();
      return true;
    }

    // Arrow right
    if (str === '\x1b[C') {
      this._editCursor = Math.min(this._editText.length, this._editCursor + 1);
      this._renderEdit();
      return true;
    }

    // Home / Ctrl+A
    if (str === '\x1b[H' || str === '\x01') {
      this._editCursor = 0;
      this._renderEdit();
      return true;
    }

    // End / Ctrl+E
    if (str === '\x1b[F' || str === '\x05') {
      this._editCursor = this._editText.length;
      this._renderEdit();
      return true;
    }

    // Backspace
    if (str === '\x7f' || str === '\x08') {
      if (this._editCursor > 0) {
        this._editText =
          this._editText.slice(0, this._editCursor - 1) +
          this._editText.slice(this._editCursor);
        this._editCursor--;
        this._renderEdit();
      }
      return true;
    }

    // Delete (forward)
    if (str === '\x1b[3~') {
      if (this._editCursor < this._editText.length) {
        this._editText =
          this._editText.slice(0, this._editCursor) +
          this._editText.slice(this._editCursor + 1);
        this._renderEdit();
      }
      return true;
    }

    // Printable characters → insert at cursor
    if (str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      this._editText =
        this._editText.slice(0, this._editCursor) +
        str +
        this._editText.slice(this._editCursor);
      this._editCursor++;
      this._renderEdit();
      return true;
    }

    return true;
  }

  // --- Rendering ---

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
    const visible = Math.min(MAX_VISIBLE, this._filtered.length, rows - 10);
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
        const marker = selected ? '\x1b[7m' : '';
        const reset = selected ? '\x1b[0m' : '';
        const editIcon = item.editable ? ' ✏' : '';
        const hint = item.hint ? `  \x1b[2m${item.hint}\x1b[0m` : '';
        const label = ` ${item.label}${editIcon}`;
        const visibleLabelLen = label.length;
        const hintLen = item.hint ? item.hint.length + 2 : 0;
        const pad = Math.max(0, inner - visibleLabelLen - hintLen);
        const padded = label + ' '.repeat(pad) + (item.hint ? `  ${item.hint}` : '');
        const truncated = padded.length > inner ? padded.slice(0, inner) : padded;
        lines.push(`${V}${marker}${truncated.padEnd(inner)}${reset}${V}`);
      }
    }

    // Footer with hints
    const footerHint = ' ↑↓ navigate   Enter select   Esc close ';
    const fPadL = Math.floor((inner - footerHint.length) / 2);
    const fPadR = Math.max(0, inner - footerHint.length - fPadL);
    lines.push(`${BL}${H.repeat(Math.max(0, fPadL))}\x1b[2m${footerHint}\x1b[0m${H.repeat(fPadR)}${BR}`);

    // Write overlay
    let out = '\x1b7'; // save cursor
    for (let i = 0; i < lines.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${lines[i]}`;
    }
    out += `\x1b[${startRow + 1};${startCol + 4 + filterDisplay.length}H`;
    process.stdout.write(out);
  }

  _renderEdit() {
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const inner = w - 2;
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    const lines = [];

    // Header — use item's editTitle if provided, else fall back to "Edit Macro N"
    const rawTitle = this._editItem.editTitle || `Edit Macro ${this._editItem.id.replace('macro-', '')}`;
    const title = ` ${rawTitle} `;
    const padLeft = Math.floor((inner - title.length) / 2);
    const padRight = Math.max(0, inner - title.length - padLeft);
    lines.push(`${TL}${H.repeat(Math.max(0, padLeft))}${title}${H.repeat(padRight)}${TR}`);

    // Text input field with cursor
    const maxTextWidth = inner - 2; // 1 space padding each side
    let textView = this._editText;
    let cursorInView = this._editCursor;
    if (textView.length > maxTextWidth) {
      const start = Math.max(0, this._editCursor - Math.floor(maxTextWidth / 2));
      textView = this._editText.slice(start, start + maxTextWidth);
      cursorInView = this._editCursor - start;
    }
    const before = textView.slice(0, cursorInView);
    const atCursor = textView[cursorInView] || ' ';
    const after = textView.slice(cursorInView + 1);
    const visibleLen = 1 + before.length + 1 + after.length; // space + before + cursor + after
    const padding = ' '.repeat(Math.max(0, inner - visibleLen));
    lines.push(`${V} ${before}\x1b[7m${atCursor}\x1b[0m${after}${padding}${V}`);

    lines.push(`${V}${H.repeat(inner)}${V}`);
    lines.push(`${V}${'\x1b[2m  Enter → save & run   Tab → save only\x1b[0m'.padEnd(inner + 9)}${V}`);
    lines.push(`${V}${'\x1b[2m  Esc → back to list\x1b[0m'.padEnd(inner + 9)}${V}`);

    // Footer
    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    let out = '\x1b7';
    for (let i = 0; i < lines.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${lines[i]}`;
    }
    // Position cursor in text field
    out += `\x1b[${startRow + 1};${startCol + 1 + before.length + 1}H`;
    process.stdout.write(out);
  }

  _close(result) {
    if (!this._open) return;
    this._open = false;
    this._editing = false;

    // Erase the palette area
    process.stdout.write('\x1b8');
    const totalRows = Math.min(MAX_VISIBLE + 6, (this._filtered.length || 1) + 6);
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));
    let clear = '';
    for (let i = 0; i < totalRows; i++) {
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
