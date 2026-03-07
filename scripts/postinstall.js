'use strict';

// Automatically fix node-pty spawn-helper permissions after npm install.
// node-pty ships prebuilt binaries without the executable bit set on macOS,
// which causes "posix_spawnp failed" at runtime without this fix.

const fs = require('fs');
const path = require('path');
const os = require('os');

if (os.platform() !== 'darwin' && os.platform() !== 'linux') process.exit(0);

const prebuildDir = path.join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
if (!fs.existsSync(prebuildDir)) process.exit(0);

const platform = `${os.platform()}-${os.arch()}`;
const targets = [
  path.join(prebuildDir, platform, 'spawn-helper'),
  path.join(prebuildDir, platform, 'pty.node'),
];

let fixed = 0;
for (const t of targets) {
  if (fs.existsSync(t)) {
    fs.chmodSync(t, 0o755);
    fixed++;
  }
}

if (fixed > 0) {
  console.log(`[talk-to-copilot] Fixed node-pty permissions for ${platform} (${fixed} files)`);
}
