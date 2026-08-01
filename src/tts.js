'use strict';

/**
 * tts — read AI responses aloud using the platform's built-in TTS.
 *
 * macOS:   `say` (always present)
 * Windows: PowerShell System.Speech.Synthesis.SpeechSynthesizer
 * Linux:   `spd-say` (speech-dispatcher), fallback to `espeak-ng` or `espeak`
 *
 * Only one utterance plays at a time — calling `speak()` while a previous
 * one is still running stops the previous one immediately. `stop()` aborts.
 *
 * `summarizeResponse(text)` strips noise (code blocks, ANSI, markdown
 * headers) so we read only the prose — code is rarely useful spoken aloud.
 */

const { spawn } = require('child_process');
const os = require('os');
const logger = require('./logger');

const PLATFORM = os.platform();

class TTS {
  constructor(config = {}) {
    this.config = config;
    this._proc  = null;
    this._available = null;
  }

  /** Lazy availability probe. */
  available() {
    if (this._available !== null) return this._available;
    try {
      if (PLATFORM === 'darwin') {
        this._available = true; // `say` is part of macOS
      } else if (PLATFORM === 'win32') {
        this._available = true; // System.Speech ships with .NET on every Win10+
      } else {
        // Linux — probe in order of preference
        const which = require('child_process').spawnSync('which', ['spd-say'], { encoding: 'utf8' });
        if (which.status === 0) { this._bin = 'spd-say'; this._available = true; return true; }
        const wEsp = require('child_process').spawnSync('which', ['espeak-ng'], { encoding: 'utf8' });
        if (wEsp.status === 0) { this._bin = 'espeak-ng'; this._available = true; return true; }
        const wEs = require('child_process').spawnSync('which', ['espeak'], { encoding: 'utf8' });
        if (wEs.status === 0) { this._bin = 'espeak'; this._available = true; return true; }
        this._available = false;
      }
    } catch { this._available = false; }
    return this._available;
  }

  /** Read text aloud. Cancels the previous utterance if any. */
  speak(text) {
    if (!text || !this.available()) return;
    this.stop();

    const summary = summarizeResponse(text);
    if (!summary.trim()) return;

    const rate = (this.config.tts && this.config.tts.rate) || 200; // wpm
    const voice = this.config.tts && this.config.tts.voice;

    try {
      if (PLATFORM === 'darwin') {
        const args = ['-r', String(rate)];
        if (voice) args.push('-v', voice);
        this._proc = spawn('say', args, { stdio: ['pipe', 'ignore', 'ignore'] });
        this._proc.stdin.write(summary);
        this._proc.stdin.end();
      } else if (PLATFORM === 'win32') {
        const ps = `
          Add-Type -AssemblyName System.Speech
          $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
          ${voice ? `try { $s.SelectVoice('${voice.replace(/'/g, "''")}') } catch {}` : ''}
          $s.Rate = ${Math.max(-10, Math.min(10, Math.round((rate - 200) / 25)))}
          $text = [Console]::In.ReadToEnd()
          $s.Speak($text)
        `;
        this._proc = spawn('powershell', [
          '-NoProfile', '-NonInteractive', '-Command', ps,
        ], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
        this._proc.stdin.write(summary);
        this._proc.stdin.end();
      } else {
        const bin = this._bin || 'spd-say';
        const args = bin === 'spd-say'
          ? ['-r', String(Math.round((rate - 200) / 10))]
          : ['-s', String(rate)];
        this._proc = spawn(bin, args, { stdio: ['pipe', 'ignore', 'ignore'] });
        this._proc.stdin.write(summary);
        this._proc.stdin.end();
      }
      this._proc.on('exit',  () => { this._proc = null; });
      this._proc.on('error', err => { logger.debug('tts spawn error', err); this._proc = null; });
    } catch (err) {
      logger.debug('tts.speak failed', err);
      this._proc = null;
    }
  }

  stop() {
    if (!this._proc) return;
    try { this._proc.kill('SIGTERM'); } catch {}
    this._proc = null;
  }
}

/**
 * Trim a raw AI response into something worth reading aloud.
 *  - Drop ``` … ``` fenced code blocks
 *  - Drop inline code spans
 *  - Strip ANSI escapes
 *  - Strip markdown headers/bullets prefixes
 *  - Collapse whitespace and cap to 2000 chars
 */
function summarizeResponse(text) {
  let s = String(text || '');
  s = s.replace(/\x1b\[[0-9;]*[mA-Za-z]/g, '');
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`[^`\n]+`/g, '');
  s = s.replace(/^[ \t]*#{1,6}\s*/gm, '');
  s = s.replace(/^[ \t]*[-*+>]\s+/gm, '');
  s = s.replace(/\[(.+?)\]\(.+?\)/g, '$1');
  s = s.replace(/[*_~]+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 2000) s = s.slice(0, 2000) + '. (response truncated for speech.)';
  return s;
}

module.exports = TTS;
module.exports.summarizeResponse = summarizeResponse;
