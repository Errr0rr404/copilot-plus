# copilot-plus

> Talk to [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) with your voice — and share screenshots — without leaving your terminal.

`copilot+` is a drop-in replacement for the `copilot` command. It wraps Copilot CLI transparently and adds powerful input enhancements:

| Hotkey | What it does |
|--------|-------------|
| **Ctrl+R** | Start / stop voice recording → transcription is typed into your prompt |
| **Ctrl+P** | Screenshot picker → file path is injected as `@/path/screenshot.png` |
| **Ctrl+/** | Open command palette — access all features from a searchable menu |
| **Ctrl+1–9** | Execute a prompt macro (requires CSI u–capable terminal) |

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

Add context if you want (e.g. _"what's wrong with this?"_), then press **Enter**.

---

## First-Run Setup

On your first launch of `copilot+`, an interactive onboarding wizard will ask about:

- **Dictation mode** — continuous voice-to-text
- **Wake word activation** — hands-free "hey copilot" (or "computer") keyword detection
- **Prompt macros** — assign saved prompts to Ctrl+1 through Ctrl+9

Your choices are saved to `~/.copilot/copilot-plus.json`. Re-run the wizard anytime:

```bash
copilot+ --preferences
```

---

## Command Palette

Press **Ctrl+/** to open the command palette — a searchable overlay listing every copilot-plus action:

- 🎙 Voice Recording
- 📸 Screenshot
- 📝 Dictation Mode (toggle)
- 🗣️ Wake Word (toggle)
- ⌨️ Macros 1–9 (execute)
- ⚙️ Open Preferences

Type to filter, arrow keys to navigate, Enter to select, Esc to dismiss.

---

## Prompt Macros

Assign frequently used prompts to **Ctrl+1** through **Ctrl+9**. When pressed, the saved text is instantly injected into your Copilot prompt.

Configure macros during onboarding, via `copilot+ --preferences`, or by editing `~/.copilot/copilot-plus.json`:

```json
{
  "macros": {
    "1": "Write unit tests for this code",
    "2": "Explain this code step by step",
    "3": "Refactor this to use async/await"
  }
}
```

> **Note:** Ctrl+1–9 require a terminal that supports **CSI u** key encoding (iTerm2, kitty, WezTerm, Windows Terminal). In other terminals, access macros through the command palette (Ctrl+/).

---

## Dictation Mode

Dictation mode provides **continuous voice-to-text** — speak naturally and your words are transcribed and injected in real-time.

- Toggle via the **command palette** (Ctrl+/ → Dictation Mode) or press **Ctrl+R** while dictating to stop
- Records in short chunks (default: 4 seconds), transcribes each, and injects the text
- Uses the same local whisper-cli pipeline — no audio leaves your machine

Configure chunk duration in `~/.copilot/copilot-plus.json`:

```json
{
  "dictation": {
    "enabled": false,
    "chunkSeconds": 4
  }
}
```

---

## Wake Word Activation

Say **"computer"** (default) or **"hey copilot"** (custom) to start voice recording hands-free.

Uses [Picovoice Porcupine](https://picovoice.ai/platform/porcupine/) for ultra-low-CPU always-on keyword detection.

### Setup

1. **Get a free Picovoice AccessKey** at [console.picovoice.ai](https://console.picovoice.ai/)

2. **Install the Porcupine packages** (optional — only needed if you enable wake word):
   ```bash
   npm install -g @picovoice/porcupine-node @picovoice/pvrecorder-node
   ```

3. **Enable during onboarding** or via `copilot+ --preferences`. You'll be prompted for your AccessKey.

### Custom "Hey Copilot" Keyword

The default built-in keyword is **"computer"**. To use **"hey copilot"**:

1. Go to [Picovoice Console](https://console.picovoice.ai/) → Train a keyword → "hey copilot"
2. Download the `.ppn` file for your platform (macOS/Windows/Linux)
3. Set the path in config:

```json
{
  "wakeWord": {
    "enabled": true,
    "accessKey": "YOUR_ACCESS_KEY_HERE",
    "keywordPath": "/path/to/hey-copilot_en_mac_v3_0_0.ppn",
    "sensitivity": 0.5
  }
}
```

> Wake word automatically pauses while you're recording and resumes after transcription completes.

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
  "macros": {
    "1": "Write unit tests for this code",
    "2": "Explain this code step by step"
  },
  "dictation": {
    "enabled": false,
    "chunkSeconds": 4
  },
  "wakeWord": {
    "enabled": false,
    "accessKey": "",
    "keywordPath": "",
    "sensitivity": 0.5
  }
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `modelPath` | auto-detected | Path to your whisper `.bin` model file |
| `audioDevice` | **auto-detected** | ffmpeg audio input. Set interactively via `copilot+ --setup`, or override manually. macOS: index like `":2"`. Windows: device name like `"Microphone (Realtek Audio)"`. |
| `autoSubmit` | `false` | `true` = automatically press Enter after transcription |
| `firstRunComplete` | `false` | Set to `true` after onboarding wizard completes |
| `macros` | all empty | Prompt macros for Ctrl+1–9. Keys are `"1"` through `"9"`. |
| `dictation.enabled` | `false` | Enable continuous dictation mode |
| `dictation.chunkSeconds` | `4` | Length of each dictation recording chunk |
| `wakeWord.enabled` | `false` | Enable wake word detection |
| `wakeWord.accessKey` | `""` | Picovoice AccessKey (free at console.picovoice.ai) |
| `wakeWord.keywordPath` | `""` | Path to custom `.ppn` keyword file (empty = built-in "computer") |
| `wakeWord.sensitivity` | `0.5` | Detection sensitivity (0.0–1.0, higher = more sensitive) |

### Finding your microphone

`copilot+` auto-detects the best available microphone and skips virtual devices (Teams, Zoom, Soundflower, etc.). If the wrong mic is detected, find the correct one:

**macOS:**
```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep AVFoundation
```
The number in brackets (e.g. `[2]`) is the index — set `audioDevice` to `":2"`.

**Windows:**
```powershell
ffmpeg -f dshow -list_devices true -i dummy 2>&1 | findstr audio
```
The device name in quotes (e.g. `"Microphone (Realtek Audio)"`) is the value to use for `audioDevice`.

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
│                      ├── Ctrl+R  → voice toggle / dictation stop   │
│                      ├── Ctrl+P  → screenshot picker               │
│                      ├── Ctrl+/  → command palette overlay          │
│                      ├── Ctrl+1–9 → inject prompt macro            │
│                      │                                             │
│                      ▼                                             │
│         ┌─────────────┬──────────────┬───────────────┐             │
│         │ ffmpeg mic   │ screencapture │ Porcupine     │            │
│         │ + whisper-cli│ / Snip&Sketch │ (wake word)   │            │
│         └──────┬───────┴──────┬───────┴───────┬───────┘            │
│                └──────────────┴───────────────┘                    │
│                              ▼                                     │
│                   inject text / @filepath / macro                   │
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

**Screenshot doesn't attach (macOS)**  
*System Settings → Privacy & Security → Screen Recording → enable your terminal app*

**Screenshot doesn't attach (Windows)**  
Make sure you drew a selection in the Snip & Sketch overlay — pressing Escape cancels without saving.

---

## License

MIT © [Errr0rr404](https://github.com/Errr0rr404)
