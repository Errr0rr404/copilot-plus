'use strict';

const readline = require('readline');
const config = require('./config');

/**
 * First-run onboarding wizard.
 * Asks the user about dictation, wake word, and macros.
 * Returns the updated config object.
 */
async function runOnboarding(cfg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n✨  Welcome to copilot-plus!\n');
  console.log('Let\'s set up your preferences. You can change these later with: copilot+ --preferences\n');

  // --- Dictation mode ---
  console.log('📝  Dictation Mode — continuous voice-to-text while you speak.');
  console.log('    Records in short chunks, transcribes each, and injects text automatically.\n');
  const dictAnswer = (await ask('Enable dictation mode? [y/N] ')).trim().toLowerCase();
  cfg.dictation.enabled = dictAnswer === 'y' || dictAnswer === 'yes';
  if (cfg.dictation.enabled) {
    console.log('✅  Dictation mode enabled. Toggle it with Ctrl+R (long press) or the command palette.\n');
  } else {
    console.log('    Dictation mode disabled. You can enable it later.\n');
  }

  // --- Wake word ---
  console.log('🗣️   Wake Word — say a phrase to start voice recording hands-free.');
  console.log('    Uses whisper.cpp (already installed) — no extra dependencies or accounts needed.');
  console.log('    Records short 2-second chunks and listens for your chosen phrase.\n');
  const wakeAnswer = (await ask('Enable wake word activation? [y/N] ')).trim().toLowerCase();
  cfg.wakeWord.enabled = wakeAnswer === 'y' || wakeAnswer === 'yes';
  if (cfg.wakeWord.enabled) {
    const defaultPhrase = cfg.wakeWord.phrase || 'hey copilot';
    const phrase = (await ask(`Wake phrase (Enter to use "${defaultPhrase}"): `)).trim();
    cfg.wakeWord.phrase = phrase || defaultPhrase;
    console.log(`✅  Wake word enabled. Say "${cfg.wakeWord.phrase}" to start recording.\n`);
  } else {
    console.log('    Wake word disabled. You can enable it later.\n');
  }

  // --- Prompt macros ---
  console.log('⌨️   Prompt Macros — assign saved prompts to Ctrl+1 through Ctrl+9.');
  console.log('    Example: Ctrl+1 → "Write unit tests for this code"\n');
  const macroAnswer = (await ask('Set up prompt macros now? [y/N] ')).trim().toLowerCase();
  if (macroAnswer === 'y' || macroAnswer === 'yes') {
    console.log('\nEnter a prompt for each slot (Enter to skip):\n');
    for (let i = 1; i <= 9; i++) {
      const existing = cfg.macros[i] ? ` [current: ${cfg.macros[i].slice(0, 40)}${cfg.macros[i].length > 40 ? '…' : ''}]` : '';
      const prompt = (await ask(`  Ctrl+${i}${existing}: `)).trim();
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
  rawConfig.dictation = cfg.dictation;
  rawConfig.wakeWord = cfg.wakeWord;
  config.save(rawConfig);

  console.log('💾  Preferences saved to:', config.CONFIG_PATH);
  console.log('    Run `copilot+ --preferences` to change them anytime.\n');

  return cfg;
}

module.exports = { runOnboarding };
