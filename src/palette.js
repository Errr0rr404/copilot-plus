'use strict';

/**
 * CommandPalette — terminal overlay that lists available actions.
 *
 * Highlights:
 *   - fzf-style fuzzy ranking: type "vrec" → "Voice Recording" jumps to top.
 *   - Recent items boost: most-recently selected action ids float up.
 *   - Inline editing: items with `editable: true` and `value` open an edit
 *     view; resolves with `{ id, value, run }` where run=true on Enter,
 *     run=false on Tab.
 *   - Theme-aware via src/theme.js.
 *
 * While open, all stdin input is consumed by the palette.
 */

const fs    = require('fs');
const os    = require('os');
const path  = require('path');
const theme = require('./theme');

const RECENTS_PATH = path.join(os.homedir(), '.copilot', 'palette-recents.json');
const PALETTE_WIDTH = 56;
const MAX_VISIBLE   = 12;
const MAX_RECENTS   = 12;

const TL = '╭', TR = '╮', BL = '╰', BR = '╯', H = '─', V = '│';

class CommandPalette {
  constructor(opts = {}) {
    this._open = false;
    this._resolve = null;
    this._filter = '';
    this._selectedIdx = 0;
    this._actions = [];
    this._filtered = [];
    this._editing = false;
    this._editItem = null;
    this._editText = '';
    this._editCursor = 0;
    this._renderedRows = 0;       // remember last frame height for clean close
    this._cfg = opts.cfg || {};
    this._recents = _loadRecents();
  }

  get isOpen() { return this._open; }

  /** Update active config (called by the wrapper when config changes). */
  setConfig(cfg) { this._cfg = cfg || {}; }

  /**
   * Open the palette and return a Promise that resolves to:
   *   - null                      — dismissed
   *   - string                    — regular action id selected
   *   - {id, value, run: bool}    — editable item saved
   */
  open(actions) {
    if (this._open) return Promise.resolve(null);
    this._open = true;
    this._editing = false;
    this._actions = actions || [];
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

    if (str === '\x1b') { this._close(null); return true; }                // Esc
    if (str === '\r' || str === '\n') {                                    // Enter
      const item = this._filtered[this._selectedIdx];
      if (!item) { this._close(null); return true; }
      if (item.editable) this._startEdit(item);
      else { this._rememberRecent(item.id); this._close(item.id); }
      return true;
    }
    if (str === '\x1b[A' || str === '\x10') {                              // ↑ / Ctrl+P
      this._selectedIdx = Math.max(0, this._selectedIdx - 1);
      this._render(); return true;
    }
    if (str === '\x1b[B' || str === '\x0e') {                              // ↓ / Ctrl+N
      this._selectedIdx = Math.min(this._filtered.length - 1, this._selectedIdx + 1);
      this._render(); return true;
    }
    if (str === '\x7f' || str === '\x08') {                                // Backspace
      if (this._filter.length > 0) {
        this._filter = this._filter.slice(0, -1);
        this._selectedIdx = 0;
        this._applyFilter();
        this._render();
      }
      return true;
    }
    if (str === '\x03') { this._close(null); return true; }                // Ctrl+C
    if (str === '\x15') {                                                  // Ctrl+U clears
      this._filter = '';
      this._selectedIdx = 0;
      this._applyFilter();
      this._render();
      return true;
    }
    if (str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      this._filter += str;
      this._selectedIdx = 0;
      this._applyFilter();
      this._render();
      return true;
    }
    return true;
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
    if (str === '\x1b') { this._editing = false; this._render(); return true; }
    if (str === '\r' || str === '\n') {
      this._rememberRecent(this._editItem.id);
      this._close({ id: this._editItem.id, value: this._editText, run: true });
      return true;
    }
    if (str === '\t' || str === '\x13') {                                  // Tab / Ctrl+S
      this._close({ id: this._editItem.id, value: this._editText, run: false });
      return true;
    }
    if (str === '\x03') { this._close(null); return true; }
    if (str === '\x1b[D') { this._editCursor = Math.max(0, this._editCursor - 1); this._renderEdit(); return true; }
    if (str === '\x1b[C') { this._editCursor = Math.min(this._editText.length, this._editCursor + 1); this._renderEdit(); return true; }
    if (str === '\x1b[H' || str === '\x01') { this._editCursor = 0; this._renderEdit(); return true; }
    if (str === '\x1b[F' || str === '\x05') { this._editCursor = this._editText.length; this._renderEdit(); return true; }
    if (str === '\x7f' || str === '\x08') {
      if (this._editCursor > 0) {
        this._editText = this._editText.slice(0, this._editCursor - 1) + this._editText.slice(this._editCursor);
        this._editCursor--;
        this._renderEdit();
      }
      return true;
    }
    if (str === '\x1b[3~') {
      if (this._editCursor < this._editText.length) {
        this._editText = this._editText.slice(0, this._editCursor) + this._editText.slice(this._editCursor + 1);
        this._renderEdit();
      }
      return true;
    }
    if (str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
      this._editText = this._editText.slice(0, this._editCursor) + str + this._editText.slice(this._editCursor);
      this._editCursor++;
      this._renderEdit();
      return true;
    }
    return true;
  }

  // --- Filter / ranking ---

  _applyFilter() {
    const q = this._filter.toLowerCase();
    if (!q) {
      // Default order: recents first, then everything else in original order
      const recentSet = new Set(this._recents);
      const recentItems   = [];
      const remainingItems = [];
      for (const a of this._actions) {
        if (recentSet.has(a.id)) recentItems.push(a);
        else remainingItems.push(a);
      }
      // Within recentItems, preserve recents order (most recent first)
      recentItems.sort((a, b) =>
        this._recents.indexOf(a.id) - this._recents.indexOf(b.id));
      this._filtered = [...recentItems, ...remainingItems];
      return;
    }
    const scored = [];
    for (const a of this._actions) {
      const s = _fuzzyScore(a.label.toLowerCase(), q);
      if (s !== null) {
        // Recents get a slight bonus
        const recentBoost = this._recents.includes(a.id) ? 5 : 0;
        scored.push({ a, s: s + recentBoost });
      }
    }
    scored.sort((x, y) => y.s - x.s);
    this._filtered = scored.map(x => x.a);
  }

  _rememberRecent(id) {
    if (!id) return;
    this._recents = [id, ...this._recents.filter(x => x !== id)].slice(0, MAX_RECENTS);
    _saveRecents(this._recents);
  }

  // --- Rendering ---

  _render() {
    const t = theme.get(this._cfg);
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const inner = w - 2;
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    const lines = [];

    // Header
    const subtitle = this._filter ? ` (${this._filtered.length} match) ` : ' ';
    const title = ` Command Palette${subtitle}`;
    const padLeft  = Math.max(0, Math.floor((inner - title.length) / 2));
    const padRight = Math.max(0, inner - title.length - padLeft);
    lines.push(`${TL}${H.repeat(padLeft)}${t.bold}${title}${t.reset}${H.repeat(padRight)}${TR}`);

    // Filter input
    const filterDisplay = this._filter || '';
    const placeholder = filterDisplay ? '' : `${t.dim}type to filter…${t.reset}`;
    const prompt = ` > ${filterDisplay}${placeholder}`;
    lines.push(`${V}${_padVis(prompt, inner)}${V}`);
    lines.push(`${V}${H.repeat(inner)}${V}`);

    // Visible items (scrolling window)
    const maxRowsForList = Math.max(3, rows - 12);
    const visible = Math.min(MAX_VISIBLE, this._filtered.length, maxRowsForList);

    let scrollTop = 0;
    if (this._selectedIdx >= scrollTop + visible) scrollTop = this._selectedIdx - visible + 1;
    if (this._selectedIdx < scrollTop) scrollTop = this._selectedIdx;

    if (this._filtered.length === 0) {
      lines.push(`${V}${_padVis(`  ${t.dim}(no matches)${t.reset}`, inner)}${V}`);
    } else {
      for (let i = scrollTop; i < scrollTop + visible && i < this._filtered.length; i++) {
        const item = this._filtered[i];
        const selected = i === this._selectedIdx;
        const open  = selected ? t.select_bg : '';
        const close = selected ? t.reset      : '';
        const editIcon = item.editable ? ' ✏' : '';
        const hint = item.hint ? `${t.dim}${item.hint}${t.reset}` : '';
        const left  = ` ${item.label}${editIcon}`;
        const gap = Math.max(2, inner - _vlen(left) - _vlen(hint) - 1);
        const row = `${left}${' '.repeat(gap)}${hint} `;
        lines.push(`${V}${open}${_padVis(row, inner)}${close}${V}`);
      }
    }

    // Footer
    const footerHint = ' ↑↓ navigate   Enter select   ✏ edit   Esc close ';
    const fPadL = Math.max(0, Math.floor((inner - footerHint.length) / 2));
    const fPadR = Math.max(0, inner - footerHint.length - fPadL);
    lines.push(`${BL}${H.repeat(fPadL)}${t.dim}${footerHint}${t.reset}${H.repeat(fPadR)}${BR}`);

    // Write overlay
    let out = '\x1b7'; // save cursor
    for (let i = 0; i < lines.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${lines[i]}`;
    }
    out += `\x1b[${startRow + 1};${startCol + 4 + filterDisplay.length}H`;
    process.stdout.write(out);
    this._renderedRows = lines.length;
  }

  _renderEdit() {
    const t = theme.get(this._cfg);
    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const inner = w - 2;
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    const lines = [];

    const rawTitle = this._editItem.editTitle || `Edit ${this._editItem.id}`;
    const title = ` ${rawTitle} `;
    const padLeft  = Math.max(0, Math.floor((inner - title.length) / 2));
    const padRight = Math.max(0, inner - title.length - padLeft);
    lines.push(`${TL}${H.repeat(padLeft)}${t.bold}${title}${t.reset}${H.repeat(padRight)}${TR}`);

    const maxTextWidth = inner - 2;
    let textView = this._editText;
    let cursorInView = this._editCursor;
    if (textView.length > maxTextWidth) {
      const start = Math.max(0, this._editCursor - Math.floor(maxTextWidth / 2));
      textView = this._editText.slice(start, start + maxTextWidth);
      cursorInView = this._editCursor - start;
    }
    const before  = textView.slice(0, cursorInView);
    const atCursor = textView[cursorInView] || ' ';
    const after   = textView.slice(cursorInView + 1);
    const visibleLen = 1 + before.length + 1 + after.length;
    const padding = ' '.repeat(Math.max(0, inner - visibleLen));
    lines.push(`${V} ${before}${t.select_bg}${atCursor}${t.reset}${after}${padding}${V}`);

    lines.push(`${V}${H.repeat(inner)}${V}`);
    lines.push(`${V}${_padVis(`${t.dim}  Enter → save & run   Tab → save only${t.reset}`, inner)}${V}`);
    lines.push(`${V}${_padVis(`${t.dim}  Esc → back   Ctrl+C → cancel${t.reset}`, inner)}${V}`);
    lines.push(`${BL}${H.repeat(inner)}${BR}`);

    let out = '\x1b7';
    for (let i = 0; i < lines.length; i++) {
      out += `\x1b[${startRow + i};${startCol}H${lines[i]}`;
    }
    out += `\x1b[${startRow + 1};${startCol + 1 + before.length + 1}H`;
    process.stdout.write(out);
    this._renderedRows = lines.length;
  }

  _close(result) {
    if (!this._open) return;
    this._open = false;
    this._editing = false;

    const cols = process.stdout.columns || 80;
    const w = Math.min(PALETTE_WIDTH, cols - 4);
    const startRow = 2;
    const startCol = Math.max(1, Math.floor((cols - w) / 2));

    // Erase exactly the rows we drew last frame — fixes previous bug where
    // closing left ghost lines below the box on tall renders.
    let clear = '';
    for (let i = 0; i < this._renderedRows; i++) {
      clear += `\x1b[${startRow + i};${startCol}H${' '.repeat(w)}`;
    }
    clear += '\x1b8';   // restore cursor
    process.stdout.write(clear);
    this._renderedRows = 0;

    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(result);
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Visible length of a string (ignoring ANSI codes). */
function _vlen(s) { return String(s).replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '').length; }

/** Pad with spaces using visible-length math. */
function _padVis(s, w) { return s + ' '.repeat(Math.max(0, w - _vlen(s))); }

/**
 * Lightweight fuzzy scorer (sub-sequence with positional bonus).
 * Returns null if `query` is not a subsequence of `text`.
 *
 *  +consecutiveBonus  for each match adjacent to the previous match
 *  +startBonus        for matches at the start of words or string
 *  -gapPenalty        for each non-matching char between matches
 */
function _fuzzyScore(text, query) {
  if (!query) return 0;
  let score = 0;
  let ti = 0;
  let prevIdx = -1;
  for (let qi = 0; qi < query.length; qi++) {
    const qc = query[qi];
    let found = -1;
    while (ti < text.length) {
      if (text[ti] === qc) { found = ti; ti++; break; }
      ti++;
    }
    if (found === -1) return null;
    if (prevIdx === found - 1) score += 8;                                // consecutive
    if (found === 0 || /[\s\-_/]/.test(text[found - 1])) score += 4;      // word start
    const gap = found - (prevIdx + 1);
    score -= Math.min(gap, 6);                                            // gap penalty
    prevIdx = found;
  }
  // Shorter matches outrank longer ones for the same query
  score += Math.max(0, 30 - text.length);
  return score;
}

function _loadRecents() {
  try { return JSON.parse(fs.readFileSync(RECENTS_PATH, 'utf8')) || []; } catch { return []; }
}

function _saveRecents(list) {
  try {
    fs.mkdirSync(path.dirname(RECENTS_PATH), { recursive: true });
    fs.writeFileSync(RECENTS_PATH, JSON.stringify(list));
  } catch {}
}

module.exports = CommandPalette;
module.exports._fuzzyScore = _fuzzyScore;  // exposed for tests
