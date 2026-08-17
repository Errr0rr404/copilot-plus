# copilot+

<p align="center">
  <a href="https://www.npmjs.com/package/copilot-plus">
    <img src="https://img.shields.io/npm/v/copilot-plus?color=cb3837&logo=npm&logoColor=white&label=npm" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/copilot-plus">
    <img src="https://img.shields.io/npm/dm/copilot-plus?color=cb3837&logo=npm&logoColor=white&label=downloads" alt="npm downloads" />
  </a>
  <a href="https://github.com/Errr0rr404/copilot-plus/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/copilot-plus?color=blue" alt="license: MIT" />
  </a>
  <img src="https://img.shields.io/node/v/copilot-plus?color=339933&logo=node.js&logoColor=white&label=node" alt="node ≥18" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="platform" />
  <a href="https://github.com/Errr0rr404/copilot-plus">
    <img src="https://img.shields.io/github/stars/Errr0rr404/copilot-plus?style=flat&logo=github&color=yellow" alt="GitHub stars" />
  </a>
</p>

<p align="center">
  <strong>Talk to <a href="https://docs.github.com/copilot/concepts/agents/about-copilot-cli">GitHub Copilot CLI</a> with your voice — share screenshots & clipboard — queue prompts while it works — run multi-step workflows — switch AI models instantly — search every prompt you've ever sent — and monitor every running session from one live dashboard.</strong>
</p>

**Who it’s for.** Developers who already run GitHub Copilot CLI in a terminal and want local voice, screenshots, a prompt queue, workflows, safety scanning, and a multi-session monitor — without leaving the CLI. `copilot+` does **not** replace Copilot CLI: you still need a Copilot subscription and the official `copilot` binary on your `PATH`.

<p align="center">
  <a href="https://www.npmjs.com/package/copilot-plus">📦 View on npm</a> ·
  <a href="https://github.com/Errr0rr404/copilot-plus">⭐ Star on GitHub</a> ·
  <a href="https://github.com/Errr0rr404/copilot-plus/issues">🐛 Report a Bug</a> ·
  <a href="CHANGELOG.md">📝 Changelog</a>
</p>

---

`copilot+` is a drop-in replacement for the `copilot` command. It wraps Copilot CLI transparently and adds:

| Hotkey | What it does |
|--------|-------------|
| **?**  / **Ctrl+/** | In-app cheatsheet — every hotkey, generated from live config |
| **Ctrl+K** | Open command palette — fzf-style fuzzy search across every feature |
| **Ctrl+R** | Voice recording → transcribed locally with whisper.cpp |
| **Ctrl+P** | Screenshot picker → file path injected as `@/path/screenshot.png` |
| **Ctrl+Y** | Paste clipboard (text or image) as context |
| **Ctrl+G** | Inject smart context: git diff, status, recently-modified files |
| **Ctrl+O** | Attach a project file as `@/abs/path` (fuzzy picker) |
| **Ctrl+S** | Stash the current prompt draft (restore from palette) |
| **Ctrl+E** | Open the last response in `$EDITOR` |
| **Ctrl+T** | Toggle text-to-speech — read responses aloud (`say`/`spd-say`/PS) |
| **Ctrl+B** | Bookmark the last response — browse with `copilot+ --snippets` |
| **Enter** *(while busy)* | Queue the prompt; auto-sends when the agent is idle |
| **`!cmd`** | Type `!ls -la` (Enter) — runs in shell, output injected as a fenced block |
| **Option+Shift+1–4** *(macOS)* / **Ctrl+Shift+1–4** *(kitty/WezTerm/WT)* | Switch workhorse model slots |
| **Option+Shift+5** / **Ctrl+Shift+5** | Toggle ⚡ Auto Mode — model selected per prompt complexity |
| **Option+1–9** / **Ctrl+1–9** | Execute a prompt macro |

| Command | What it does |
|--------|-------------|
| `copilot+`                  | Launch with every enhancement |
| `copilot+ --monitor`        | Live, interactive multi-session dashboard |
| `copilot+ --history [q]`    | Search every prompt you've sent |
| `copilot+ --snippets`       | Browse bookmarked responses (`--bookmarks` is an alias) |
| `copilot+ --usage`          | Local history + premium quota summary |
| `copilot+ --workflows`      | List multi-step prompt workflows |
| `copilot+ --worktree [name]`| Create an isolated git worktree for parallel work |
| `copilot+ --export-config`  | Export shareable config (+ workflows) package |
| `copilot+ --import-config`  | Import team config (`--overwrite` optional) |
| `copilot+ --doctor`         | Validate config + environment |
| `copilot+ --setup`          | Re-check dependencies & pick microphone |
| `copilot+ --preferences`    | Re-run onboarding wizard |
| `copilot+ --ask "question"` | One-shot non-interactive query |
| `copilot+ --help-plus`      | Full inline help |
| `copilot+ --version`        | Print version and exit |

Everything else — all Copilot CLI features, slash commands, modes — works exactly as normal.

> **🔒 Pre-send safety scanner.** Every prompt is scanned for common API keys, tokens, and private-key headers before it leaves your terminal. Send / redact / cancel — your call. Disable with `safety.enabled: false`.

> **🌍 Multi-language voice.** Set `voiceLanguage: "es"` (or any ISO 639-1 code, or `"auto"`) in `~/.copilot/copilot-plus.json` to transcribe in 99+ languages. The usual `*.en` whisper model is English-only — drop a non-`.en` model in `~/.copilot/models/` (or set `modelPath`) for other languages. Whisper models are **not** shipped in the npm tarball.

> **🎨 Themed UI.** `dark`, `light`, `solarized`, `monokai`, or `auto` — applied across palette, monitor, cheatsheet, doctor, and onboarding. Switch via Ctrl+K.

> **🧩 Plugin system.** Drop any `*.js` or `*.cjs` file in `~/.copilot/plugins/` to subscribe to `beforeSend`, `afterReceive`, `afterPrompt`, `onModelSwitch`, `onBookmark`. Reload from the palette without restarting.

> **⛓ Prompt workflows.** Drop YAML/JSON chains in `~/.copilot/workflows/` and run them from the palette. Example:
> ```yaml
> name: Fix & Test
> steps:
>   - prompt: "Run the failing tests and show the errors"
>     wait: true
>   - prompt: "Fix the failures"
>     wait: true
>   - prompt: "Re-run tests and confirm green"
> ```

> **📥 Prompt queue & stash.** Type the next prompt while Copilot is still working — it queues and auto-sends when idle. Mid-prompt interruption? **Ctrl+S** stashes the draft.

> **🔔 Smart notifications.** Config rules `session_idle`, `waiting_input` (silence threshold), and `quota_above` via channels `os` / `bell` / `webhook`.

---

## Stack

| | From the repo today |
|---|---|
| **Package** | `copilot-plus` **v1.2.0** (`package.json`) |
| **CLI** | `copilot+` → `bin/copilot+` |
| **Language** | Node.js CommonJS (no TypeScript compile step) |
| **Runtime** | Node.js **≥ 18** (`engines.node`) |
| **Library** | `node-pty` `^1.0.0` (lockfile **1.1.0**) |
| **License** | MIT |
| **Platforms** | macOS, Windows, Linux |
| **Wraps** | GitHub Copilot CLI (`copilot` on `PATH`) |
| **Voice (optional)** | `ffmpeg` + whisper.cpp (`whisper-cli`) + a local `.bin` model |
| **CI publish** | GitHub Actions on `v*` tags, Node **20** (see [Release / deploy](#release--deploy)) |

## Requirements

| | macOS | Windows | Linux |
|---|---|---|---|
| **OS** | macOS 12+ | Windows 10/11 | any modern distro |
| **[GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)** | required | required | required |
| **Node.js ≥ 18** | `brew install node` | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS` | distro pkg / `nvm` |
| **ffmpeg** | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `apt install ffmpeg` / `dnf install ffmpeg` |
| **whisper.cpp** | `brew install whisper-cpp` | [Manual install](#windows-whisper-setup) | build from source — [github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp) |
| **Clipboard** *(Ctrl+Y)* | built-in (`pbpaste`) | built-in (PowerShell) | `wl-clipboard` or `xclip` |
| **Screenshot** *(Ctrl+P)* | built-in (`screencapture`) | built-in (Snip & Sketch) | `grim`+`slurp` (Wayland) / `gnome-screenshot` / `spectacle` / `scrot` / `maim` |
| **TTS** *(Ctrl+T)* | built-in (`say`) | built-in (System.Speech) | `spd-say` (speech-dispatcher) / `espeak-ng` / `espeak` |
| **Notifications** | built-in (`osascript`) | built-in (PowerShell) | `notify-send` (libnotify) |

> **Apple Silicon:** The `base.en` model transcribes in ~1–2 s on M1/M2/M3.

---

## Installation

### Option A — npm (macOS, Windows, Linux)

```bash
npm install -g copilot-plus
```

The package’s `postinstall` script chmods `node-pty` spawn helpers on macOS and Linux so the PTY wrapper can start.

### Option B — Homebrew (macOS)

```bash
brew tap Errr0rr404/copilot-plus
brew install copilot-plus
```

The tap repo is [Errr0rr404/homebrew-copilot-plus](https://github.com/Errr0rr404/homebrew-copilot-plus). The formula in this repo under `Formula/` is a snapshot used by that tap.

---

### macOS — install speech dependencies

```bash
brew install ffmpeg whisper-cpp

# Download speech model (Option A — helper script)
whisper-cpp-download-ggml-model base.en

# Download speech model (Option B — direct curl, always works)
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin
```

### Windows — install speech dependencies

**1. Install ffmpeg:**
```powershell
winget install Gyan.FFmpeg
```

**2. Install whisper-cli:**  <a name="windows-whisper-setup"></a>
- Download the latest `whisper-cli.exe` from [github.com/ggerganov/whisper.cpp/releases](https://github.com/ggerganov/whisper.cpp/releases)
- Place it somewhere on your PATH (e.g. `C:\Windows\System32\` or add the folder to PATH)

**3. Download the speech model:**
```powershell
mkdir "$env:USERPROFILE\.copilot\models" -Force
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" `
  -o "$env:USERPROFILE\.copilot\models\ggml-base.en.bin"
```

### Linux — install speech dependencies

```bash
# Debian/Ubuntu
sudo apt install ffmpeg
# Fedora
# sudo dnf install ffmpeg

# whisper-cli — build from https://github.com/ggerganov/whisper.cpp and put it on PATH

mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin
```

Clipboard / screenshot / TTS helpers are listed in [Requirements](#requirements). Install those only if you use the matching hotkeys.

### Verify setup

```bash
copilot+ --setup
```

You should see all green checkmarks. If anything is missing, the setup output tells you exactly what to fix.

The setup wizard also lists all detected audio input devices and lets you pick the right microphone interactively — the choice is saved to `~/.copilot/copilot-plus.json` so you never need to edit the file manually.

---

## Quick Start

```bash
copilot+
```

That's it. You're now inside Copilot CLI with the wrapper enhancements active. Voice and screenshots need the optional speech / capture tools above; everything else works without them.

### Develop from this repo

```bash
git clone https://github.com/Errr0rr404/copilot-plus.git
cd copilot-plus
npm install
node bin/copilot+ --help-plus
npm test
```

| npm script | What it runs |
|---|---|
| `npm test` | `node tests/run.js` — zero-dep in-repo suite |
| `npm run setup` | `node bin/copilot+ --setup` |
| `npm run postinstall` | `node scripts/postinstall.js` (chmod `node-pty` helpers on darwin/linux) |

There is no build step. After `npm install`, run `node bin/copilot+` (or link the bin) with GitHub Copilot CLI on your `PATH`.

---

## Using Voice Input

1. **Press `Ctrl+R`** to start recording.  
   A system notification appears and your terminal title changes to `🎙 Recording…`

2. **Speak your prompt** naturally — e.g. _"refactor this function to use async await"_

3. **Press `Ctrl+R` again** to stop.  
   Transcription runs locally (`⏳ Transcribing…`) — no audio ever leaves your machine.

4. **Your words appear as text** in the Copilot prompt. Review and edit if needed, then press **Enter** to send.

> Press **Ctrl+C** while recording to cancel without transcribing.

---

## Using Screenshots

**macOS:** Press `Ctrl+P` — the interactive screenshot overlay opens (same UI as `⌘⇧4`). Click and drag to select any area. The file path is injected into your prompt as `@/tmp/copilot-screenshots/screenshot-<timestamp>.png`.

**Windows:** Press `Ctrl+P` — the Snip & Sketch overlay opens (same as `Win+Shift+S`). Draw a selection; the file path is injected automatically when you complete the snip.

**Linux:** Press `Ctrl+P` — uses `grim`+`slurp` on Wayland, otherwise probes `gnome-screenshot` / `spectacle` / `scrot` / `maim` in order.

Add context if you want (e.g. _"what's wrong with this?"_), then press **Enter**.

---

## Clipboard, Shell, & Smart Context

`copilot+` removes three of the daily papercuts that come with text-only AI CLIs:

```bash
Ctrl+Y            # paste clipboard — text becomes prompt, image becomes @path
Ctrl+G            # inject git diff + status + recently-modified files
!ls -la <Enter>   # run shell command; output injected as fenced block
```

The `!cmd` shell prefix uses your `$SHELL` (or `cmd.exe` on Windows), runs with a 15-second cap and a 16 KiB output cap, and injects the result as a ```` ```shell ```` block. You can change the prefix character with `shellPrefix: "/"` in your config.

Ctrl+G's "smart context" gathers the most relevant repo signals for the current cwd. Configure which kinds to include:

```json
{
  "contextHotkey": { "kinds": ["status", "diff", "recent"] }
}
```

---

## Safety Scanner

Every prompt is scanned before it leaves your terminal. If it looks like a secret (AWS / GitHub / OpenAI / Anthropic / Google / Slack / Stripe / private key / JWT / generic password), you'll get a confirm:

```
⚠️  Your prompt looks like it contains secrets: github_token, aws_access_key
    [s] send anyway    [r] redact & send    [c] cancel  ▸
```

Set `safety.autoRedact: true` to silently redact without prompting, or `safety.enabled: false` to disable entirely.

---

## History & Bookmarks

Every prompt is appended to `~/.copilot/history.jsonl`. Search it:

```bash
copilot+ --history                    # newest 50
copilot+ --history "docker compose"   # token-AND substring search
copilot+ --history --clear            # wipe everything
```

Press **Ctrl+B** at any time to bookmark the last response. Then browse:

```bash
copilot+ --snippets                   # all bookmarks, newest first
copilot+ --snippets "docker"          # filter by substring
```

Disable history with `historyEnabled: false`.

Usage summary (local history + premium quota when a GitHub token is available):

```bash
copilot+ --usage
```

---

## Prompt Queue, Stash & Editor

While the agent is still generating a response, type your next prompt and press **Enter** — it is **queued** and auto-sent when the session goes idle. Configure with `queue.whenBusy` / `queue.maxSize`.

| Hotkey | What it does |
|--------|-------------|
| **Enter** *(while busy)* | Enqueue the current line |
| **Ctrl+S** | Stash the draft prompt (stack in `~/.copilot/prompt-stash.json`) |
| **Ctrl+E** | Open the last response in `$VISUAL` / `$EDITOR` |
| **Ctrl+O** | Fuzzy-pick a project file and inject `@/abs/path` |

Restore stash, flush/clear the queue, and open handoffs from the **Ctrl+K** palette.

---

## Workflows

Automate multi-step prompt chains. Drop files in `~/.copilot/workflows/`:

```yaml
# ~/.copilot/workflows/fix-test.yaml
name: Fix & Test
steps:
  - prompt: "Run the failing tests and show the errors"
    wait: true
  - prompt: "Fix the failures"
    wait: true
  - prompt: "Re-run tests and confirm green"
```

Variables: `{{cwd}}`, `{{git_branch}}`, `{{clipboard}}`, `{{date}}`.

```bash
copilot+ --workflows          # list chains
# Then: Ctrl+K → Workflow: Fix & Test
```

JSON workflows (`.json`) are also supported.

---

## Config Sharing & Worktrees

Share macros, models, theme, safety, notifications, and workflows with your team. Export copies config keys only — it does not include GitHub tokens or other credentials.

```bash
copilot+ --export-config ./team-copilot-plus.json
copilot+ --import-config ./team-copilot-plus.json          # merge
copilot+ --import-config ./team-copilot-plus.json --overwrite
```

Run parallel agents in isolated git worktrees:

```bash
copilot+ --worktree feature-x
# → creates .copilot-worktrees/feature-x on branch copilot+/feature-x
cd .copilot-worktrees/feature-x && copilot+
```

When premium usage crosses `usage.handoffAtPct` (default 90%), a markdown handoff is written to `~/.copilot/handoffs/` so you can resume later. Trigger manually from the palette anytime.

---

## Text-to-Speech

Press **Ctrl+T** to toggle reading responses aloud. Code blocks, ANSI codes, and markdown noise are stripped automatically — only the prose is spoken.

- **macOS** — uses `say` (always present)
- **Windows** — uses `System.Speech.Synthesis.SpeechSynthesizer` (always present on Win10+)
- **Linux** — uses `spd-say`, `espeak-ng`, or `espeak` (whichever it finds)

Tune via `tts: { enabled, rate, voice }` in config.

---

## Plugins / Hooks

Drop any `.js` or `.cjs` file in `~/.copilot/plugins/`. Export an object (or a function that returns one) with any of these hooks:

```js
// ~/.copilot/plugins/log-prompts.js
module.exports = {
  name: 'log-prompts',
  beforeSend({ text, kind, cancel }) {
    if (text.includes('rm -rf')) return { cancel: true };
    // return { replaceWith: 'safer version' } to mutate
  },
  afterPrompt(record) {
    require('fs').appendFileSync('/tmp/my-prompts.log', record.prompt + '\n');
  },
};
```

Hooks fire in load order; errors in one plugin never break the wrapper. Reload all plugins from the palette (Ctrl+K → "Reload plugins").

---

## First-Run Setup

On your first launch of `copilot+`, an interactive onboarding wizard walks you through every feature:

- **Theme** — dark, light, solarized, monokai, auto
- **Voice language** — `en`, `auto`, or any ISO 639-1
- **Voice preview** — review/edit transcription before sending
- **Voice Activation** — hands-free wake phrase
- **Workhorse model slots** — Ctrl+Shift+1–4 / Option+Shift+1–4
- **Auto Mode tiers** — fast / medium / powerful
- **Prompt macros** — Option+1–9 / Ctrl+1–9
- **Safety scanner** — pre-send secret detection
- **History** — searchable prompt log
- **TTS** — read responses aloud

Your choices are saved to `~/.copilot/copilot-plus.json`. Re-run the wizard anytime:

```bash
copilot+ --preferences
```

Verify everything is working:

```bash
copilot+ --doctor
```

---

## Command Palette

Press **Ctrl+K** to open the command palette — a searchable overlay listing every copilot-plus action. Ranking is fzf-style fuzzy: type `vrec` to jump to "Voice Recording"; type `t monokai` to switch theme. Recently-used actions float to the top.

Entries include:

- 🎙 Voice Recording / Voice Activation toggle
- 📸 Screenshot · 📋 Paste Clipboard · 🧠 Inject Smart Context · 📎 Attach File
- 💾 Stash / Restore prompt · 📝 Open last response in editor · 🔖 Bookmark
- 📥 Flush / clear prompt queue · ⛓ Run workflow · 🌳 Worktree · 📦 Handoff
- 🔊 Toggle TTS · ❓ Cheatsheet
- ⚡ Auto Mode toggle + configure Fast / Medium / Powerful model tiers
- 🤖 Workhorse Models 1–4 (switch or configure)
- ⌨️ Macros 1–9 (execute or edit inline)
- 🎨 Theme picker · 🧩 Reload plugins · ⚙️ Open Preferences

**Navigation:** `↑↓` to move, type to filter, **Enter** to select, **Esc** to close, **Ctrl+U** to clear filter.

**Editing items from the palette:** any item marked ✏ supports inline editing. Press **Enter** to open the editor, then:
- **Enter** — save and immediately activate (switch model / run macro)
- **Tab** — save without activating
- **Esc** — go back without saving

---

## Agent Monitor

Run `copilot+ --monitor` in any terminal to open a live dashboard showing every running copilot session on your machine:

```bash
copilot+ --monitor
```

```
╭──────────────────────────── copilot+ monitor ─────────────────────────────╮
│  3 active  ·  1 need attention      updates every 1.5s  ·  4:36 PM  ·  q  │
│  individual pro  ·  587/1500 premium req  █████░░░░░░░  resets 2026-04-01  │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚠  ATTENTION    pid 46206  claude-sonnet-4.6    ~/projects/api            │
│                8 premium req     started 14m ago  ·  8 msgs  ·  active 1m  │
├────────────────────────────────────────────────────────────────────────────┤
│  ●  IDLE         pid 51111  gpt-4.1               ~/projects/frontend       │
│                3 premium req     started 8m ago  ·  3 msgs  ·  active now  │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│  ●  IDLE         pid 28741  [copilot CLI]         ~/projects/docs           │
│                [unmanaged – no stats]    started 1h ago                     │
╰────────────────────────────────────────────────────────────────────────────╯
```

**What you see:**

| Item | Description |
|------|-------------|
| **Header quota bar** | Your plan, premium requests used/remaining this month, and reset date — pulled live from the GitHub Copilot API |
| **Status badge** | `ATTENTION` (response waiting >30 s), `THINKING` (waiting for response), `IDLE`, `RECORDING`, `TRANSCRIBING`, `DONE` |
| **Premium req count** | Number of AI exchanges in this session (copilot+ managed sessions only) |
| **`[copilot CLI]`** | A bare `copilot` session not started through `copilot+` — no per-session stats available |

**Controls** (interactive):

| Key | What it does |
|---|---|
| `j` / `k` / `↑` / `↓` | Select previous / next agent |
| `/`                    | Type to filter (Esc to clear, Enter to commit) |
| `s`                    | Cycle sort: status → started → activity → pid |
| `o`                    | Open the selected agent's cwd in a new terminal tab |
| `K`                    | Send SIGTERM to the selected agent |
| `r`                    | Force-refresh the quota line now |
| `?`                    | Toggle inline help |
| `q` / `Q` / `Ctrl+C` / `Esc` | Exit |

Sessions disappear automatically when the `copilot` process exits. Stale entries older than 5 minutes are pruned.

---

## Workhorse Models

Assign up to 4 AI models to slots so you can switch between them instantly with a single hotkey — no more typing `/model` each time.

### Setup

The easiest way: open the command palette (**Ctrl+K**), navigate to a **Workhorse** entry, press **Enter**, type the model name (e.g. `claude-sonnet-4.6`), and press **Enter** to save and switch immediately.

You can also edit `~/.copilot/copilot-plus.json` directly:

```json
{
  "workhorseModels": {
    "1": "claude-sonnet-4.6",
    "2": "claude-opus-4.5",
    "3": "gpt-4.1",
    "4": "o3"
  }
}
```

### Switching models

| Terminal | Hotkey |
|----------|--------|
| **macOS Terminal.app** | **Option+Shift+1–4** — requires "Use Option as Meta Key" (same as macros) |
| **kitty / WezTerm** | **Ctrl+Shift+1–4** — works natively |
| **Windows Terminal** | **Ctrl+Shift+1–4** — works natively |
| **Any terminal** | **Ctrl+K** → navigate to a Workhorse entry → **Enter** |

Switching clears the current input line and sends `/model <name>` to Copilot CLI, then shows a macOS/Windows notification confirming the switch.

> **Note:** Activating a workhorse slot (1–4) automatically turns Auto Mode off.

---

## ⚡ Auto Mode

Auto Mode routes each prompt to the right model automatically — no manual switching required.

### How it works

When Auto Mode is on, copilot+ intercepts every **Enter** keypress, analyses the prompt you typed, picks a model tier, and switches to it (if needed) before submitting:

| Tier | When selected | Example prompts |
|------|--------------|-----------------|
| **Fast** | Short prompts (<80 chars) with question/explanation keywords | "explain this function", "what is a closure?" |
| **Powerful** | Long prompts (>200 chars) or implementation/task keywords | "implement", "refactor", "debug", "build", "create" |
| **Medium** | Everything else | general conversation, moderate-length requests |

### Setup

Configure the three tiers via **Ctrl+K** → navigate to an **Auto** entry → **Enter** → type a model name → **Enter**.

Or edit `~/.copilot/copilot-plus.json` directly:

```json
{
  "autoModels": {
    "fast":     "claude-haiku-4.5",
    "medium":   "claude-sonnet-4.6",
    "powerful": "claude-opus-4.6"
  }
}
```

If a tier is left empty it falls back to the corresponding workhorse slot (`fast`/`medium` → slot 1, `powerful` → slot 2).

### Toggling Auto Mode

| Terminal | Hotkey |
|----------|--------|
| **macOS Terminal.app** | **Option+Shift+5** — requires "Use Option as Meta Key" |
| **kitty / WezTerm** | **Ctrl+Shift+5** — works natively |
| **Windows Terminal** | **Ctrl+Shift+5** — works natively |
| **Any terminal** | **Ctrl+K** → **⚡ Auto Mode** → **Enter** |

When active, the terminal title shows `copilot [⚡ auto]` and a notification fires on each prompt showing which tier was selected. Switching to a workhorse slot (1–4) automatically turns Auto Mode off.

---

## Prompt Macros

Assign frequently used prompts to macro slots. When triggered, the saved text is instantly injected into your Copilot prompt.

### macOS (Apple Terminal)

Macros are triggered with **Option+1** through **Option+9**.

**One-time setup:** Open Terminal → Settings → Profiles → Keyboard → check **"Use Option as Meta Key"**.

### macOS (kitty / WezTerm / iTerm2) and Windows Terminal

Macros are triggered with **Ctrl+1** through **Ctrl+9** (these terminals support CSI u key encoding natively — no extra setup needed).

### Setting macros

The easiest way is via the **command palette** (Ctrl+K → navigate to a macro → Enter to edit).

You can also set them during onboarding, via `copilot+ --preferences`, or by editing `~/.copilot/copilot-plus.json` directly:

```json
{
  "macros": {
    "1": "Write unit tests for this code",
    "2": "Explain this code step by step",
    "3": "Refactor this to use async/await"
  }
}
```

---

## Voice Activation

Say **"hey copilot"** or just **"copilot"** to start recording hands-free — no accounts, no API keys, no extra installs.

**How it works:**
1. Always listens for your wake phrase using whisper.cpp (near-zero CPU when silent)
2. Phrase detected → recording starts automatically
3. You speak your prompt
4. You pause → transcription runs locally → text is injected into copilot
5. Returns to listening — ready for the next trigger

### Setup

Enable during first run or via `copilot+ --preferences`. Choose any wake phrase:
- `"hey copilot"` (default) — or just say `"copilot"` without the "hey", both work
- `"ok computer"`, `"yo copilot"`, or any short distinctive phrase

---

## Passing Flags to Copilot

Any arguments after `copilot+` are forwarded directly to `copilot`:

```bash
copilot+ --experimental
copilot+ --banner
copilot+ --help
```

---

## Configuration

Settings are stored at `~/.copilot/copilot-plus.json` (created automatically on first run).

```json
{
  "modelPath": "/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin",
  "audioDevice": ":2",
  "autoSubmit": false,
  "voicePreview": false,
  "voiceLanguage": "en",
  "theme": "dark",
  "shellPrefix": "!",
  "historyEnabled": true,
  "firstRunComplete": true,
  "workhorseModels": {
    "1": "claude-sonnet-4.6",
    "2": "claude-opus-4.5",
    "3": "gpt-4.1",
    "4": "o3"
  },
  "autoModels": {
    "fast":     "claude-haiku-4.5",
    "medium":   "claude-sonnet-4.6",
    "powerful": "claude-opus-4.6"
  },
  "macros": {
    "1": "Write unit tests for this code",
    "2": "Explain this code step by step"
  },
  "wakeWord": {
    "enabled": false,
    "phrase": "hey copilot",
    "chunkSeconds": 2
  },
  "tts":           { "enabled": false, "rate": 200, "voice": "" },
  "safety":        { "enabled": true, "disabledKinds": [], "autoRedact": false },
  "contextHotkey": { "kinds": ["status", "diff"] },
  "notifications": {
    "quiet": false,
    "sound": false,
    "webhookUrl": "",
    "rules": [
      { "when": "session_idle", "channels": ["os"] },
      { "when": "waiting_input", "afterMs": 60000, "channels": ["os", "bell"] },
      { "when": "quota_above", "pct": 80, "channels": ["os"] }
    ]
  },
  "queue":  { "whenBusy": true, "maxSize": 20 },
  "usage":  { "dailyBudget": 0, "handoffAtPct": 90 },
  "workflowsDir": ""
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `modelPath` | auto-detected | Path to your whisper `.bin` model file. Auto-heals if it moves. |
| `audioDevice` | auto-detected | ffmpeg input device. macOS `":2"` · Windows `"Microphone (Realtek Audio)"` · Linux `"pulse:default"` / `"alsa:hw:0,0"`. |
| `autoSubmit` | `false` | Auto-press Enter after voice transcription |
| `voicePreview` | `false` | Drop transcription into the prompt for review/edit instead of sending |
| `voiceLanguage` | `"en"` | `"en"` / `"auto"` / any ISO 639-1 — passed to whisper-cli |
| `theme` | `"dark"` | `dark` / `light` / `solarized` / `monokai` / `auto` |
| `shellPrefix` | `"!"` | One-char prefix that triggers shell-exec when followed by a command |
| `historyEnabled` | `true` | Append every prompt to `~/.copilot/history.jsonl` |
| `workhorseModels` | all empty | AI model slots 1–4 |
| `autoModels.{fast,medium,powerful}` | empty | Auto-mode tiers; fall back to workhorse slot 1/2 |
| `macros` | all empty | Prompt macros, slots 1–9 |
| `wakeWord.enabled` / `.phrase` / `.chunkSeconds` | off / "hey copilot" / 2 | Voice activation |
| `tts.enabled` / `.rate` / `.voice` | off / 200 / "" | Read responses aloud |
| `safety.enabled` / `.disabledKinds` / `.autoRedact` | on / [] / off | Pre-send secret scanner |
| `contextHotkey.kinds` | `["status", "diff"]` | What Ctrl+G gathers — `status`/`diff`/`recent`/`branch` |
| `notifications.quiet` | `false` | Suppress OS notifications (still goes to log file) |
| `notifications.webhookUrl` | `""` | POST JSON payloads for rules that include channel `webhook` |
| `notifications.rules` | idle / waiting / quota | See Smart notifications callout above |
| `queue.whenBusy` | `true` | Enter while agent is responding → enqueue instead of send |
| `queue.maxSize` | `20` | Max pending prompts |
| `usage.dailyBudget` | `0` | Optional local daily prompt budget (`--usage`); `0` = off |
| `usage.handoffAtPct` | `90` | Auto-write handoff markdown when premium ≥ this % |
| `workflowsDir` | `""` | Custom workflows directory; empty → `~/.copilot/workflows` |

### Environment variables

Names only — do not put tokens or other secrets in the repo, issues, or docs. Quota features also work via `gh auth token` or Copilot’s local apps file if no token env is set.

| Name | Used for |
|---|---|
| `COPILOT_PLUS_LOG` | Log level for `~/.copilot/copilot-plus.log` (`debug` / `info` / `warn` / `error`; default `warn`) |
| `COPILOT_PLUS_THEME` | One-shot theme override (`dark` / `light` / `solarized` / `monokai` / `auto`) |
| `COPILOT_GITHUB_TOKEN` | GitHub token for `--monitor` / `--usage` quota (checked first) |
| `GH_TOKEN` | Same quota lookup (fallback) |
| `GITHUB_TOKEN` | Same quota lookup (fallback) |
| `VISUAL` | Editor for Ctrl+E / palette “open last response” (preferred) |
| `EDITOR` | Editor fallback if `VISUAL` is unset |
| `SHELL` | Shell for `!cmd` on macOS/Linux |
| `ComSpec` | Shell for `!cmd` on Windows |
| `TERM` | PTY terminal type (default `xterm-256color`) |
| `APPDATA` | Windows: Copilot apps-file token discovery |
| `LOCALAPPDATA` | Windows: Copilot apps-file token discovery |

### Available whisper models

| Model | Size | Speed (M2) | Accuracy |
|-------|------|------------|----------|
| `tiny.en` | 75 MB | ~0.5 s | Good |
| `base.en` | 142 MB | ~1 s | Better |
| `small.en` | 466 MB | ~3 s | Best for most |

```bash
# macOS
whisper-cpp-download-ggml-model small.en

# Windows — download directly and update modelPath in config
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin" `
  -o "$env:USERPROFILE\.copilot\models\ggml-small.en.bin"
```

Then update `modelPath` in `~/.copilot/copilot-plus.json`.

---

## How It Works

```
┌────────────────────────────────────────────────────────────────────┐
│  copilot+ (PTY wrapper)                                            │
│                                                                    │
│  keystrokes ─► hotkey dispatch ─► overlays (palette/cheatsheet)    │
│                                                                    │
│                  ├── Ctrl+R  → mic/whisper → text                  │
│                  ├── Ctrl+P  → screencapture/Snip/grim → @path     │
│                  ├── Ctrl+Y  → pbpaste/PS/wl-paste → text/@image    │
│                  ├── Ctrl+G  → git diff/status/recents → context    │
│                  ├── Ctrl+O  → file picker → @path                  │
│                  ├── Ctrl+S  → stash prompt draft                   │
│                  ├── Ctrl+E  → open last response in $EDITOR        │
│                  ├── Ctrl+T  → toggle TTS (say/PS/spd-say)          │
│                  ├── Ctrl+B  → bookmark → ~/.copilot/bookmarks.json │
│                  ├── Ctrl+K  → fuzzy palette (workflows, queue, …)  │
│                  ├── Enter (busy) → prompt queue                    │
│                  ├── ? / Ctrl+/ → cheatsheet                        │
│                  ├── Opt+⇧1–5 / Ctrl+⇧1–5 → workhorse / auto        │
│                  ├── Opt+1–9 / Ctrl+1–9 → macros                    │
│                  └── !cmd<Enter> → shell-exec → fenced output       │
│                                                                    │
│  Enter ─► safety scan ─► plugin beforeSend ─► history.append        │
│                                                                    │
│  PTY out ─► token/model parser ─► agent state ─► monitor            │
│         └─► response settle ─► afterReceive ─► TTS ─► queue flush   │
│              + notify rules (idle / waiting / quota / webhook)      │
│                                                                    │
│  copilot binary  ◄────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

Transcription is 100% local — whisper.cpp runs on your machine, nothing is sent to any server. The safety scanner runs locally too — it never inspects responses, only your outgoing prompts.

---

## Plugins

Place a `*.js` or `*.cjs` file in `~/.copilot/plugins/` exporting any of these hooks. Hooks fire in load order; errors are isolated.

```js
// ~/.copilot/plugins/auto-prefix.js
module.exports = {
  name: 'auto-prefix',
  beforeSend({ text, kind }) {
    if (kind === 'voice') return { replaceWith: '[voice] ' + text };
  },
  onModelSwitch({ slot, model }) {
    require('fs').appendFileSync('/tmp/models.log', `${Date.now()} ${slot} ${model}\n`);
  },
};
```

Supported hooks: `beforeSend`, `afterReceive`, `afterPrompt`, `onModelSwitch`, `onBookmark`. See `src/plugin.js` for the contract.

---

## Tests

```bash
npm test     # node tests/run.js — 87 tests, no extra test runner
```

The harness (`tests/run.js`) discovers `tests/*.test.js` and uses `tests/_assert.js`. There is no CI job that runs tests on pull requests; `npm test` is local. Coverage today:

- safety scanner, palette ranking, prompt classifier, macros
- smart-context kinds, TTS summariser, history, bookmarks
- shell-exec formatter, theme integrity, wake-phrase matcher, config validator
- workflows, prompt queue/stash, notify-rules, config-share
- usage-meter, file-picker, handoff

## Repository layout

```
bin/copilot+              CLI entry — flag dispatch, --setup / --doctor / --monitor / …
src/wrapper.js            PTY wrapper, hotkeys, queue flush, plugin emit
src/*.js                  Feature modules (voice, palette, monitor, workflows, …)
scripts/postinstall.js    chmod node-pty helpers after npm install (darwin/linux)
tests/                    Zero-dep suite + tests/run.js
docs/superpowers/specs/   Dated design notes (historical; see the file dates)
Formula/copilot-plus.rb   Homebrew formula snapshot (tap is a separate repo)
.github/workflows/        Release publish only (no PR test workflow)
package.json              Manifest, bin, engines, npm files whitelist
```

Published npm contents (`package.json` `files`): `bin/`, `src/`, `scripts/` (plus npm’s always-included `package.json` / README / LICENSE). Tests, Formula, docs, and models are not in the tarball.

Runtime state on the machine (not in git):

| Path | What |
|---|---|
| `~/.copilot/copilot-plus.json` | User config |
| `~/.copilot/history.jsonl` | Prompt log |
| `~/.copilot/bookmarks.json` | Bookmarks |
| `~/.copilot/prompt-stash.json` | Stashed drafts |
| `~/.copilot/copilot-plus.log` | Wrapper log |
| `~/.copilot/agents/<pid>.json` | Live session state for `--monitor` |
| `~/.copilot/workflows/` | YAML/JSON workflow chains |
| `~/.copilot/plugins/` | User `*.js` / `*.cjs` hooks |
| `~/.copilot/handoffs/` | Quota handoff markdown |
| `~/.copilot/models/` | Local whisper models |
| `<repo>/.copilot-worktrees/` | Isolated git worktrees from `--worktree` |

## Release / deploy

There is no app server. Shipping is **npm** plus an optional **Homebrew tap** update.

1. Bump `version` in `package.json` / `package-lock.json` and record the release in [CHANGELOG.md](CHANGELOG.md).
2. Push a git tag matching `v*` (for example `v1.2.0`) to `main`, or run the **Release** workflow with a tag input.
3. [`.github/workflows/release.yml`](.github/workflows/release.yml) on `ubuntu-latest`:
   - `actions/setup-node@v4` with Node **20** and the npm registry
   - `npm ci --ignore-scripts`
   - `npm publish --access public` using `NPM_TOKEN`
   - then (best-effort) patch `url` / `sha256` in [Errr0rr404/homebrew-copilot-plus](https://github.com/Errr0rr404/homebrew-copilot-plus) using `HOMEBREW_TAP_TOKEN`

Users install with `npm install -g copilot-plus` or `brew tap Errr0rr404/copilot-plus && brew install copilot-plus`.

---

## Troubleshooting

**`posix_spawnp failed` on first run**  
Run `npm install -g copilot-plus` again — the postinstall script will fix the permissions automatically.

**Microphone not being captured / transcription is always the same word**  
Your `audioDevice` is pointing to the wrong input (e.g. a virtual audio device).

*macOS* — list devices:
```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep AVFoundation
```

*Windows* — list devices:
```powershell
ffmpeg -f dshow -list_devices true -i dummy 2>&1 | findstr audio
```

Set `audioDevice` in `~/.copilot/copilot-plus.json` to the correct device  
(macOS: `":2"` index format · Windows: `"Microphone (Realtek Audio)"` name format)

**`Error: could not open input device` (macOS)**  
Grant microphone access to your terminal:  
*System Settings → Privacy & Security → Microphone → enable your terminal app*

**`Error: could not open input device` (Windows)**  
Go to *Settings → Privacy & Security → Microphone* and enable microphone access for your terminal / Node.js.

**`No whisper model found`**
```bash
# macOS
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin

# Windows (PowerShell)
mkdir "$env:USERPROFILE\.copilot\models" -Force
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" `
  -o "$env:USERPROFILE\.copilot\models\ggml-base.en.bin"
```
Then run `copilot+ --setup` to confirm it's detected.

**Transcription is inaccurate**  
Switch to a larger model (`small.en` instead of `base.en`) and update `modelPath` in `~/.copilot/copilot-plus.json`.

**Wake word not triggering**  
Try a shorter, more distinctive phrase (e.g. `"hey copilot"` works better than a single common word). You can increase `wakeWord.chunkSeconds` to `3` or `4` if the phrase gets cut off mid-recording, or download the `tiny.en` model for faster scanning:
```bash
# macOS
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin" \
  -o ~/.copilot/models/ggml-tiny.en.bin
```

**Option+Shift+1–5 model slots / Option+1–9 macros don't work (macOS Apple Terminal)**  
Open Terminal → Settings → Profiles → Keyboard → check **"Use Option as Meta Key"**.

**Model slot hotkey does nothing (kitty/WezTerm/Windows Terminal)**  
Ensure your terminal is configured to send CSI u key sequences. In kitty this is on by default. In WezTerm, `enable_kitty_keyboard = true` must be set. In Windows Terminal, enable **"Input: Terminal Input Encoding"** → `application/vnd.ms-terminal.keyboard.v2` in settings.

**Screenshot doesn't attach (macOS)**  
*System Settings → Privacy & Security → Screen Recording → enable your terminal app*

**Screenshot doesn't attach (Windows)**  
Make sure you drew a selection in the Snip & Sketch overlay — pressing Escape cancels without saving.

**Linux: nothing happens on Ctrl+P / Ctrl+Y / Ctrl+T**  
Install the matching helper:
- `Ctrl+P` — `grim`+`slurp` (Wayland) or `scrot` / `gnome-screenshot` / `spectacle` / `maim` (X11)
- `Ctrl+Y` — `wl-clipboard` (Wayland) or `xclip` / `xsel` (X11)
- `Ctrl+T` — `speech-dispatcher` (`spd-say`) or `espeak-ng`
- Notifications — `libnotify` (`notify-send`)

**Linux: mic is detected but transcription is silent**  
Check `pactl list short sources` and set `audioDevice` to the source name prefixed with `pulse:` (e.g. `"pulse:alsa_input.usb-..."`). For raw ALSA, use `"alsa:hw:1,0"`.

**Safety scanner blocking a legitimate prompt**  
Either redact (`r`), disable a specific rule via `safety.disabledKinds: ["github_token"]`, or turn the scanner off entirely with `safety.enabled: false`.

**Verify everything in one command**
```bash
copilot+ --doctor
```

---

## License

MIT © [Errr0rr404](https://github.com/Errr0rr404)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history and upgrade notes.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and future direction.

## Contributing

Found a bug or have a feature idea? [Open an issue](https://github.com/Errr0rr404/copilot-plus/issues) — PRs welcome.

```bash
npm test
```
