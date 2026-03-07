'use strict';

const EventEmitter = require('events');

/**
 * WakeWordListener — always-on keyword detection using Picovoice Porcupine.
 *
 * Listens for a wake word and emits 'detected' when heard.
 * Uses @picovoice/porcupine-node + @picovoice/pvrecorder-node.
 * Dependencies are dynamically loaded so the app doesn't crash if they're
 * not installed (wake word just won't be available).
 *
 * Events:
 *   'detected' ()      — wake word heard
 *   'error'    (Error)  — non-fatal error
 *   'ready'    ()       — listener initialised and running
 */
class WakeWordListener extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this._porcupine = null;
    this._recorder = null;
    this._listening = false;
    this._processInterval = null;
  }

  get isListening() { return this._listening; }

  /**
   * Start listening for the wake word.
   * Throws if Porcupine deps are not installed.
   */
  async start() {
    if (this._listening) return;

    let Porcupine, BuiltinKeyword, getBuiltinKeywordPath, PvRecorder;
    try {
      ({ Porcupine, BuiltinKeyword, getBuiltinKeywordPath } = require('@picovoice/porcupine-node'));
      ({ PvRecorder } = require('@picovoice/pvrecorder-node'));
    } catch {
      throw new Error(
        'Wake word requires @picovoice/porcupine-node and @picovoice/pvrecorder-node.\n' +
        'Install: npm install -g @picovoice/porcupine-node @picovoice/pvrecorder-node'
      );
    }

    const accessKey = this.config.wakeWord && this.config.wakeWord.accessKey;
    if (!accessKey) {
      throw new Error('Wake word requires a Picovoice AccessKey. Get one free at https://console.picovoice.ai/');
    }

    const keywordPath = this.config.wakeWord && this.config.wakeWord.keywordPath;
    const sensitivity = (this.config.wakeWord && this.config.wakeWord.sensitivity) || 0.5;

    try {
      if (keywordPath) {
        // Custom keyword (.ppn file, e.g. "hey copilot")
        this._porcupine = new Porcupine(accessKey, [keywordPath], [sensitivity]);
      } else {
        // Built-in "COMPUTER" keyword as fallback
        const builtinPath = getBuiltinKeywordPath(BuiltinKeyword.COMPUTER);
        this._porcupine = new Porcupine(accessKey, [builtinPath], [sensitivity]);
      }
    } catch (err) {
      throw new Error(`Porcupine init failed: ${err.message}`);
    }

    try {
      this._recorder = new PvRecorder(this._porcupine.frameLength);
      this._recorder.start();
    } catch (err) {
      this._porcupine.release();
      this._porcupine = null;
      throw new Error(`Audio recorder init failed: ${err.message}`);
    }

    this._listening = true;
    this.emit('ready');
    this._poll();
  }

  stop() {
    this._listening = false;
    if (this._processInterval) {
      clearTimeout(this._processInterval);
      this._processInterval = null;
    }
    if (this._recorder) {
      try { this._recorder.stop(); } catch {}
      this._recorder.release();
      this._recorder = null;
    }
    if (this._porcupine) {
      this._porcupine.release();
      this._porcupine = null;
    }
  }

  /** Continuously read audio frames and check for keyword. */
  _poll() {
    if (!this._listening) return;

    try {
      const frames = this._recorder.readSync();
      const keywordIndex = this._porcupine.process(frames);
      if (keywordIndex >= 0) {
        this.emit('detected');
      }
    } catch (err) {
      this.emit('error', err);
    }

    // Use setImmediate to avoid blocking the event loop
    this._processInterval = setTimeout(() => this._poll(), 10);
  }
}

module.exports = WakeWordListener;
