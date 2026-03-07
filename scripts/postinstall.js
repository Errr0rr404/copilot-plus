'use strict';

// Automatically fix node-pty spawn-helper permissions after npm install.
// node-pty ships prebuilt binaries without the executable bit set on macOS,
// which causes "posix_spawnp failed" at runtime without this fix.

const fs = require('fs');
const path = require('path');
const os = require('os');

if (os.platform() !== 'darwin' && os.platform() !== 'linux') process.exit(0);
// Windows uses .node binaries (not spawn-helper) and handles permissions differently — no chmod needed.

// Use require.resolve to find node-pty regardless of hoisting / install location
let nodePtyDir;
try {
  nodePtyDir = path.dirname(require.resolve('node-pty/package.json'));
} catch {
  process.exit(0); // node-pty not found, nothing to fix
}

const platform = `${os.platform()}-${os.arch()}`;
const targets = [
  path.join(nodePtyDir, 'prebuilds', platform, 'spawn-helper'),
  path.join(nodePtyDir, 'prebuilds', platform, 'pty.node'),
];

let fixed = 0;
for (const t of targets) {
  if (fs.existsSync(t)) {
    fs.chmodSync(t, 0o755);
    fixed++;
  }
}

if (fixed > 0) {
  console.log(`[copilot-plus] Fixed node-pty permissions for ${platform} (${fixed} files)`);
}
