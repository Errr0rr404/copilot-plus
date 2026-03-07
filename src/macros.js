'use strict';

/**
 * MacroManager — resolves Ctrl+1–9 keypresses to stored prompt text.
 *
 * Ctrl+1–9 are detected via CSI u encoding:
 *   Ctrl+1 = \x1b[49;5u   (49 = ASCII '1')
 *   ...
 *   Ctrl+9 = \x1b[57;5u   (57 = ASCII '9')
 */

const CSI_U_RE = /^\x1b\[(\d+);5u$/;

class MacroManager {
  constructor(cfg) {
    this._macros = cfg.macros || {};
  }

  /**
   * Try to parse a raw input chunk as a Ctrl+N macro key.
   * Returns the slot number (1–9) or null.
   */
  parseSlot(data) {
    const str = typeof data === 'string' ? data : data.toString();
    const m = CSI_U_RE.exec(str);
    if (!m) return null;
    const code = parseInt(m[1], 10);
    if (code >= 49 && code <= 57) return code - 48; // 49='1' → slot 1
    return null;
  }

  /** Get the prompt text for a macro slot (1–9). Returns '' if unset. */
  get(slot) {
    return this._macros[slot] || '';
  }

  /** Set a macro slot to a prompt string (in-memory only — caller should persist config). */
  set(slot, prompt) {
    this._macros[slot] = prompt;
  }

  /** Return all non-empty macros as [{ slot, prompt }]. */
  list() {
    const result = [];
    for (let i = 1; i <= 9; i++) {
      const prompt = this._macros[i];
      if (prompt) result.push({ slot: i, prompt });
    }
    return result;
  }
}

module.exports = MacroManager;
