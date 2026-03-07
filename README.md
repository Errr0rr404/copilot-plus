# talk-to-copilot

> Talk to [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) with your voice — and share screenshots — without leaving your terminal.

`copilot+` is a drop-in replacement for the `copilot` command. It wraps Copilot CLI transparently and adds two hotkeys:

| Hotkey | What it does |
|--------|-------------|
| **Ctrl+R** | Start / stop voice recording → transcription is typed into your prompt |
| **Ctrl+P** | Screenshot picker → file path is injected as `@/path/screenshot.png` |

Everything else — all Copilot features, slash commands, modes — works exactly as normal.

---

## Requirements

- **macOS** (uses `avfoundation` for mic input and `screencapture` for screenshots)
- **[GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)** — must be installed and authenticated
- **Node.js ≥ 18** — `brew install node`
- **ffmpeg** — `brew install ffmpeg`
- **whisper.cpp** — `brew install whisper-cpp`

> **Apple Silicon:** The `base.en` model transcribes in ~1–2 s on M1/M2/M3. Use `small.en` for better accuracy at ~3–4 s.

---

## Installation

```bash
npm install -g talk-to-copilot
```

Then install the speech dependencies if you haven't already:

```bash
brew install ffmpeg whisper-cpp
```

Download a whisper speech model (required for voice input):

```bash
# Option A — using the whisper-cpp helper script (if available)
whisper-cpp-download-ggml-model base.en

# Option B — direct download (works everywhere)
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin
```

Verify everything is wired up:

```bash
copilot+ --setup
```

You should see all green checkmarks. If anything is missing, the setup output tells you exactly what to fix.

---

## Quick Start

```bash
copilot+
```

That's it. You're now inside Copilot CLI with voice and screenshot support active.

---

## Using Voice Input

1. **Press `Ctrl+R`** to start recording.
   A macOS notification appears and your terminal title changes to `🎙 Recording…`

2. **Speak your prompt** naturally — e.g. _"refactor this function to use async await"_

3. **Press `Ctrl+R` again** to stop.
   Transcription runs locally (`⏳ Transcribing…`) — no audio ever leaves your machine.

4. **Your words appear as text** in the Copilot prompt. Review and edit if needed, then press **Enter** to send.

> Press **Ctrl+C** while recording to cancel without transcribing.

---

## Using Screenshots

1. **Press `Ctrl+P`** — the macOS screenshot overlay opens (same UI as `⌘⇧4`).

2. **Click and drag** to select any area of your screen — a browser error, a UI bug, a diagram, anything.

3. **The file path is injected** into your prompt as `@/tmp/copilot-screenshots/screenshot-<timestamp>.png`.

4. **Add context** if you want (e.g. _"what's wrong with this?"_), then press **Enter**.

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

Settings are stored at `~/.copilot/talk-to-copilot.json` and created automatically on first run.

```json
{
  "modelPath": "/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin",
  "audioDevice": ":0",
  "autoSubmit": false
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `modelPath` | auto-detected | Path to your whisper `.bin` model file |
| `audioDevice` | `:0` | ffmpeg avfoundation audio input index |
| `autoSubmit` | `false` | `true` = automatically press Enter after transcription |

### Finding your microphone index

```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep AVFoundation
```

Look for your microphone in the output. The number in brackets (e.g. `[2]`) is the index — set `audioDevice` to `":2"`.

### Available whisper models

| Model | Size | Speed (M2) | Accuracy |
|-------|------|------------|----------|
| `tiny.en` | 75 MB | ~0.5 s | Good |
| `base.en` | 142 MB | ~1 s | Better |
| `small.en` | 466 MB | ~3 s | Best for most |

```bash
whisper-cpp-download-ggml-model small.en
```

Then update `modelPath` in `~/.copilot/talk-to-copilot.json`.

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│  copilot+ (PTY wrapper)                                        │
│                                                           │
│  Your keystrokes ──► intercept Ctrl+R / Ctrl+P           │
│                            │               │              │
│                            ▼               ▼              │
│                      ffmpeg mic      screencapture -i     │
│                      + whisper-cli   saves PNG to /tmp    │
│                            │               │              │
│                            └───────┬───────┘              │
│                                    ▼                      │
│                         inject text / @filepath           │
│                                    │                      │
│  copilot ◄─────────────────────────┘                     │
│  (all other keystrokes pass through unchanged)            │
└──────────────────────────────────────────────────────────┘
```

Transcription is 100% local — whisper.cpp runs on your machine, nothing is sent to any server.

---

## Troubleshooting

**`posix_spawnp failed` on first run**
Run `npm install -g talk-to-copilot` again — the postinstall script will fix the permissions automatically.

**Microphone not being captured / transcription is always the same word**
Your `audioDevice` is pointing to the wrong input (e.g. a virtual audio device).
Run the device listing command above and update `audioDevice` in your config.

**`Error: could not open input device`**
Grant microphone access to your terminal:
*System Settings → Privacy & Security → Microphone → enable your terminal app*

**`No whisper model found`**
```bash
# Option A
whisper-cpp-download-ggml-model base.en
# Option B (direct download, works if the script is missing)
mkdir -p ~/.copilot/models
curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" \
  -o ~/.copilot/models/ggml-base.en.bin
```
Then run `copilot+ --setup` to confirm it's detected.

**Transcription is inaccurate**
Switch to a larger model:
```bash
whisper-cpp-download-ggml-model small.en
```
Then update `modelPath` in `~/.copilot/talk-to-copilot.json`.

**Screenshot doesn't attach**
Make sure Screen Recording permission is granted:
*System Settings → Privacy & Security → Screen Recording → enable your terminal app*

---

## License

MIT © [Errr0rr404](https://github.com/Errr0rr404)
