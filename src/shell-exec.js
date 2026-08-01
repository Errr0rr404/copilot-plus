'use strict';

/**
 * shell-exec — runs a shell command and returns its captured output.
 *
 * The wrapper detects lines starting with `!` (after Enter) and routes them
 * here. We never `spawn(cmd, { shell: true })` with user input directly —
 * instead the user's full line is passed to the platform shell as a SINGLE
 * argv element, which is then interpreted by the shell. That keeps quoting
 * semantics identical to typing the command in a terminal.
 *
 * Output is truncated to MAX_OUT chars so a runaway command can't blow up
 * the prompt buffer.
 */

const os = require('os');
const { spawn } = require('child_process');

const IS_WIN  = os.platform() === 'win32';
const MAX_OUT = 16 * 1024;
const TIMEOUT_MS = 15_000;

/**
 * Execute `cmdLine` in the platform shell and resolve with the captured text.
 * Never rejects — failures resolve with a brief stderr message and exit code.
 * @returns {Promise<{ok: boolean, text: string, code: number}>}
 */
function exec(cmdLine, opts = {}) {
  const cmd  = String(cmdLine || '').trim();
  if (!cmd) return Promise.resolve({ ok: false, text: '', code: 0 });

  const cwd  = opts.cwd  || process.cwd();
  const env  = opts.env  || process.env;
  const max  = opts.maxBytes || MAX_OUT;

  return new Promise(resolve => {
    let bin, args;
    if (IS_WIN) {
      // cmd.exe /D: skip AutoRun; /C: run then terminate
      bin  = process.env.ComSpec || 'cmd.exe';
      args = ['/D', '/C', cmd];
    } else {
      bin  = process.env.SHELL || '/bin/sh';
      args = ['-c', cmd];
    }

    const p = spawn(bin, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let truncated = false;
    const onChunk = chunk => {
      if (truncated) return;
      out += chunk.toString();
      if (out.length > max) {
        out = out.slice(0, max) + `\n…(truncated at ${max} bytes)`;
        truncated = true;
        try { p.kill('SIGTERM'); } catch {}
      }
    };
    p.stdout.on('data', onChunk);
    p.stderr.on('data', onChunk);

    const timer = setTimeout(() => {
      try { p.kill('SIGTERM'); } catch {}
      out += `\n…(timed out after ${TIMEOUT_MS / 1000}s)`;
    }, TIMEOUT_MS);

    p.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, text: `failed to spawn: ${err.message}`, code: -1 });
    });
    p.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, text: out.trimEnd(), code: code == null ? (signal ? -1 : 0) : code });
    });
  });
}

/**
 * Format an exec result for injection into the chat prompt.
 * Returns a fenced block the AI can read clearly.
 */
function format(cmdLine, result) {
  const status = result.ok ? '' : ` (exit ${result.code})`;
  const body   = result.text || '(no output)';
  return `\n\`\`\`shell\n$ ${cmdLine}${status}\n${body}\n\`\`\`\n`;
}

module.exports = { exec, format };
