'use strict';

/**
 * clipboard — cross-platform paste support for copilot+.
 *
 * `readText()`    returns the current text clipboard (or '' if empty / image).
 * `readImage(p)`  saves a clipboard image to `p` and returns the path, or null.
 *
 * macOS uses `pbpaste` (text) and `osascript` (image detection + save).
 * Windows uses PowerShell Forms Clipboard.
 * Linux tries wl-paste (Wayland) then xclip / xsel (X11).
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFile, execFileSync, spawnSync } = require('child_process');
const { execPowerShellSync } = require('./windows-shell');
const logger = require('./logger');

const PLATFORM = os.platform();
const SCRATCH_DIR = path.join(os.tmpdir(), 'copilot-clipboard');
try { fs.mkdirSync(SCRATCH_DIR, { recursive: true }); } catch {}

function readText() {
  try {
    if (PLATFORM === 'darwin') {
      return execFileSync('pbpaste', { encoding: 'utf8', timeout: 1500 });
    }
    if (PLATFORM === 'win32') {
      const out = execPowerShellSync(`
        $ErrorActionPreference = 'SilentlyContinue'
        Add-Type -AssemblyName System.Windows.Forms
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
          [System.Windows.Forms.Clipboard]::GetText()
        }
      `, ['-STA'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
      return (out || '').replace(/\r\n/g, '\n');
    }
    // Linux: prefer Wayland (wl-paste) → X11 (xclip → xsel).
    for (const probe of [
      ['wl-paste', ['--no-newline']],
      ['xclip',    ['-selection', 'clipboard', '-o']],
      ['xsel',     ['--clipboard', '--output']],
    ]) {
      const r = spawnSync(probe[0], probe[1], { encoding: 'utf8', timeout: 1500 });
      if (r.status === 0) return r.stdout || '';
    }
  } catch (err) {
    logger.debug('clipboard.readText failed:', err);
  }
  return '';
}

/**
 * Save the current clipboard image to a fresh file and return the path.
 * Returns null if the clipboard does not contain an image.
 */
function readImage() {
  const outFile = path.join(SCRATCH_DIR, `clipboard-${Date.now()}.png`);
  try {
    if (PLATFORM === 'darwin') {
      // osascript: try to coerce the clipboard to a PNG and write it
      const script = `
        try
          set imgData to (the clipboard as «class PNGf»)
          set outFile to "${outFile.replace(/"/g, '\\"')}"
          set fh to open for access POSIX file outFile with write permission
          set eof of fh to 0
          write imgData to fh
          close access fh
          return outFile
        on error
          try
            close access POSIX file outFile
          end try
          return ""
        end try
      `;
      const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 3000 });
      const ok = (r.stdout || '').trim();
      return ok && fs.existsSync(ok) ? ok : null;
    }
    if (PLATFORM === 'win32') {
      execPowerShellSync(`
        $ErrorActionPreference = 'SilentlyContinue'
        Add-Type -AssemblyName System.Windows.Forms
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          $img = [System.Windows.Forms.Clipboard]::GetImage()
          $img.Save($env:OUTFILE, [System.Drawing.Imaging.ImageFormat]::Png)
        }
      `, ['-STA'], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
        env: Object.assign({}, process.env, { OUTFILE: outFile }),
      });
      return fs.existsSync(outFile) ? outFile : null;
    }
    // Linux
    const probes = [
      ['wl-paste', ['--type', 'image/png']],
      ['xclip',    ['-selection', 'clipboard', '-t', 'image/png', '-o']],
    ];
    for (const [bin, args] of probes) {
      const r = spawnSync(bin, args, { timeout: 2500 });
      if (r.status === 0 && r.stdout && r.stdout.length > 100) {
        fs.writeFileSync(outFile, r.stdout);
        return outFile;
      }
    }
  } catch (err) {
    logger.debug('clipboard.readImage failed:', err);
  }
  return null;
}

/** Write text to the clipboard (used by "copy last response"). */
function writeText(text) {
  try {
    if (PLATFORM === 'darwin') {
      const p = require('child_process').spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] });
      p.stdin.write(text);
      p.stdin.end();
      return true;
    }
    if (PLATFORM === 'win32') {
      execFile('clip', [], { input: text }, () => {});
      return true;
    }
    for (const [bin, args] of [
      ['wl-copy', []],
      ['xclip',   ['-selection', 'clipboard']],
      ['xsel',    ['--clipboard', '--input']],
    ]) {
      const r = spawnSync(bin, args, { input: text });
      if (r.status === 0) return true;
    }
  } catch (err) {
    logger.debug('clipboard.writeText failed:', err);
  }
  return false;
}

module.exports = { readText, readImage, writeText };
