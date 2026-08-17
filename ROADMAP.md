# copilot+ — Roadmap

> Feature proposals and future direction for copilot-plus.
> Current version: **v1.2.0** · Living user docs: [README.md](README.md) · Release history: [CHANGELOG.md](CHANGELOG.md).

## Architecture

Node.js PTY wrapper (`node-pty`) that intercepts stdin/stdout, injects text/commands into the underlying `copilot` process, and coordinates multi-instance state via `~/.copilot/agents/*.json` files. A plugin layer exposes lifecycle hooks (`beforeSend`, `afterReceive`, `afterPrompt`, `onModelSwitch`, `onBookmark`) loaded from `~/.copilot/plugins/` (`*.js` / `*.cjs`).

## What Copilot CLI Already Provides Natively

`/model`, `/share`, `/usage`, `/clear`, `/compact`, `/context`, `/research`, `/session`, `/cwd`, `/add-dir`, `/mcp`, plan mode, autopilot mode, specialized agents, session export.

## Status Legend

✅ shipped · 🛠 in progress · 📅 planned · 💡 idea

---

## Shipped in v1.2.0

| # | Feature | Status | Where |
|---|---------|:---:|-------|
| 3 | Prompt Workflows / Chain Macros | ✅ | `src/workflows.js` + palette + `--workflows` |
| 8 | Smart Notifications & Alerting | ✅ | `src/notify-rules.js` + background tick |
| 11 | Session/Config Sharing | ✅ | `src/config-share.js` + `--export-config` / `--import-config` |
| — | Ctrl+E open response in `$EDITOR` | ✅ | wrapper |
| — | Prompt stash (Ctrl+S) | ✅ | `src/prompt-stash.js` |
| — | Pending prompt queue | ✅ | `src/prompt-queue.js` |
| — | Usage / daily budget meter | ✅ | `src/usage-meter.js` + `--usage` |
| — | File picker `@path` (Ctrl+O) | ✅ | `src/file-picker.js` |
| — | Worktree session launcher | ✅ | `src/worktree.js` + `--worktree` |
| — | Limit handoff snapshots | ✅ | `src/handoff.js` |

---

## Shipped in v1.1.0

| # | Feature | Status | Where |
|---|---------|:---:|-------|
| 1 | Session History & Analytics | ✅ | `src/history.js` + `copilot+ --history` |
| 2 | Smart Auto-Context Injection | ✅ | `src/context.js` + Ctrl+G |
| 4 | Text-to-Speech Output | ✅ | `src/tts.js` + Ctrl+T |
| 5 | Clipboard Integration | ✅ | `src/clipboard.js` + Ctrl+Y |
| 6 | Multi-Language Voice | ✅ | `voiceLanguage` config + `voice.js` |
| 7 | Response Bookmarks & Snippet Manager | ✅ | `src/bookmarks.js` + `copilot+ --snippets` |
| 9 | Quick Shell Commands | ✅ | `src/shell-exec.js` + `!cmd` prefix |
| 10 | Theme Engine | ✅ | `src/theme.js` — dark/light/solarized/monokai/auto |
| 12 | Sensitive Data Guard | ✅ | `src/safety.js` — 12 secret rules with confirm + redact |

Bonus features shipped alongside the roadmap items:

- **Plugin / hook system** — `~/.copilot/plugins/*.js` (`src/plugin.js`)
- **In-app cheatsheet** — `?` / Ctrl+/ (`src/cheatsheet.js`)
- **Interactive monitor** — `j`/`k`/`/`/`s`/`K`/`o`/`r`/`?`
- **Voice-preview mode** — review/edit transcript before sending
- **Doctor** — `copilot+ --doctor` validates config + environment
- **Linux port** — pulse/alsa mic, grim/slurp/scrot screenshot, wl-paste/xclip
- **In-repo zero-dep test suite** — `npm test`
- **Logger** — `~/.copilot/copilot-plus.log`

---

## Future Ideas 💡

- **MCP server proxy** — surface MCP tool calls and let the wrapper add observability
- **Plan-mode HUD** — show step list & progress when copilot is in plan mode
- **Multi-user observability** — opt-in remote dashboard for team leads
- **Webhook fan-out plugins** — sample plugins for Slack/Discord beyond raw URL
- **Speech-output mute on code blocks** — already done; future: optional spoken summary
- **Richer file picker** — directory browser, multi-select, git status badges
- **Queue reorder TUI** — visual reorder beyond palette flush
- **Remote attach** — tmux/SSH-friendly session attach for mobile monitoring

---

## Summary Matrix (after v1.2.0)

| # | Feature | Status |
|---|---------|:---:|
| 1  | Session History & Analytics    | ✅ shipped |
| 2  | Smart Auto-Context Injection   | ✅ shipped |
| 3  | Prompt Workflows / Chains      | ✅ shipped |
| 4  | Text-to-Speech Output          | ✅ shipped |
| 5  | Clipboard Integration          | ✅ shipped |
| 6  | Multi-Language Voice           | ✅ shipped |
| 7  | Response Bookmarks             | ✅ shipped |
| 8  | Smart Notifications            | ✅ shipped |
| 9  | Quick Shell Commands           | ✅ shipped |
| 10 | Theme Engine                   | ✅ shipped |
| 11 | Session/Config Sharing         | ✅ shipped |
| 12 | Sensitive Data Guard           | ✅ shipped |

## Prioritization for v1.3.0

1. Plan-mode HUD
2. Richer queue management TUI
3. Sample webhook plugins (Slack / Discord)
