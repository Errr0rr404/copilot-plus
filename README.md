# copilot+

<p align="center">
  <a href="https://www.npmjs.com/package/copilot-plus"><img src="https://img.shields.io/npm/v/copilot-plus?color=cb3837&logo=npm&logoColor=white&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/copilot-plus"><img src="https://img.shields.io/npm/dm/copilot-plus?color=cb3837&logo=npm&logoColor=white&label=downloads" alt="npm downloads" /></a>
  <a href="https://github.com/Errr0rr404/copilot-plus/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/copilot-plus?color=blue" alt="license: MIT" /></a>
  <img src="https://img.shields.io/node/v/copilot-plus?color=339933&logo=node.js&logoColor=white&label=node" alt="node ≥18" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="platform" />
</p>

Drop-in wrapper for [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli): voice, screenshots, clipboard, a prompt queue, workflows, a safety scanner, and a live multi-session monitor. It does **not** replace Copilot CLI — you still need a Copilot subscription and `copilot` on your `PATH`.

```bash
npm install -g copilot-plus
copilot+
```

macOS Homebrew: `brew tap Errr0rr404/copilot-plus && brew install copilot-plus`

---

## Hotkeys

| Key | Action |
|-----|--------|
| **?** / **Ctrl+/** | Cheatsheet (from live config) |
| **Ctrl+K** | Command palette |
| **Ctrl+R** | Voice record (local whisper.cpp) |
| **Ctrl+P** | Screenshot → `@/path.png` |
| **Ctrl+Y** | Paste clipboard (text or image) |
| **Ctrl+G** | Git status + diff (optional `recent` files) |
| **Ctrl+O** | Attach a project file as `@/abs/path` |
| **Ctrl+S** | Stash the current draft |
| **Ctrl+E** | Open last response in `$EDITOR` |
| **Ctrl+T** | Toggle text-to-speech |
| **Ctrl+B** | Bookmark last response |
| **Enter** *(while busy)* | Queue the prompt until idle |
| **`!cmd`** | Run a shell command; inject stdout |
| **Opt+Shift+1–4** / **Ctrl+Shift+1–4** | Workhorse model slots |
| **Opt+Shift+5** / **Ctrl+Shift+5** | Toggle Auto Mode |
| **Opt+1–9** / **Ctrl+1–9** | Macros |

Everything else is forwarded to Copilot CLI as usual.

## Commands

| Command | |
|---------|-|
| `copilot+` | Launch with enhancements |
| `copilot+ --monitor` | Live multi-session dashboard |
| `copilot+ --history [q]` | Search prompts (`--clear` to wipe) |
| `copilot+ --snippets` | Bookmarks (`--bookmarks` alias) |
| `copilot+ --usage` | Local history + premium quota |
| `copilot+ --workflows` | List prompt chains |
| `copilot+ --worktree [name]` | Isolated git worktree |
| `copilot+ --export-config` / `--import-config` | Share team config |
| `copilot+ --doctor` | Validate config + environment |
| `copilot+ --setup` | Dependencies + microphone |
| `copilot+ --preferences` | Re-run onboarding |
| `copilot+ --ask "q"` | One-shot query |
| `copilot+ --help-plus` | Full help |
| `copilot+ --version` | Print version |

---

## Requirements

| | macOS | Windows | Linux |
|---|---|---|---|
| Copilot CLI + Node ≥ 18 | required | required | required |
| ffmpeg + whisper.cpp *(voice)* | `brew install ffmpeg whisper-cpp` | winget FFmpeg + [whisper.cpp release](https://github.com/ggerganov/whisper.cpp/releases) | distro ffmpeg; build whisper.cpp |
| Clipboard / screenshot / TTS | built-in | built-in | `wl-clipboard` or `xclip`; `grim`+`slurp` or `scrot`; `spd-say` / `espeak-ng` |

Download a Whisper model (not shipped on npm):

```bash
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin
```

Then `copilot+ --setup`. For other languages, use a non-`.en` model and set `voiceLanguage` (ISO 639-1 or `"auto"`).

---

## Daily use

**Voice.** Ctrl+R to start, speak, Ctrl+R to stop. Transcription is local. Ctrl+C cancels. Optional wake phrase (`wakeWord.enabled`) listens for “hey copilot”.

**Screenshots.** Ctrl+P opens the OS region picker and injects `@/path`. Paths with spaces are quoted.

**Clipboard / git / shell.** Ctrl+Y pastes text or an image. Ctrl+G injects git status and diff (`contextHotkey.kinds` can add `"recent"` / `"branch"`). `!ls -la` runs in `$SHELL` (15s / 16 KiB cap) and injects a fenced block.

**Safety.** Outgoing prompts are scanned for common keys and private-key headers. Choose send / redact / cancel, or set `safety.autoRedact: true`. Disable with `safety.enabled: false`.

**Queue & stash.** While Copilot is answering, Enter queues the line. Ctrl+S parks a draft (`~/.copilot/prompt-stash.json`).

**Workflows.** Drop YAML/JSON in `~/.copilot/workflows/` and run from the palette. Variables: `{{cwd}}`, `{{git_branch}}`, `{{clipboard}}`, `{{date}}`.

```yaml
name: Fix & Test
steps:
  - prompt: "Run the failing tests and show the errors"
    wait: true
  - prompt: "Fix the failures"
    wait: true
```

**Monitor.** `copilot+ --monitor` — `j`/`k` select, `/` filter, `s` sort, `K` SIGTERM, `q` quit.

**Plugins.** Put `*.js` / `*.cjs` in `~/.copilot/plugins/`. Hooks: `beforeSend`, `afterReceive`, `afterPrompt`, `onModelSwitch`, `onBookmark`. Reload from the palette. Errors in one plugin are isolated.

---

## Configuration

`~/.copilot/copilot-plus.json` (created on first run). Re-run `copilot+ --preferences` anytime.

| Key | Default | |
|-----|---------|-|
| `modelPath` | auto-detected | Whisper `.bin` |
| `audioDevice` | auto-detected | ffmpeg input (`":2"` / device name / `pulse:default`) |
| `autoSubmit` | `false` | Enter after voice |
| `voicePreview` | `false` | Edit transcription before send |
| `voiceLanguage` | `"en"` | `en` / `auto` / ISO 639-1 |
| `theme` | `"dark"` | `dark` `light` `solarized` `monokai` `auto` |
| `shellPrefix` | `"!"` | Shell-exec prefix |
| `historyEnabled` | `true` | `~/.copilot/history.jsonl` |
| `workhorseModels` | empty | Slots 1–4 |
| `autoModels` | empty | `fast` / `medium` / `powerful` (fallback: slots 1 / 1 / 2) |
| `macros` | empty | Slots 1–9 |
| `wakeWord` | off | `{ enabled, phrase, chunkSeconds }` |
| `tts` | off | `{ enabled, rate, voice }` |
| `safety` | on | `{ enabled, disabledKinds, autoRedact }` |
| `contextHotkey.kinds` | `["status","diff"]` | also `recent`, `branch` |
| `notifications` | idle / waiting / quota | `quiet`, `webhookUrl`, `rules` (`os` / `bell` / `webhook`) |
| `queue` | `{ whenBusy: true, maxSize: 20 }` | |
| `usage` | `{ dailyBudget: 0, handoffAtPct: 90 }` | |
| `workflowsDir` | `~/.copilot/workflows` | |

Quota lookup uses `COPILOT_GITHUB_TOKEN`, then `GH_TOKEN` / `GITHUB_TOKEN`, then `gh auth token`. Log level: `COPILOT_PLUS_LOG`. Theme override: `COPILOT_PLUS_THEME`.

Config export copies settings and workflows only — not GitHub tokens or notification webhook URLs.

---

## Troubleshooting

**`posix_spawnp failed`** — reinstall: `npm install -g copilot-plus` (postinstall fixes `node-pty` helper permissions).

**Wrong mic / same word every time** — `copilot+ --setup`, or set `audioDevice` from `ffmpeg -f avfoundation -list_devices true -i ""` (macOS) / `ffmpeg -f dshow -list_devices true -i dummy` (Windows) / `pactl list short sources` (Linux, `pulse:<name>`).

**Mic permission** — enable the terminal app under OS privacy settings.

**No whisper model** — download `ggml-base.en.bin` as above, then `--setup`.

**Wake word silent** — shorter phrase; raise `wakeWord.chunkSeconds` to 3–4.

**Opt+Shift / Opt+N dead in Apple Terminal** — Settings → Profiles → Keyboard → **Use Option as Meta Key**. kitty/WezTerm/Windows Terminal: send CSI u (WezTerm: `enable_kitty_keyboard = true`).

**Screenshot / clipboard / TTS no-op on Linux** — install grim+slurp or scrot; wl-clipboard or xclip; spd-say or espeak-ng.

**Safety false positive** — `r` redact, or `safety.disabledKinds: ["github_token"]`.

`copilot+ --doctor` checks binaries, model, and config in one pass.

---

## License

MIT © [Errr0rr404](https://github.com/Errr0rr404)

[Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Issues](https://github.com/Errr0rr404/copilot-plus/issues)
