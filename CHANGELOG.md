# Changelog

All notable changes to **copilot-plus** are documented here.

---

## [1.2.0] — 2026-08-01

Community-driven release: features people most often wish GitHub Copilot CLI
had — researched from X, Reddit, and github/copilot-cli issues — implemented
as a cohesive wrapper pack.

### Added

- **Prompt workflows / chains** — YAML or JSON multi-step sequences in
  `~/.copilot/workflows/`. Variables: `{{cwd}}`, `{{git_branch}}`,
  `{{clipboard}}`, `{{date}}`. Run from palette or list with
  `copilot+ --workflows`.
- **Smart notification rules** — `session_idle`, `waiting_input` (silence
  threshold), `quota_above` with channels `os` / `bell` / `webhook`.
  Configure under `notifications.rules` + optional `webhookUrl`.
- **Config export / import** — `copilot+ --export-config [file]` and
  `--import-config <file> [--overwrite]` for team macros, models, theme,
  safety, notifications, and workflows.
- **Ctrl+E** — open the last settled response in `$VISUAL` / `$EDITOR`.
- **Ctrl+S prompt stash** — park a draft prompt, do `/model` or shell work,
  restore from the palette (stack persisted in `~/.copilot/prompt-stash.json`).
- **Pending prompt queue** — while the agent is responding, Enter enqueues
  the line (`queue.whenBusy`, default on). Auto-flushes when idle; palette
  flush/clear.
- **Usage meter** — `copilot+ --usage` shows local history stats, optional
  daily budget, and premium quota when a GitHub token is available.
- **Ctrl+O file picker** — fuzzy project files → inject `@/abs/path`.
- **Worktree launcher** — `copilot+ --worktree [name]` (and palette) creates
  an isolated git worktree under `.copilot-worktrees/`.
- **Limit handoff** — auto-writes `~/.copilot/handoffs/*.md` when premium
  usage crosses `usage.handoffAtPct` (default 90%); manual handoff from palette.

### Improved

- Cheatsheet, help, and palette cover every new hotkey and CLI flag.
- Config defaults deep-merge `queue`, `usage`, and richer `notifications`.

---

## [1.1.0] — 2026-05-16

A flagship release: nine roadmap features shipped at once, a full Linux
port, an interactive monitor, fuzzy palette ranking, a plugin/hook system,
an in-app cheatsheet, voice-preview mode, and a 62-test in-repo suite.

### Added

- **`?` / Ctrl+/ in-app cheatsheet** — lists every hotkey copilot+ provides,
  generated from the active config so it always reflects current state.
  Discoverability has been the #1 friction point; this fixes it.
- **Ctrl+Y — clipboard paste** — pulls text or image from the OS clipboard
  and injects it. Cross-platform (`pbpaste` / PowerShell / `wl-paste` /
  `xclip`).
- **Ctrl+G — smart context injection** — gathers git status, diff, and
  recently-modified files, and pastes them as a `[context]…[/context]`
  block. Configurable via `contextHotkey.kinds`.
- **Ctrl+T — text-to-speech** — reads each settled response aloud using
  the OS-native voice (`say` / `System.Speech` / `spd-say` / `espeak`).
  Strips code blocks and markdown noise before speaking.
- **Ctrl+B — bookmark last response** — saves to
  `~/.copilot/bookmarks.json`; browse with `copilot+ --snippets`.
- **`!cmd` shell prefix** — typing `!ls -la` then Enter runs the shell
  command and injects its output as a fenced block. 15s timeout, 16 KiB
  output cap.
- **Pre-send safety scanner** — 12 regex rules for AWS / GitHub / OpenAI /
  Anthropic / Google / Slack / Stripe / private keys / JWTs / generic
  passwords. Prompts to send / redact / cancel; can be set to auto-redact
  silently. Toggle with `safety.enabled`.
- **Session history** — every prompt is logged to
  `~/.copilot/history.jsonl` and is searchable via
  `copilot+ --history [query]`. Token-AND substring search.
- **Theme engine** — `dark`, `light`, `solarized`, `monokai`, `auto`.
  Applied across palette, cheatsheet, monitor, doctor, and onboarding.
  Switch via the palette.
- **Plugin / hook system** — drop `*.js` files in `~/.copilot/plugins/`
  to subscribe to `beforeSend`, `afterReceive`, `afterPrompt`,
  `onModelSwitch`, `onBookmark`. Reload via the palette.
- **Voice-preview mode** (`voicePreview: true`) — transcribed text drops
  into the prompt instead of auto-sending, so you can review/edit before
  Enter.
- **Multi-language voice** — `voiceLanguage: 'auto' | 'en' | 'es' | …`
  passes through to whisper.cpp. English (default) keeps the bundled
  `*.en` model; other languages need a non-`.en` model file.
- **Interactive monitor** — `j`/`k` navigate, `/` filter, `s` cycle sort,
  `K` SIGTERM the selected agent, `o` open its cwd in a new terminal tab,
  `r` force-refresh quota, `?` toggle inline help. Selected card is
  highlighted; sort/filter badges sit in the header row.
- **`copilot+ --doctor`** — validates config and probes every required
  binary, mic, whisper model. Returns non-zero on issues.
- **`copilot+ --history` / `--snippets` / `--ask` / `--version` /
  `--help-plus`** CLI flags.
- **Linux support** — mic detection (`pulse` / `alsa`), screenshot
  (`grim`+`slurp`, gnome-screenshot, spectacle, scrot, maim), clipboard
  (`wl-paste`/`xclip`/`xsel`), and `notify-send` for notifications.
- **In-repo zero-dep test suite** — 62 tests across safety, palette
  ranking, classifier, macros, context, TTS summariser, history,
  bookmarks, shell-exec, theme, wake-word matcher, config validator.
  Run with `npm test`.
- **Logger** — `~/.copilot/copilot-plus.log` with `info / warn / error /
  debug` levels; raise verbosity with `COPILOT_PLUS_LOG=debug`.

### Improved

- **Palette** — fzf-style fuzzy ranking with consecutive/word-start
  bonuses and recents boost; ranking matches what fzf/Cmd+P users expect.
- **Palette close** — now erases exactly the rows it drew; the previous
  formula (`MAX_VISIBLE + 6`) left ghost lines on tall renders.
- **Onboarding** — comprehensive multi-step wizard demonstrates every
  hotkey, asks about language / theme / preview / TTS / safety / history,
  prints a single at-a-glance cheatsheet at the top.
- **Setup / help / doctor** — themed, sectioned, and consistent with the
  rest of the UI.
- **Notifications** — Linux uses `notify-send`; can be silenced with
  `notifications.quiet`.

### Changed

- **Default version bumped to 1.1.0** to reflect the surface-area jump.
- `--help` is reserved for forwarding to `copilot` (legacy behaviour);
  use `--help-plus` / `-h` for the wrapper-specific help.

---

## [1.0.29] — 2026-05-15

### Fixed

- **Monitor TUI crash on over-quota state** — `_miniBar()` ran `'░'.repeat(width - filled)` without clamping, so once `q.premium.used > entitlement` (rare but possible on over-quota accounts) the bar threw `RangeError: Invalid count value: -N` and brought down the whole `--monitor` dashboard. Now clamps the percentage to `[0, 100]` before computing the bar.
- **Monitor quota refresh stuck after a single failure** — `_refreshQuota()` set `_quotaTime = Date.now()` *before* awaiting `fetchQuota()`, so a transient network error or a missing GitHub token froze the quota line for a full 5 minutes before retry. Now resets the timestamp when the fetch returns `null` so the next tick retries.
- **Postinstall could fail `npm install -g` on locked install locations** — `scripts/postinstall.js` called `fs.chmodSync()` unguarded, so EPERM/EACCES on system-wide npm prefixes or non-owned Homebrew paths aborted the install. Now wraps each chmod in `try/catch` and logs a soft warning; the formula and the brew install path already chmod these files themselves.

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
