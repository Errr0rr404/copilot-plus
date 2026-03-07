'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = os.platform() === 'win32';
const SCREENSHOTS_DIR = path.join(os.tmpdir(), 'copilot-screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Launch an interactive screenshot picker.
 * Resolves to the saved file path, or null if the user cancelled.
 * @returns {Promise<string|null>}
 */
function capture() {
  return IS_WIN ? captureWindows() : captureMac();
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
      $img.Save('${filePath.replace(/\\/g, '\\\\')}')
      Write-Output '${filePath.replace(/\\/g, '\\\\')}'
    } else {
      Write-Output ''
    }
  `;

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    let output = '';
    proc.stdout.on('data', d => { output += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', () => {
      const result = output.trim();
      resolve(result && fs.existsSync(result) ? result : null);
    });
  });
}

module.exports = { capture };
