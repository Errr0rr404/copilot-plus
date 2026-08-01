'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnPowerShell } = require('./windows-shell');

const PLATFORM = os.platform();
const IS_WIN   = PLATFORM === 'win32';
const IS_MAC   = PLATFORM === 'darwin';
const SCREENSHOTS_DIR = path.join(os.tmpdir(), 'copilot-screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Launch an interactive screenshot picker.
 * Resolves to the saved file path, or null if the user cancelled.
 * @returns {Promise<string|null>}
 */
function capture() {
  if (IS_WIN) return captureWindows();
  if (IS_MAC) return captureMac();
  return captureLinux();
}

function captureMac() {
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot-${Date.now()}.png`);

  return new Promise((resolve, reject) => {
    const proc = spawn('screencapture', ['-i', '-x', filePath]);
    proc.on('error', reject);
    proc.on('exit', () => {
      resolve(fs.existsSync(filePath) ? filePath : null);
    });
  });
}

function captureWindows() {
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot-${Date.now()}.png`);

  // Opens the Windows Snip & Sketch overlay (Win+Shift+S equivalent),
  // waits for the user to snip, then reads the image from the clipboard and saves it.
  const ps = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $outPath = $env:COPILOT_PLUS_SCREENSHOT_PATH

    if ([string]::IsNullOrWhiteSpace($outPath)) {
      throw 'Screenshot output path was not provided.'
    }

    # Clear clipboard first so we can detect a new snip
    [System.Windows.Forms.Clipboard]::Clear()

    # Open Snip & Sketch overlay
    Start-Process 'ms-screenclip:'

    # Poll clipboard for up to 30 seconds waiting for an image
    $timeout = 30
    $elapsed = 0
    $img = $null
    while ($elapsed -lt $timeout) {
      Start-Sleep -Milliseconds 500
      $elapsed += 0.5
      if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $img = [System.Windows.Forms.Clipboard]::GetImage()
        break
      }
    }

    if ($img) {
      $img.Save($outPath)
      Write-Output $outPath
    } else {
      Write-Output ''
    }
  `;

  return new Promise((resolve, reject) => {
    const proc = spawnPowerShell(ps, ['-STA'], {
      env: Object.assign({}, process.env, {
        COPILOT_PLUS_SCREENSHOT_PATH: filePath,
      }),
      windowsHide: true,
    });
    let output = '';
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', () => {
      const result = output.trim();
      resolve(result && fs.existsSync(result) ? result : null);
    });
  });
}

/**
 * Linux interactive screenshot.
 *
 * Tries, in order:
 *   1. grim + slurp     (Wayland — sway, hyprland, river)
 *   2. gnome-screenshot (GNOME)
 *   3. spectacle        (KDE)
 *   4. scrot            (X11 generic)
 *   5. maim + slop      (X11 generic)
 * Each tool that exposes a "region selection" mode is used; otherwise we fall
 * through to the next tool.
 */
function captureLinux() {
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot-${Date.now()}.png`);

  const candidates = [
    () => _runIfAvailable('grim', ['-g', _sh('slurp'), filePath], { needsBin: 'grim' }),
    () => _runIfAvailable('gnome-screenshot', ['-a', '-f', filePath]),
    () => _runIfAvailable('spectacle', ['-r', '-b', '-n', '-o', filePath]),
    () => _runIfAvailable('scrot', ['-s', filePath]),
    () => _runIfAvailable('maim', ['-s', filePath]),
  ];

  return new Promise(async resolve => {
    for (const probe of candidates) {
      const ok = await probe();
      if (ok && fs.existsSync(filePath)) return resolve(filePath);
    }
    resolve(null);
  });
}

function _sh(cmd) {
  // Embeds a shell sub-command using process substitution-style fallback —
  // safe because we only invoke it via spawn with shell:true below.
  return `$(${cmd})`;
}

async function _runIfAvailable(bin, args, opts = {}) {
  const which = spawnSync('which', [opts.needsBin || bin], { encoding: 'utf8' });
  if (which.status !== 0) return false;
  return new Promise(resolve => {
    const useShell = args.some(a => a.includes('$('));
    const proc = useShell
      ? spawn(`${bin} ${args.join(' ')}`, { shell: true, stdio: 'inherit' })
      : spawn(bin, args, { stdio: 'inherit' });
    proc.on('exit', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

module.exports = { capture };
