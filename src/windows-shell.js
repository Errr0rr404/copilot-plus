'use strict';

const { execFile, execFileSync, spawn } = require('child_process');

function buildArgs(script, extraArgs = []) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ['-NoProfile', '-NonInteractive', ...extraArgs, '-EncodedCommand', encoded];
}

function execPowerShell(script, extraArgs = [], options = {}) {
  return execFile('powershell', buildArgs(script, extraArgs), options);
}

function execPowerShellSync(script, extraArgs = [], options = {}) {
  return execFileSync('powershell', buildArgs(script, extraArgs), options);
}

function spawnPowerShell(script, extraArgs = [], options = {}) {
  return spawn('powershell', buildArgs(script, extraArgs), options);
}

module.exports = { execPowerShell, execPowerShellSync, spawnPowerShell };
