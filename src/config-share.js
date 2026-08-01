'use strict';

/**
 * config-share — export/import a portable copilot+ package.
 *
 * Export includes: macros, models, theme, safety, notifications, queue,
 * usage prefs, voice prefs, shellPrefix, contextHotkey, wakeWord phrase.
 * Never exports: API tokens, absolute audio device paths that look secret.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const PACKAGE_VERSION = 1;

const EXPORT_KEYS = [
  'macros', 'workhorseModels', 'autoModels', 'theme',
  'voiceLanguage', 'voicePreview', 'autoSubmit',
  'shellPrefix', 'historyEnabled', 'tts', 'safety',
  'contextHotkey', 'notifications', 'queue', 'usage',
  'wakeWord',
];

function _pick(cfg) {
  const out = {};
  for (const k of EXPORT_KEYS) {
    if (cfg[k] !== undefined) out[k] = cfg[k];
  }
  // Strip runtime-ish wakeWord noise if present
  if (out.wakeWord) {
    out.wakeWord = {
      enabled: !!out.wakeWord.enabled,
      phrase: out.wakeWord.phrase || 'hey copilot',
      chunkSeconds: out.wakeWord.chunkSeconds || 2,
    };
  }
  return out;
}

/**
 * Build an export package object (does not write).
 * opts.includeWorkflows — embed workflow file contents
 */
function buildPackage(cfg, opts = {}) {
  const pkg = {
    format: 'copilot-plus-config',
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    host: os.hostname(),
    config: _pick(cfg || {}),
  };

  if (opts.includeWorkflows) {
    const dir = path.join(os.homedir(), '.copilot', 'workflows');
    pkg.workflows = {};
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(ya?ml|json)$/i.test(f)) continue;
        try {
          pkg.workflows[f] = fs.readFileSync(path.join(dir, f), 'utf8');
        } catch {}
      }
    } catch {}
  }

  return pkg;
}

function exportToFile(cfg, filePath, opts = {}) {
  const pkg = buildPackage(cfg, opts);
  const dest = filePath || path.join(process.cwd(), `copilot-plus-config-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
  return { path: path.resolve(dest), package: pkg };
}

/**
 * Merge strategy:
 *  - overwrite: replace exported keys entirely
 *  - merge (default): deep-merge objects, keep local values for empty remote macros/models
 */
function applyPackage(pkg, currentCfg, opts = {}) {
  if (!pkg || pkg.format !== 'copilot-plus-config') {
    throw new Error('invalid package: expected format copilot-plus-config');
  }
  const incoming = pkg.config || {};
  const next = Object.assign({}, currentCfg);
  const overwrite = !!opts.overwrite;

  for (const k of EXPORT_KEYS) {
    if (incoming[k] === undefined) continue;
    if (overwrite) {
      next[k] = incoming[k];
      continue;
    }
    if (incoming[k] !== null && typeof incoming[k] === 'object' && !Array.isArray(incoming[k])
        && next[k] !== null && typeof next[k] === 'object' && !Array.isArray(next[k])) {
      next[k] = Object.assign({}, next[k], incoming[k]);
    } else {
      next[k] = incoming[k];
    }
  }

  // Persist patch subset only
  const patch = {};
  for (const k of EXPORT_KEYS) {
    if (incoming[k] !== undefined) patch[k] = next[k];
  }

  const workflowsWritten = [];
  if (pkg.workflows && typeof pkg.workflows === 'object') {
    const dir = path.join(os.homedir(), '.copilot', 'workflows');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(pkg.workflows)) {
      const safe = path.basename(name);
      if (!/\.(ya?ml|json)$/i.test(safe)) continue;
      const fp = path.join(dir, safe);
      if (!overwrite && fs.existsSync(fp)) continue;
      fs.writeFileSync(fp, body);
      workflowsWritten.push(safe);
    }
  }

  return { config: next, patch, workflowsWritten };
}

function importFromFile(filePath, currentCfg, opts = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const pkg = JSON.parse(raw);
  return applyPackage(pkg, currentCfg, opts);
}

module.exports = {
  PACKAGE_VERSION,
  EXPORT_KEYS,
  buildPackage,
  exportToFile,
  applyPackage,
  importFromFile,
};
