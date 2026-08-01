'use strict';

/**
 * theme — color palettes for overlays (palette, cheatsheet) and the monitor.
 *
 * Each theme exports a set of ANSI sequences keyed by semantic role so the
 * UI layer never hard-codes a color. Themes are resolved by name from config
 * (`config.theme`) with env-var override (`COPILOT_PLUS_THEME=light`).
 *
 * The `auto` theme inherits the terminal's default foreground (no color
 * sequences) — best for transparent / themed terminals.
 *
 * Add a new theme by appending to THEMES below; the palette/monitor pick up
 * the new name automatically.
 */

const E = '\x1b';
const R = `${E}[0m`;

// 256-color escape helpers
const fg256 = n => `${E}[38;5;${n}m`;
const bg256 = n => `${E}[48;5;${n}m`;

const THEMES = {
  dark: {
    fg:        '',                 // default terminal fg
    dim:       `${E}[2m`,
    bold:      `${E}[1m`,
    reset:     R,
    accent:    `${E}[36m`,         // cyan
    success:   `${E}[32m`,         // green
    warn:      `${E}[33m`,         // yellow
    error:     `${E}[31m`,         // red
    info:      `${E}[34m`,         // blue
    select_bg: `${E}[7m`,          // reverse video for selection
    border:    `${E}[2m`,
    quota_ok:  `${E}[2m`,
    quota_hi:  `${E}[33m`,
  },
  light: {
    fg:        '',
    dim:       `${E}[2m`,
    bold:      `${E}[1m`,
    reset:     R,
    accent:    `${E}[34m`,         // blue
    success:   `${E}[32m`,
    warn:      `${E}[33m`,
    error:     `${E}[31m`,
    info:      `${E}[36m`,
    select_bg: `${E}[7m`,
    border:    `${E}[2m`,
    quota_ok:  `${E}[2m`,
    quota_hi:  `${E}[33m`,
  },
  solarized: {
    fg:        fg256(244),         // base0
    dim:       fg256(240),
    bold:      `${E}[1m`,
    reset:     R,
    accent:    fg256(37),          // cyan
    success:   fg256(64),          // green
    warn:      fg256(136),         // yellow
    error:     fg256(160),         // red
    info:      fg256(33),          // blue
    select_bg: bg256(235),
    border:    fg256(240),
    quota_ok:  fg256(240),
    quota_hi:  fg256(136),
  },
  monokai: {
    fg:        '',
    dim:       `${E}[2m`,
    bold:      `${E}[1m`,
    reset:     R,
    accent:    fg256(141),         // purple
    success:   fg256(148),         // green
    warn:      fg256(214),         // orange
    error:     fg256(197),         // pink-red
    info:      fg256(81),          // sky
    select_bg: bg256(238),
    border:    fg256(240),
    quota_ok:  `${E}[2m`,
    quota_hi:  fg256(214),
  },
  auto: {
    fg:        '',
    dim:       `${E}[2m`,
    bold:      `${E}[1m`,
    reset:     R,
    accent:    '',
    success:   '',
    warn:      `${E}[33m`,
    error:     `${E}[31m`,
    info:      '',
    select_bg: `${E}[7m`,
    border:    `${E}[2m`,
    quota_ok:  `${E}[2m`,
    quota_hi:  `${E}[33m`,
  },
};

let _current = null;

/** Pick the theme for the current process. */
function get(cfg) {
  if (_current) return _current;
  const name = (process.env.COPILOT_PLUS_THEME
    || (cfg && cfg.theme)
    || 'dark').toLowerCase();
  _current = THEMES[name] || THEMES.dark;
  _current.name = THEMES[name] ? name : 'dark';
  return _current;
}

/** Override the active theme (used by --preferences). */
function set(name) {
  const t = THEMES[String(name || '').toLowerCase()];
  if (t) {
    _current = t;
    _current.name = String(name).toLowerCase();
  }
}

function names() {
  return Object.keys(THEMES);
}

module.exports = { get, set, names, THEMES };
