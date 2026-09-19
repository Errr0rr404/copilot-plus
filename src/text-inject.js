'use strict';

/**
 * Helpers for injecting user text and file paths into the Copilot prompt.
 * Newlines are treated as Enter by Copilot, so we flatten them. Paths with
 * spaces must be quoted or the @-attachment is split on the first space.
 */

function sanitizeInjectedText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ');
}

function formatAtPath(abs) {
  const p = String(abs || '');
  if (!p) return '';
  return /\s/.test(p) ? `@"${p}" ` : `@${p} `;
}

module.exports = { sanitizeInjectedText, formatAtPath };
