'use strict';

/**
 * workflows — multi-step prompt chains loaded from ~/.copilot/workflows/
 *
 * Supports .json and a minimal .yaml subset:
 *
 *   name: Fix & Test
 *   steps:
 *     - prompt: "Run the failing tests"
 *       wait: true
 *     - prompt: "Fix them"
 *       wait: true
 *
 * Variable expansion: {{cwd}}, {{git_branch}}, {{clipboard}}, {{date}}
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_DIR = path.join(os.homedir(), '.copilot', 'workflows');

function workflowsDir(cfg) {
  if (cfg && cfg.workflowsDir) return path.resolve(cfg.workflowsDir);
  return DEFAULT_DIR;
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

/**
 * Minimal YAML parser for our workflow subset only.
 * Handles: top-level name/description, steps list with prompt/wait strings/bools.
 */
function parseSimpleYaml(text) {
  const lines = String(text).split(/\r?\n/);
  const result = { steps: [] };
  let inSteps = false;
  let current = null;

  for (let raw of lines) {
    if (/^\s*#/.test(raw) || !raw.trim()) continue;
    // strip inline comments carefully only at top-level keys
    if (!inSteps && raw.includes('#') && !/["']/.test(raw)) {
      raw = raw.replace(/\s+#.*$/, '');
    }

    if (/^steps\s*:\s*$/.test(raw.trim()) || /^steps\s*:\s*\[/.test(raw.trim())) {
      inSteps = true;
      continue;
    }

    if (!inSteps) {
      const m = raw.match(/^(\w+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key === 'name' || key === 'description') result[key] = val;
      continue;
    }

    // step start: "  - prompt: ..." or "  -"
    const stepStart = raw.match(/^\s*-\s*(?:prompt\s*:\s*(.*))?$/);
    if (stepStart) {
      if (current) result.steps.push(current);
      current = { prompt: '', wait: true };
      if (stepStart[1] !== undefined) {
        let p = stepStart[1].trim();
        if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
          p = p.slice(1, -1);
        }
        current.prompt = p;
      }
      continue;
    }

    if (!current) continue;
    const field = raw.match(/^\s+(prompt|wait)\s*:\s*(.*)$/);
    if (!field) continue;
    let val = field[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (field[1] === 'wait') {
      current.wait = !/^(false|no|0)$/i.test(val);
    } else {
      current.prompt = val;
    }
  }
  if (current) result.steps.push(current);
  return result;
}

function loadFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let data;
  if (ext === '.json') {
    data = JSON.parse(raw);
  } else {
    data = parseSimpleYaml(raw);
  }
  if (!data || !Array.isArray(data.steps)) {
    throw new Error('workflow must have a steps array');
  }
  data.steps = data.steps
    .map(s => ({
      prompt: String((s && s.prompt) || '').trim(),
      wait: s && s.wait === false ? false : true,
    }))
    .filter(s => s.prompt);
  if (!data.steps.length) throw new Error('workflow has no non-empty steps');
  if (!data.name) data.name = path.basename(filePath, path.extname(filePath));
  data.file = filePath;
  return data;
}

function list(cfg) {
  const dir = workflowsDir(cfg);
  ensureDir(dir);
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => /\.(ya?ml|json)$/i.test(f));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      const w = loadFile(fp);
      out.push({ name: w.name, description: w.description || '', steps: w.steps.length, file: fp });
    } catch {
      out.push({ name: f, description: '(invalid)', steps: 0, file: fp, invalid: true });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function loadByName(name, cfg) {
  const all = list(cfg);
  const hit = all.find(w => w.name === name || path.basename(w.file) === name
    || path.basename(w.file, path.extname(w.file)) === name);
  if (!hit || hit.invalid) return null;
  return loadFile(hit.file);
}

function expandVars(text, vars = {}) {
  const map = Object.assign({
    cwd: process.cwd(),
    date: new Date().toISOString().slice(0, 10),
    git_branch: '',
    clipboard: '',
  }, vars);

  if (!map.git_branch) {
    try {
      map.git_branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
      }).trim();
    } catch {
      map.git_branch = '';
    }
  }

  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return map[key] != null ? String(map[key]) : '';
  });
}

/**
 * Run a workflow asynchronously.
 * opts.send(text) — inject + submit a prompt
 * opts.waitForSettle() — Promise that resolves when the response settles
 * opts.onStep(i, total, step) — progress callback
 * opts.isCancelled() — optional abort check
 */
async function run(workflow, opts = {}) {
  const steps = workflow.steps || [];
  const vars = opts.vars || {};
  for (let i = 0; i < steps.length; i++) {
    if (opts.isCancelled && opts.isCancelled()) {
      return { ok: false, reason: 'cancelled', completed: i };
    }
    const step = steps[i];
    const prompt = expandVars(step.prompt, vars);
    if (opts.onStep) opts.onStep(i, steps.length, { ...step, prompt });
    if (opts.send) await Promise.resolve(opts.send(prompt));
    if (step.wait !== false && opts.waitForSettle) {
      await opts.waitForSettle();
    }
  }
  return { ok: true, completed: steps.length };
}

module.exports = {
  DEFAULT_DIR,
  workflowsDir,
  ensureDir,
  parseSimpleYaml,
  loadFile,
  list,
  loadByName,
  expandVars,
  run,
};
