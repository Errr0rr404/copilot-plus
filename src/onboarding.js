'use strict';

const readline = require('readline');
const config = require('./config');

/**
 * First-run onboarding wizard.
 * Asks the user about voice activation (wake word) and macros.
 * Returns the updated config object.
 */
async function runOnboarding(cfg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n✨  Welcome to copilot-plus!\n');
  console.log('Let\'s set up your preferences. You can change these later with: copilot+ --preferences\n');

  // --- Voice Activation (wake word) ---
  console.log('🗣️   Voice Activation — say a phrase to start recording hands-free.');
  console.log('    After the phrase, speak your prompt. Pause to finish — text is injected automatically.');
  console.log('    Uses whisper.cpp (already installed) — no extra dependencies or accounts needed.\n');
  const wakeAnswer = (await ask('Enable voice activation? [y/N] ')).trim().toLowerCase();
  cfg.wakeWord.enabled = wakeAnswer === 'y' || wakeAnswer === 'yes';
  if (cfg.wakeWord.enabled) {
    const defaultPhrase = cfg.wakeWord.phrase || 'hey copilot';
    const phrase = (await ask(`Activation phrase (Enter to use "${defaultPhrase}"): `)).trim();
    cfg.wakeWord.phrase = phrase || defaultPhrase;
    console.log(`✅  Voice activation enabled. Say "${cfg.wakeWord.phrase}" to start recording.\n`);
  } else {
    console.log('    Voice activation disabled. Use Ctrl+R to record manually. Enable it later via Ctrl+K.\n');
  }

  // --- Prompt macros ---
  console.log('⌨️   Prompt Macros — assign saved prompts to hotkeys.');
  console.log('    macOS: Option+1–9 (enable "Use Option as Meta Key" in Terminal settings)');
  console.log('    Other terminals: Ctrl+1–9\n');
  const macroAnswer = (await ask('Set up prompt macros now? [y/N] ')).trim().toLowerCase();
  if (macroAnswer === 'y' || macroAnswer === 'yes') {
    console.log('\nEnter a prompt for each slot (Enter to skip):\n');
    for (let i = 1; i <= 9; i++) {
      const existing = cfg.macros[i] ? ` [current: ${cfg.macros[i].slice(0, 40)}${cfg.macros[i].length > 40 ? '…' : ''}]` : '';
      const prompt = (await ask(`  Slot ${i}${existing}: `)).trim();
      if (prompt) cfg.macros[i] = prompt;
    }
    console.log('');
  }

  cfg.firstRunComplete = true;
  rl.close();

  // Save to disk
  const rawConfig = {};
  try { Object.assign(rawConfig, JSON.parse(require('fs').readFileSync(config.CONFIG_PATH, 'utf8'))); } catch {}
  rawConfig.firstRunComplete = true;
  rawConfig.macros = cfg.macros;
  rawConfig.wakeWord = cfg.wakeWord;
  // Remove legacy dictation key if present
  delete rawConfig.dictation;
  config.save(rawConfig);

  console.log('💾  Preferences saved to:', config.CONFIG_PATH);
  console.log('    Run `copilot+ --preferences` to change them anytime.\n');

  return cfg;
}

module.exports = { runOnboarding };
