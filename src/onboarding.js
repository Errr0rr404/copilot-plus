'use strict';

/**
 * First-run onboarding wizard.
 *
 * Walks the user through: voice activation, prompt macros, model slots,
 * theme, and language. The goal is that by the end of the wizard the user
 * KNOWS the major hotkeys exist — discoverability is the #1 friction point
 * for a CLI tool that hides UI behind keystrokes.
 *
 * Re-run anytime via `copilot+ --preferences`.
 */

const os       = require('os');
const readline = require('readline');
const config   = require('./config');
const theme    = require('./theme');

const IS_MAC = os.platform() === 'darwin';

async function runOnboarding(cfg) {
  const t = theme.get(cfg);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));
  const askYN = async (q, dflt = false) => {
    const hint = dflt ? '[Y/n]' : '[y/N]';
    const a = (await ask(`${q} ${hint} `)).trim().toLowerCase();
    if (!a) return dflt;
    return a === 'y' || a === 'yes';
  };

  console.log(`\n${t.bold}✨  Welcome to copilot-plus!${t.reset}`);
  console.log(`${t.dim}    A drop-in wrapper around GitHub Copilot CLI with voice, screenshots, palette, and a monitor.${t.reset}\n`);

  // ── At-a-glance cheatsheet so users walk away knowing what exists ──────────
  console.log(`${t.accent}You can change everything later.${t.reset}  Re-run with: ${t.bold}copilot+ --preferences${t.reset}\n`);
  console.log(`${t.bold}The hotkeys you should remember:${t.reset}`);
  const macroKey = IS_MAC ? 'Opt'    : 'Ctrl';
  const modKey   = IS_MAC ? 'Opt+⇧' : 'Ctrl+Shift';
  const rows = [
    ['Ctrl+R',              'voice recording'],
    ['Ctrl+P',              'screenshot'],
    ['Ctrl+Y',              'paste clipboard (text or image)'],
    ['Ctrl+G',              'inject smart context (git diff, recent files)'],
    ['Ctrl+K',              'command palette (search every feature)'],
    ['Ctrl+T',              'toggle text-to-speech for responses'],
    ['Ctrl+B',              'bookmark the last response'],
    ['? / Ctrl+/',          'show in-app cheatsheet'],
    [`${modKey}+1–4`,       'switch workhorse model 1–4'],
    [`${modKey}+5`,         'toggle ⚡ Auto Mode'],
    [`${macroKey}+1–9`,     'run prompt macros 1–9'],
    ['!cmd',                'type `!ls -la` to inject shell output as context'],
    ['copilot+ --monitor',  'live dashboard for every running session'],
    ['copilot+ --history',  'search your past prompts'],
    ['copilot+ --snippets', 'browse bookmarked responses'],
  ];
  for (const [k, d] of rows) {
    console.log(`  ${t.bold}${k.padEnd(20)}${t.reset}${t.dim}${d}${t.reset}`);
  }
  console.log('');

  // ── Theme ──────────────────────────────────────────────────────────────────
  const themes = theme.names();
  console.log(`${t.bold}🎨  Theme${t.reset}  ${t.dim}(${themes.join(', ')})${t.reset}`);
  const themeAns = (await ask(`Pick a theme (Enter for "${cfg.theme || 'dark'}"): `)).trim();
  if (themeAns && themes.includes(themeAns)) {
    cfg.theme = themeAns;
    theme.set(themeAns);
  }

  // ── Voice language ─────────────────────────────────────────────────────────
  console.log(`\n${t.bold}🌍  Voice language${t.reset}`);
  console.log(`${t.dim}    "en" (default, fastest) · "auto" (whisper detects) · ISO 639-1 (es, ja, de, fr…)`);
  console.log(`    Non-English needs a non-.en whisper model — drop one in ~/.copilot/models/.${t.reset}`);
  const lang = (await ask(`Language (Enter for "${cfg.voiceLanguage || 'en'}"): `)).trim();
  if (lang) cfg.voiceLanguage = lang;

  // ── Voice preview ──────────────────────────────────────────────────────────
  console.log(`\n${t.bold}🎙  Voice preview${t.reset}`);
  console.log(`${t.dim}    OFF: transcription is typed straight into the prompt (fast).`);
  console.log(`    ON: transcription appears, you press Enter to send (safer).${t.reset}`);
  cfg.voicePreview = await askYN('Preview voice transcription before sending?', cfg.voicePreview || false);

  // ── Voice activation ───────────────────────────────────────────────────────
  console.log(`\n${t.bold}🗣️   Voice Activation${t.reset}`);
  console.log(`${t.dim}    Always-on wake phrase. Say the phrase, then your prompt — hands-free.`);
  console.log(`    Uses whisper.cpp locally — no cloud, no extra accounts.${t.reset}`);
  cfg.wakeWord.enabled = await askYN('Enable voice activation?', cfg.wakeWord.enabled);
  if (cfg.wakeWord.enabled) {
    const defaultPhrase = cfg.wakeWord.phrase || 'hey copilot';
    const phrase = (await ask(`  Activation phrase (Enter for "${defaultPhrase}"): `)).trim();
    cfg.wakeWord.phrase = phrase || defaultPhrase;
    console.log(`  ${t.success}✅  Wake phrase: "${cfg.wakeWord.phrase}"${t.reset}`);
  }

  // ── Workhorse models ───────────────────────────────────────────────────────
  console.log(`\n${t.bold}🤖  Workhorse model slots${t.reset}`);
  console.log(`${t.dim}    Map 1–4 to your favourite Copilot models. Switch instantly with ${modKey}+1–4.`);
  console.log(`    Skip with Enter; configure later via Ctrl+K.${t.reset}`);
  if (await askYN('Set up model slots now?', false)) {
    for (let i = 1; i <= 4; i++) {
      const current = cfg.workhorseModels[i];
      const existing = current ? ` [current: ${current}]` : '';
      const m = (await ask(`  Slot ${i}${existing}: `)).trim();
      if (m) cfg.workhorseModels[i] = m;
    }
  }

  // ── Auto mode tiers ────────────────────────────────────────────────────────
  console.log(`\n${t.bold}⚡  Auto Mode tiers${t.reset}`);
  console.log(`${t.dim}    Routes prompts to fast / medium / powerful models based on complexity.`);
  console.log(`    Toggle with ${modKey}+5 or via Ctrl+K. Skip to keep defaults.${t.reset}`);
  if (await askYN('Configure auto-mode tiers?', false)) {
    for (const tier of ['fast', 'medium', 'powerful']) {
      const current = cfg.autoModels[tier];
      const existing = current ? ` [current: ${current}]` : '';
      const m = (await ask(`  ${tier.padEnd(8)}${existing}: `)).trim();
      if (m) cfg.autoModels[tier] = m;
    }
  }

  // ── Macros ─────────────────────────────────────────────────────────────────
  console.log(`\n${t.bold}⌨️   Prompt macros${t.reset}`);
  console.log(`${t.dim}    Saved prompts on ${macroKey}+1–9. Great for "fix tests", "review diff", etc.${t.reset}`);
  if (await askYN('Set up macros now?', false)) {
    for (let i = 1; i <= 9; i++) {
      const existing = cfg.macros[i] ? ` [current: ${cfg.macros[i].slice(0, 40)}${cfg.macros[i].length > 40 ? '…' : ''}]` : '';
      const prompt = (await ask(`  Slot ${i}${existing}: `)).trim();
      if (prompt) cfg.macros[i] = prompt;
    }
  }

  // ── Safety scanner ─────────────────────────────────────────────────────────
  console.log(`\n${t.bold}🔒  Safety scanner${t.reset}`);
  console.log(`${t.dim}    Warns when your prompt looks like it contains an API key, token, or secret.${t.reset}`);
  cfg.safety = cfg.safety || {};
  cfg.safety.enabled = await askYN('Enable secret scanner?', cfg.safety.enabled !== false);

  // ── History ────────────────────────────────────────────────────────────────
  console.log(`\n${t.bold}📚  History${t.reset}`);
  console.log(`${t.dim}    Logs every prompt to ~/.copilot/history.jsonl so you can search "what did I ask about Docker?"`);
  console.log(`    Browse with: copilot+ --history [query].${t.reset}`);
  cfg.historyEnabled = await askYN('Enable history logging?', cfg.historyEnabled !== false);

  // ── TTS ────────────────────────────────────────────────────────────────────
  console.log(`\n${t.bold}🔊  Text-to-Speech${t.reset}`);
  console.log(`${t.dim}    Reads Copilot's responses aloud (uses the OS built-in voice — no install).${t.reset}`);
  cfg.tts = cfg.tts || { rate: 200, voice: '' };
  cfg.tts.enabled = await askYN('Enable TTS at startup?', cfg.tts.enabled || false);

  cfg.firstRunComplete = true;
  rl.close();

  // ── Save ───────────────────────────────────────────────────────────────────
  let raw = {};
  try { Object.assign(raw, JSON.parse(require('fs').readFileSync(config.CONFIG_PATH, 'utf8'))); } catch {}
  Object.assign(raw, {
    firstRunComplete: true,
    macros:          cfg.macros,
    wakeWord:        cfg.wakeWord,
    workhorseModels: cfg.workhorseModels,
    autoModels:      cfg.autoModels,
    theme:           cfg.theme,
    voiceLanguage:   cfg.voiceLanguage,
    voicePreview:    cfg.voicePreview,
    historyEnabled:  cfg.historyEnabled,
    tts:             cfg.tts,
    safety:          cfg.safety,
  });
  delete raw.dictation;
  config.save(raw);

  console.log(`\n${t.success}💾  Saved to ${config.CONFIG_PATH}${t.reset}`);
  console.log(`${t.dim}    Start copilot+ and press ? at any time for the in-app cheatsheet.${t.reset}\n`);

  return cfg;
}

module.exports = { runOnboarding };
