# Changelog

All notable changes to **copilot-plus** are documented here.

---

## [1.0.28] — 2026-04-26

### Fixed

- **Windows PTY spawn** — `where` separates paths with `\r\n`, so `resolveBin()` returned a path with a trailing `\r` that broke `pty.spawn`. Now splits on `/\r?\n/`.
- **Voice recorder hang** — if `ffmpeg` died prematurely (mic unplugged, OS denied access) the next `stopAndTranscribe()` would attach an `'exit'` listener after the event already fired and hang forever. `start()` now installs an exit handler, and `stopAndTranscribe()` checks `proc.exitCode`/`signalCode` before awaiting.
- **`stopAndTranscribe()` race with `-t maxSeconds`** — same hang risk if ffmpeg hit its time cap before we sent `q`. Now wraps `stdin.write`/`kill` in `try/catch` and resolves on the timeout fallback so the wrapper can never hang.
- **Monitor frame ghosting** — `_render()` only homed the cursor before each frame; when an agent exited and the box shrank, leftover lines from the previous (taller) frame remained on screen. Now appends `\x1b[J` (erase to end of screen) after each render.
- **Monitor terminal corruption on signal exit** — exit handler restored cursor visibility but not stdin raw mode, leaving the parent terminal broken if the monitor was killed by SIGHUP/SIGINT. Now resets raw mode and registers SIGHUP/SIGINT handlers.

### Removed

- **Dead `dictation.js` module** — `DictationMode` was orphaned after the wake-word rewrite; no code path imported it. Dropped from the npm tarball.
- **Stale Picovoice entries in `package-lock.json`** — leftover from the v1.0.14 Picovoice → whisper.cpp migration.

## [1.0.27] — 2025-06-12

### Fixed

- **Windows audio device detection** — `ffmpeg -f dshow -list_devices` outputs to stderr, but some builds exit 0 which made `execFileSync` miss the output entirely. Switched to `spawnSync` so stderr is always captured regardless of exit code. ([#1](https://github.com/Errr0rr404/copilot-plus/pull/1))
- **Win32 Input Mode interference** — Windows Terminal can encode all keystrokes as CSI `_` sequences, breaking hotkey detection. Now disabled at startup with `ESC[?9001l`. ([#1](https://github.com/Errr0rr404/copilot-plus/pull/1))

## [1.0.26] — 2025-06-12

### Fixed

- **Voice recording crash** — removed rogue `throw` in async error handler that crashed the process when ffmpeg failed to spawn.
- **Windows monitor process detection** — `Get-CimInstance` returns native DateTime objects, not WMI strings. Fixed PowerShell command to use `.ToString('o')` instead of `ManagementDateTimeConverter`.
- **Config save clobbering** — `config.save()` was persisting auto-detected runtime values (`audioDevice`, `modelPath`), preventing future auto-detection. Added `config.patch()` for surgical updates.
- **Notification spawn errors** — added `.on('error', () => {})` before `.unref()` on macOS/Windows notification child processes to prevent unhandled exceptions.
- **Wake word model search on Windows** — added `AppData\Local\whisper.cpp\models\` to the model discovery paths.
- **Auto Models config** — `autoModels` now has proper defaults and is deep-merged on load.

## [1.0.25] — 2025-06-11

### Added

- **Live agent monitor** (`copilot+ --monitor`) — real-time dashboard showing all running copilot sessions, status badges, premium request counts, and GitHub Copilot quota.
- Native copilot process detection (sessions started without `copilot+` appear as `[copilot CLI]`).

## [1.0.24] — 2025-06-10

### Added

- **Workhorse model slots** — assign up to 4 AI models and switch instantly with Option+Shift+1–4 (macOS) or Ctrl+Shift+1–4 (kitty/WezTerm/Windows Terminal).
- **⚡ Auto Mode** — routes prompts to fast/medium/powerful model tiers automatically based on prompt complexity.
- Model switching via command palette (Ctrl+K).

## [1.0.23] — 2025-06-09

### Fixed

- Removed dead Picovoice dependencies.
- Improved wake phrase matching — accepts both "copilot" and "hey copilot".
- Various wake word stability improvements.

## [1.0.14] — 2025-06-07

### Changed

- **Replaced Picovoice wake word engine** with whisper.cpp + VAD — zero external API dependencies, works with any custom phrase.

## [1.0.13] — 2025-06-06

### Fixed

- Ctrl+K command palette rendering and navigation.
- Option+1–9 macro injection on macOS.
- Inline macro editing from the palette.
- Model path auto-heal when file moves.

## [1.0.12] — 2025-06-05

### Added

- **Command palette** (Ctrl+K) — searchable overlay for all features.
- **Prompt macros** (Option+1–9 / Ctrl+1–9) — saved prompts injected with a single hotkey.
- **Voice activation** — always-on wake phrase detection ("hey copilot").
- **First-run onboarding wizard**.

## [1.0.11] — 2025-06-04

### Added

- Interactive microphone picker in `--setup`.

### Fixed

- Non-TTY hang guard.
- Windows audio device enumeration.

---

_For the full commit history, see [GitHub Releases](https://github.com/Errr0rr404/copilot-plus/releases)._
