# talk-to-copilot

A transparent PTY wrapper for [GitHub Copilot CLI](https://github.com/github/copilot-cli) that adds **voice input** and **screenshot attachment** — without changing how you use Copilot at all.

Run `ttc` instead of `copilot`. Everything works identically, plus two new hotkeys.

```
Ctrl+R  →  Start / stop voice recording  (transcription injected as text)
Ctrl+P  →  Interactive screenshot picker  (injected as @/path/to/file.png)
```

---

## Installation

### Homebrew (recommended — installs ffmpeg + whisper-cpp automatically)

```bash
brew tap Errr0rr404/ttc
brew install ttc
whisper-cpp-download-ggml-model base.en   # one-time: download speech model
ttc --setup                               # verify everything is ready
```

### npm

```bash
npm install -g talk-to-copilot
# You still need ffmpeg and whisper-cpp:
brew install ffmpeg whisper-cpp
whisper-cpp-download-ggml-model base.en
ttc --setup
```

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  ttc (PTY wrapper)                                      │
│                                                          │
│  stdin ──► intercept Ctrl+R / Ctrl+P                    │
│              │                           │               │
│              ▼                           ▼               │
│         voice recorder            screencapture -i       │
│         ffmpeg + whisper-cli      saves PNG to /tmp      │
│              │                           │               │
│              └──────────┬────────────────┘               │
│                         ▼                                │
│                  inject text / @path                     │
│                         │                                │
│  copilot (PTY child) ◄──┘  (all other keystrokes pass   │
│                             through unchanged)           │
└─────────────────────────────────────────────────────────┘
```

Transcriptions are injected as raw text — **no Enter is pressed automatically** so you can review and edit before sending. Screenshots are injected as `@/tmp/copilot-screenshots/screenshot-<ts>.png` which Copilot CLI's `@` file-mention picks up.

---

## Prerequisites

| Tool | Install |
|------|---------|
| [GitHub Copilot CLI](https://github.com/github/copilot-cli) | see their docs |
| [ffmpeg](https://ffmpeg.org) | `brew install ffmpeg` |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | `brew install whisper-cpp` |
| A whisper model | `whisper-cpp-download-ggml-model base.en` |
| Node.js ≥ 18 | `brew install node` |

> **Apple Silicon note:** The `base.en` model runs in ~1–2 s on M1/M2/M3. Use `small.en` for better accuracy at ~3–4 s.

---

## Installation

```bash
git clone https://github.com/yourname/talk-to-copilot
cd talk-to-copilot
npm install
npm link          # makes `ttc` available system-wide
```

Verify everything is wired up:

```bash
talk --setup
```

---

## Usage

```bash
talk              # drop-in replacement for `copilot`
talk --setup      # check dependencies and show config
```

Any flags you pass are forwarded to `copilot` directly:

```bash
talk --experimental
talk --banner
```

### Voice recording

1. Press **Ctrl+R** — the terminal title changes to `🎙 Recording…` and a macOS notification appears.
2. Speak your prompt.
3. Press **Ctrl+R** again — transcription begins (`⏳ Transcribing…`).
4. The transcribed text appears in the Copilot input. Review it, then press **Enter** to send.
5. Press **Ctrl+C** while recording to cancel without transcribing.

### Screenshot

1. Press **Ctrl+P** — the macOS screenshot overlay appears (same as ⌘⇧4).
2. Draw a selection around the area you want to share.
3. The path is injected as `@/tmp/copilot-screenshots/screenshot-<ts>.png`.
4. Type any additional context, then press **Enter**.

---

## Configuration

Config is stored at `~/.copilot/talk-to-copilot.json`:

```json
{
  "modelPath": "/opt/homebrew/share/whisper.cpp/models/ggml-base.en.bin",
  "audioDevice": ":0",
  "autoSubmit": false
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `modelPath` | auto-detected | Path to your `.bin` whisper model |
| `audioDevice` | `:0` | ffmpeg avfoundation mic index (run `ffmpeg -f avfoundation -list_devices true -i ""` to list) |
| `autoSubmit` | `false` | Set to `true` to auto-press Enter after transcription |

---

## Troubleshooting

**`Error: could not open input device`**  
Grant microphone access: *System Settings → Privacy & Security → Microphone → Terminal*.

**`No whisper model found`**  
Run `whisper-cpp-download-ggml-model base.en`, then `talk --setup` to verify.

**Transcription is empty or garbled**  
Try a larger model: `whisper-cpp-download-ggml-model small.en`, then update `modelPath` in your config.

**Wrong microphone is used**  
Run `ffmpeg -f avfoundation -list_devices true -i ""` and set `audioDevice` in the config (e.g. `":1"`).
