'use strict';

/**
 * handoff — write a structured markdown snapshot when quota is nearly exhausted
 * so the user can resume later (or in another tool) without losing context.
 *
 * Storage: ~/.copilot/handoffs/<timestamp>.md
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const HANDOFFS_DIR = path.join(os.homedir(), '.copilot', 'handoffs');

function _ensureDir() {
  try { fs.mkdirSync(HANDOFFS_DIR, { recursive: true }); } catch {}
}

/**
 * Write a handoff document.
 * opts: { cwd, model, prompts, lastResponse, quota, reason, extra }
 * Returns absolute path or null.
 */
function write(opts = {}) {
  _ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(HANDOFFS_DIR, `${ts}.md`);
  const prompts = Array.isArray(opts.prompts) ? opts.prompts : [];
  const lines = [
    '# copilot+ session handoff',
    '',
    `- **When:** ${new Date().toISOString()}`,
    `- **Reason:** ${opts.reason || 'quota threshold'}`,
    `- **CWD:** ${opts.cwd || process.cwd()}`,
    `- **Model:** ${opts.model || 'unknown'}`,
  ];
  if (opts.quota && opts.quota.premium) {
    const p = opts.quota.premium;
    lines.push(`- **Premium:** ${p.used}/${p.entitlement} used`);
  }
  if (opts.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      lines.push(`- **${k}:** ${v}`);
    }
  }
  lines.push('', '## Recent prompts', '');
  if (!prompts.length) {
    lines.push('_No prompts captured._');
  } else {
    prompts.forEach((p, i) => {
      lines.push(`### ${i + 1}`);
      lines.push('```');
      lines.push(String(p).slice(0, 4000));
      lines.push('```', '');
    });
  }
  if (opts.lastResponse) {
    lines.push('## Last response (truncated)', '');
    lines.push('```');
    lines.push(String(opts.lastResponse).slice(0, 8000));
    lines.push('```', '');
  }
  lines.push('## Resume tips', '');
  lines.push('1. Wait for quota reset, or switch to a cheaper model.');
  lines.push('2. Start a new session in the same CWD and paste the relevant prompts.');
  lines.push('3. Browse handoffs: `ls ~/.copilot/handoffs/`');
  lines.push('');

  try {
    fs.writeFileSync(file, lines.join('\n'));
    // pointer to latest
    try {
      fs.writeFileSync(path.join(HANDOFFS_DIR, 'latest.md'), lines.join('\n'));
    } catch {}
    return file;
  } catch {
    return null;
  }
}

function list(limit = 20) {
  _ensureDir();
  let files;
  try {
    files = fs.readdirSync(HANDOFFS_DIR)
      .filter(f => f.endsWith('.md') && f !== 'latest.md')
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
  return files.map(f => ({
    name: f,
    path: path.join(HANDOFFS_DIR, f),
    mtime: (() => { try { return fs.statSync(path.join(HANDOFFS_DIR, f)).mtime; } catch { return null; } })(),
  }));
}

function latestPath() {
  const p = path.join(HANDOFFS_DIR, 'latest.md');
  return fs.existsSync(p) ? p : (list(1)[0] && list(1)[0].path) || null;
}

module.exports = { write, list, latestPath, HANDOFFS_DIR };
