'use strict';

/**
 * plugin — load user plugins and dispatch lifecycle hooks.
 *
 * A plugin is a JS file in ~/.copilot/plugins/ that exports either a single
 * object with hook callbacks or a function returning that object. Hooks are
 * fired synchronously; if a hook returns a value it can mutate the data
 * passed in. The wrapper owns the contract and gracefully isolates errors.
 *
 * Supported hooks:
 *   beforeSend(payload)   — `{ text, kind: 'prompt'|'macro'|'voice'|'shell', cancel: bool, replaceWith?: string }`
 *   afterReceive(chunk)   — raw PTY chunk (string)
 *   afterPrompt(record)   — same record as written to history
 *   onModelSwitch({slot, model})
 *   onBookmark(bookmark)
 *
 * Loading is best-effort — a broken plugin logs a warning but never breaks
 * the wrapper. Plugins can be reloaded via the palette (future) by calling
 * `reload()` on the manager.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const logger = require('./logger');

const PLUGINS_DIR = path.join(os.homedir(), '.copilot', 'plugins');

const HOOKS = ['beforeSend', 'afterReceive', 'afterPrompt', 'onModelSwitch', 'onBookmark'];

class PluginManager {
  constructor() {
    this._plugins = [];
  }

  /** Load every *.js / *.cjs file in ~/.copilot/plugins/. */
  load(api = {}) {
    this._plugins = [];
    if (!fs.existsSync(PLUGINS_DIR)) return;
    let files;
    try { files = fs.readdirSync(PLUGINS_DIR).filter(f => /\.c?js$/.test(f)); }
    catch { return; }
    for (const f of files) {
      const full = path.join(PLUGINS_DIR, f);
      try {
        // Clear require cache so reload() picks up edits.
        delete require.cache[require.resolve(full)];
        let mod = require(full);
        if (typeof mod === 'function') mod = mod(api);
        if (mod && typeof mod === 'object') {
          this._plugins.push({ name: mod.name || f, mod });
          logger.info(`plugin loaded: ${mod.name || f}`);
        }
      } catch (err) {
        logger.warn(`plugin failed to load: ${f}`, err);
      }
    }
  }

  /** Reload all plugins (used by Ctrl+K → Reload Plugins). */
  reload(api) {
    this.load(api);
  }

  has(hook) {
    return this._plugins.some(p => typeof p.mod[hook] === 'function');
  }

  list() {
    return this._plugins.map(p => p.name);
  }

  /**
   * Run a hook on each loaded plugin. Errors are logged and isolated so one
   * broken plugin can't break the wrapper. Returns the (possibly mutated)
   * payload back to the caller.
   */
  emit(hook, payload) {
    if (!HOOKS.includes(hook)) return payload;
    for (const p of this._plugins) {
      const fn = p.mod[hook];
      if (typeof fn !== 'function') continue;
      try {
        const out = fn(payload);
        if (out !== undefined) payload = out;
      } catch (err) {
        logger.warn(`plugin "${p.name}" threw in ${hook}:`, err);
      }
    }
    return payload;
  }
}

module.exports = { PluginManager, PLUGINS_DIR, HOOKS };
