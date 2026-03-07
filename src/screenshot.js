'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCREENSHOTS_DIR = path.join(os.tmpdir(), 'copilot-screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Launch the macOS interactive screenshot picker.
 * Resolves to the saved file path, or null if the user cancelled.
 * @returns {Promise<string|null>}
 */
function capture() {
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot-${Date.now()}.png`);

  return new Promise((resolve, reject) => {
    const proc = spawn('screencapture', [
      '-i',        // interactive selection
      '-x',        // no shutter sound
      filePath,
    ]);

    proc.on('error', reject);

    proc.on('exit', code => {
      // screencapture exits 0 even on ESC but doesn't create the file
      if (code === 0 && fs.existsSync(filePath)) {
        resolve(filePath);
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = { capture };
