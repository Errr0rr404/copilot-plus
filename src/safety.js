'use strict';

/**
 * safety — pre-send scanner that warns about secrets in a prompt.
 *
 * scan(text)        → [{ kind, match, redacted, severity }]
 * redact(text)      → same text with each match replaced by `[REDACTED:kind]`
 * confirm(findings) → tty Y/N prompt (returns Promise<'send' | 'redact' | 'cancel'>)
 *
 * Patterns are intentionally conservative — we tolerate false negatives more
 * than false positives, because nagging breaks flow. Regexes are derived
 * from public secret-scanning rule lists (GitHub Advanced Security, gitleaks,
 * detect-secrets) and trimmed to high-precision patterns.
 */

const readline = require('readline');

const RULES = [
  { kind: 'aws_access_key',   severity: 'high',   re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'aws_secret',       severity: 'high',   re: /(?<![A-Za-z0-9])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9])/g, contextRe: /aws|secret|key/i },
  { kind: 'github_token',     severity: 'high',   re: /\bgh[ps]_[A-Za-z0-9]{36,}\b/g },
  { kind: 'github_pat',       severity: 'high',   re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { kind: 'openai_key',       severity: 'high',   re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'anthropic_key',    severity: 'high',   re: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  { kind: 'google_api_key',   severity: 'high',   re: /\bAIza[0-9A-Za-z_-]{35,}/g },
  { kind: 'slack_token',      severity: 'high',   re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'stripe_secret',    severity: 'high',   re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  { kind: 'private_key',      severity: 'high',   re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: 'jwt',              severity: 'medium', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: 'generic_password', severity: 'low',    re: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"'`]{8,}/gi },
];

/**
 * Scan text for secrets.
 * @param {string} text
 * @param {object} [opts]
 * @param {string[]} [opts.disabledKinds] — kinds to skip
 * @returns {Array<{ kind: string, match: string, severity: string, index: number }>}
 */
function scan(text, opts = {}) {
  if (!text || typeof text !== 'string') return [];
  const disabled = new Set(opts.disabledKinds || []);
  const findings = [];
  for (const rule of RULES) {
    if (disabled.has(rule.kind)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      // Context-gated patterns require a nearby keyword in the same line.
      if (rule.contextRe) {
        const lineStart = text.lastIndexOf('\n', m.index) + 1;
        const lineEnd   = text.indexOf('\n', m.index);
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
        if (!rule.contextRe.test(line)) continue;
      }
      findings.push({ kind: rule.kind, match: m[0], severity: rule.severity, index: m.index });
    }
  }
  return findings;
}

/**
 * Return `text` with each finding replaced by a redaction tag.
 * Replaces from the end backwards so indices stay valid.
 */
function redact(text, findings) {
  if (!findings || !findings.length) return text;
  let out = text;
  const sorted = [...findings].sort((a, b) => b.index - a.index);
  for (const f of sorted) {
    out = out.slice(0, f.index) + `[REDACTED:${f.kind}]` + out.slice(f.index + f.match.length);
  }
  return out;
}

/**
 * Prompt the user about findings. Resolves with 'send' | 'redact' | 'cancel'.
 * Caller is responsible for putting stdin back into raw mode afterward.
 */
function confirm(findings) {
  const kinds = [...new Set(findings.map(f => f.kind))].join(', ');
  return new Promise(resolve => {
    if (!process.stdin.isTTY) return resolve('cancel');
    // Temporarily leave raw mode so readline can read a line normally
    const wasRaw = process.stdin.isRaw;
    try { process.stdin.setRawMode(false); } catch {}

    process.stdout.write(
      `\n⚠️  Your prompt looks like it contains secrets: ${kinds}\n` +
      `    [s] send anyway    [r] redact & send    [c] cancel  ▸ `
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', ans => {
      rl.close();
      try { if (wasRaw) process.stdin.setRawMode(true); } catch {}
      const a = ans.trim().toLowerCase();
      if (a === 's' || a === 'send')   return resolve('send');
      if (a === 'r' || a === 'redact') return resolve('redact');
      resolve('cancel');
    });
  });
}

module.exports = { scan, redact, confirm, RULES };
