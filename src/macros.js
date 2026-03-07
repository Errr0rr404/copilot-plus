'use strict';

/**
 * MacroManager — resolves macro keypresses to stored prompt text.
 *
 * Two encodings are supported:
 *   CSI u  (kitty/WezTerm)  — Ctrl+1–9: \x1b[49;5u … \x1b[57;5u
 *   Meta   (Apple Terminal) — Option+1–9: \x1b1 … \x1b9
 *                             Requires "Use Option as Meta Key" in Terminal → Settings → Keyboard
 */

const CSI_U_RE = /^\x1b\[(\d+);5u$/;
const META_DIGIT_RE = /^\x1b([1-9])$/;

class MacroManager {
  constructor(cfg) {
    this._macros = cfg.macros || {};
  }

  /**
   * Try to parse a raw input chunk as a macro key.
   * Returns the slot number (1–9) or null.
   */
  parseSlot(data) {
    const str = typeof data === 'string' ? data : data.toString();

    // CSI u: Ctrl+1–9 (kitty, WezTerm)
    const csi = CSI_U_RE.exec(str);
    if (csi) {
      const code = parseInt(csi[1], 10);
      if (code >= 49 && code <= 57) return code - 48;
    }

    // Meta+digit: Option+1–9 (Apple Terminal with "Use Option as Meta Key")
    const meta = META_DIGIT_RE.exec(str);
    if (meta) return parseInt(meta[1], 10);

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
