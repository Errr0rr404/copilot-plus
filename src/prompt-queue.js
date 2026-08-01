'use strict';

/**
 * prompt-queue — in-memory FIFO of prompts waiting while the agent is busy.
 *
 * Persistence is optional (session-only by default). maxSize from config.
 */

const DEFAULT_MAX = 20;

class PromptQueue {
  constructor(opts = {}) {
    this.maxSize = opts.maxSize || DEFAULT_MAX;
    this._items = [];
  }

  get length() { return this._items.length; }

  /** Enqueue. Returns { ok, index, dropped? }. */
  enqueue(text, meta = {}) {
    const t = String(text || '').trim();
    if (!t) return { ok: false, reason: 'empty' };
    if (this._items.length >= this.maxSize) {
      return { ok: false, reason: 'full', maxSize: this.maxSize };
    }
    this._items.push({
      text: t,
      ts: new Date().toISOString(),
      ...meta,
    });
    return { ok: true, index: this._items.length - 1, size: this._items.length };
  }

  /** Dequeue oldest. Returns item or null. */
  dequeue() {
    return this._items.shift() || null;
  }

  peek() {
    return this._items[0] || null;
  }

  list() {
    return this._items.slice();
  }

  /** Move item at index to position (0 = next to send). */
  reorder(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this._items.length) return false;
    if (toIndex < 0 || toIndex >= this._items.length) return false;
    const [item] = this._items.splice(fromIndex, 1);
    this._items.splice(toIndex, 0, item);
    return true;
  }

  remove(index) {
    if (index < 0 || index >= this._items.length) return false;
    this._items.splice(index, 1);
    return true;
  }

  clear() {
    this._items = [];
  }
}

module.exports = { PromptQueue, DEFAULT_MAX };
