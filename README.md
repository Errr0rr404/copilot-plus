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
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="platform" />
  <a href="https://github.com/Errr0rr404/copilot-plus">
    <img src="https://img.shields.io/github/stars/Errr0rr404/copilot-plus?style=flat&logo=github&color=yellow" alt="GitHub stars" />
  </a>
</p>

<p align="center">
  <strong>Talk to <a href="https://docs.github.com/copilot/concepts/agents/about-copilot-cli">GitHub Copilot CLI</a> with your voice — share screenshots — switch AI models instantly — and monitor all running sessions from one dashboard.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/copilot-plus">📦 View on npm</a> ·
  <a href="https://github.com/Errr0rr404/copilot-plus">⭐ Star on GitHub</a> ·
  <a href="https://github.com/Errr0rr404/copilot-plus/issues">🐛 Report a Bug</a>
</p>

---

`copilot+` is a drop-in replacement for the `copilot` command. It wraps Copilot CLI transparently and adds powerful input enhancements:

| Hotkey / Command | What it does |
|--------|-------------|
| **Ctrl+G** | Start / stop voice recording → transcription is typed into your prompt |
| **Ctrl+O** | Screenshot picker → file path is injected as `@/path/screenshot.png` |
| **Ctrl+K** | Open command palette — access all features from a searchable menu |
| **Option+Shift+1–4** *(macOS Terminal.app)* | Switch to workhorse model slot 1–4 — requires "Use Option as Meta Key" |
| **Ctrl+Shift+1–4** *(kitty/WezTerm/Windows Terminal)* | Switch to workhorse model slot 1–4 on CSI u–capable terminals |
| **Option+1–9** *(macOS Terminal.app)* | Execute a prompt macro — requires "Use Option as Meta Key" |
| **Ctrl+1–9** *(kitty/WezTerm/Windows Terminal)* | Execute a prompt macro on CSI u–capable terminals |
| `copilot+ --monitor` | Open the real-time agent dashboard |

Everything else — all Copilot features, slash commands, modes — works exactly as normal.

---

## Requirements

| | macOS | Windows |
|---|---|---|
| **OS** | macOS 12+ | Windows 10/11 |
| **[GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)** | required | required |
| **Node.js ≥ 18** | `brew install node` | [nodejs.org](https://nodejs.org) or `winget install OpenJS.NodeJS` |
| **ffmpeg** | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |
| **whisper.cpp** | `brew install whisper-cpp` | [Manual install](#windows-whisper-setup) |

> **Apple Silicon:** The `base.en` model transcribes in ~1–2 s on M1/M2/M3.

---

## Installation

### Option A — npm (macOS + Windows)

```bash
npm install -g copilot-plus
```

### Option B — Homebrew (macOS only)

```bash
brew tap Errr0rr404/copilot-plus
brew install copilot-plus
```

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

That's it. You're now inside Copilot CLI with voice and screenshot support active.

---

## Using Voice Input

1. **Press `Ctrl+G`** to start recording.  
   A system notification appears and your terminal title changes to `🎙 Recording…`

2. **Speak your prompt** naturally — e.g. _"refactor this function to use async await"_

3. **Press `Ctrl+G` again** to stop.  
   Transcription runs locally (`⏳ Transcribing…`) — no audio ever leaves your machine.

4. **Your words appear as text** in the Copilot prompt. Review and edit if needed, then press **Enter** to send.

> Press **Ctrl+C** while recording to cancel without transcribing.

---

## Using Screenshots

**macOS:** Press `Ctrl+O` — the interactive screenshot overlay opens (same UI as `⌘⇧4`). Click and drag to select any area. The file path is injected into your prompt as `@/tmp/copilot-screenshots/screenshot-<timestamp>.png`.

**Windows:** Press `Ctrl+O` — the Snip & Sketch overlay opens (same as `Win+Shift+S`). Draw a selection; the file path is injected automatically when you complete the snip.

Add context if you want (e.g. _"what's wrong with this?"_), then press **Enter**.

---

## First-Run Setup

On your first launch of `copilot+`, an interactive onboarding wizard will ask about:

- **Voice Activation** — hands-free "hey copilot" keyword detection
- **Prompt macros** — assign saved prompts to macro slots

Your choices are saved to `~/.copilot/copilot-plus.json`. Re-run the wizard anytime:

```bash
copilot+ --preferences
```

---

## Command Palette

Press **Ctrl+K** to open the command palette — a searchable overlay listing every copilot-plus action:

- 🎙 Voice Recording
- 📸 Screenshot
- 🗣️ Voice Activation (toggle on/off)
- 🤖 Workhorse Models 1–4 (switch or configure model slots)
- ⌨️ Macros 1–9 (execute or edit inline)
- ⚙️ Open Preferences

**Navigation:** `↑↓` to move, type to filter, **Enter** to select, **Esc** to close.

**Editing items from the palette:** Navigate to any workhorse model or macro entry and press **Enter** to open an inline editor. Then:
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

**Controls:** `q` / `Q` / `Ctrl+C` / `Esc` to exit.

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
  "firstRunComplete": true,
  "workhorseModels": {
    "1": "claude-sonnet-4.6",
    "2": "claude-opus-4.5",
    "3": "gpt-4.1",
    "4": "o3"
  },
  "macros": {
    "1": "Write unit tests for this code",
    "2": "Explain this code step by step"
  },
  "wakeWord": {
    "enabled": false,
    "phrase": "hey copilot",
    "chunkSeconds": 2
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `modelPath` | auto-detected | Path to your whisper `.bin` model file. Auto-heals if the file moves. |
| `audioDevice` | auto-detected | ffmpeg audio input device. Set interactively via `copilot+ --setup`. macOS: `":2"` index format. Windows: `"Microphone (Realtek Audio)"` name format. |
| `autoSubmit` | `false` | `true` = automatically press Enter after voice transcription |
| `workhorseModels` | all empty | AI model slots 1–4. Edit via Ctrl+K command palette or directly here. |
| `macros` | all empty | Prompt macros, slots 1–9. Edit via Ctrl+K or `--preferences`. |
| `wakeWord.enabled` | `false` | Enable voice activation (wake phrase detection) |
| `wakeWord.phrase` | `"hey copilot"` | The phrase to listen for |
| `wakeWord.chunkSeconds` | `2` | Audio chunk length for wake phrase scanning |

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
│  Your keystrokes ──► intercept hotkeys                             │
│                      ├── Ctrl+G         → push-to-talk recording   │
│                      ├── Ctrl+O         → screenshot picker         │
│                      ├── Ctrl+K         → command palette overlay   │
│                      ├── Opt+⇧1–4       → switch workhorse model    │
│                      ├── Ctrl+⇧1–4      → switch workhorse model    │
│                      ├── Option+1–9     → inject macro (macOS)      │
│                      ├── Ctrl+1–9       → inject macro (CSI u)      │
│                      ▼                                              │
│         ┌─────────────┬──────────────┬───────────────┐             │
│         │ ffmpeg mic   │ screencapture │ whisper+VAD   │            │
│         │ + whisper-cli│ / Snip&Sketch │ (voice activ) │            │
│         └──────┬───────┴──────┬───────┴───────┬───────┘            │
│                └──────────────┴───────────────┘                    │
│                              ▼                                     │
│                   inject text / @filepath / /model cmd             │
│                              │                                     │
│  copilot ◄───────────────────┘                                     │
│  (all other keystrokes pass through unchanged)                     │
└────────────────────────────────────────────────────────────────────┘
```

Transcription is 100% local — whisper.cpp runs on your machine, nothing is sent to any server.

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

**Option+Shift+1–4 model slots / Option+1–9 macros don't work (macOS Apple Terminal)**  
Open Terminal → Settings → Profiles → Keyboard → check **"Use Option as Meta Key"**.

**Model slot hotkey does nothing (kitty/WezTerm/Windows Terminal)**  
Ensure your terminal is configured to send CSI u key sequences. In kitty this is on by default. In WezTerm, `enable_kitty_keyboard = true` must be set. In Windows Terminal, enable **"Input: Terminal Input Encoding"** → `application/vnd.ms-terminal.keyboard.v2` in settings.

**Screenshot doesn't attach (macOS)**  
*System Settings → Privacy & Security → Screen Recording → enable your terminal app*

**Screenshot doesn't attach (Windows)**  
Make sure you drew a selection in the Snip & Sketch overlay — pressing Escape cancels without saving.

---

## License

MIT © [Errr0rr404](https://github.com/Errr0rr404)


---
