# copilot+ — Next Feature Proposals

## Current State

copilot-plus (v1.0.25, 2k+ downloads in <24hrs) is a drop-in PTY wrapper for GitHub Copilot CLI that adds: voice input (whisper.cpp), screenshots, command palette, workhorse model hotkeys, prompt macros, wake word activation, and a live agent monitor dashboard.

**Architecture:** Node.js PTY wrapper (`node-pty`) that intercepts stdin/stdout, injects text/commands into the underlying `copilot` process, and coordinates multi-instance state via `~/.copilot/agents/*.json` files.

## What Copilot CLI Already Provides Natively

`/model`, `/share`, `/usage`, `/clear`, `/compact`, `/context`, `/research`, `/session`, `/cwd`, `/add-dir`, `/mcp`, plan mode, autopilot mode, specialized agents, session export.

## Proposed Features (Copilot CLI does NOT provide these)

---

### 1. 📊 Session History & Analytics Dashboard (`copilot+ --history`)

**What:** Automatically archive every copilot session (prompts sent, models used, token counts, timestamps) into a local SQLite database. Provide a TUI and/or browser-based dashboard to search, filter, and visualize past sessions.

**Why it's unique:** Copilot CLI has `/usage` for current session and `/share` for one-time export, but there's zero persistent history. Users can't search "what did I ask about Docker last week?" or "how many premium requests did I use this month on opus?"

**Key capabilities:**
- Searchable conversation log (full-text search across all sessions)
- Usage analytics: requests/day, tokens/model, cost trends over time
- Session replay: re-read any past conversation
- Export to Markdown/JSON

**Complexity:** Medium — requires SQLite integration, output capture enhancement, new TUI view
**Impact:** Very High — power users will love having a searchable AI conversation history

---

### 2. 🧠 Smart Auto-Context Injection (Hotkey: `Ctrl+G`)

**What:** Before sending a prompt, automatically detect and inject relevant context that the user would normally have to `@`-reference manually. One hotkey press gathers: recent `git diff`, failing test output, linter errors, recently edited files, and injects them as file references.

**Why it's unique:** Copilot CLI requires manual `@file` references for context. This feature would intelligently figure out what's relevant and inject it automatically.

**Key capabilities:**
- `Ctrl+G` → inject `git diff --staged` or `git diff` as context
- Auto-detect recent test failures (parse last `npm test` / `pytest` output)
- "Smart mode": analyze the user's prompt and auto-attach likely relevant files
- Configurable presets (e.g., "always include git status with my prompts")

**Complexity:** Medium — git/shell integration, heuristic file selection
**Impact:** Very High — saves massive time on context setup, the #1 friction point

---

### 3. 🔄 Prompt Workflows / Chain Macros

**What:** Evolve static macros into multi-step workflow chains with variables, conditionals, and sequencing. Think "GitHub Actions but for Copilot conversations."

**Why it's unique:** Copilot CLI has no automation/chaining. Current copilot-plus macros are single static strings.

**Example workflows:**
```yaml
name: "Fix & Test"
steps:
  - prompt: "Run the failing tests and show me the errors"
    wait: true
  - prompt: "Fix the failing tests"
    wait: true
  - prompt: "Run the tests again to verify the fix"
```

```yaml
name: "PR Review"
steps:
  - inject: "git diff main..HEAD"
  - prompt: "Review this diff for bugs, security issues, and style problems"
```

**Key capabilities:**
- YAML/JSON workflow definitions in `~/.copilot/workflows/`
- Variable substitution (`${GIT_BRANCH}`, `${LAST_ERROR}`)
- Wait-for-response between steps
- Palette integration (Ctrl+K → Workflows)
- Community-shareable workflow files

**Complexity:** Medium-High — workflow engine, variable resolution, step sequencing
**Impact:** High — automates repetitive multi-step patterns

---

### 4. 🗣️ Text-to-Speech Output (Voice Response)

**What:** Read Copilot's responses aloud using local TTS, completing the voice loop (voice in → voice out). True hands-free coding.

**Why it's unique:** Copilot CLI is text-only output. No AI coding tool has voice response in the terminal.

**Key capabilities:**
- Toggle with hotkey (e.g., `Ctrl+T`) or voice command
- macOS: use built-in `say` command (zero dependencies)
- Windows: use PowerShell `SpeechSynthesizer` (zero dependencies)
- Smart filtering: only read the "answer" part, skip code blocks, skip ANSI
- Configurable voice, speed, and verbosity level

**Complexity:** Low-Medium — platform TTS is built-in, main work is output parsing
**Impact:** Medium-High — killer accessibility feature, great for hands-free workflows

---

### 5. 📋 Clipboard Integration (Hotkey: `Ctrl+Y`)

**What:** Bidirectional clipboard support — paste clipboard content as context, or copy code blocks from Copilot responses to clipboard.

**Why it's unique:** Copilot CLI has no clipboard awareness. Users must manually copy-paste between terminal and other apps.

**Key capabilities:**
- `Ctrl+Y` → inject clipboard content into prompt (text or image path)
- Auto-detect clipboard images → save to temp file → inject as `@path`
- "Copy last code block" hotkey → extracts last ```code``` block from response
- Clipboard history ring (last 5 items)

**Complexity:** Low — `pbcopy`/`pbpaste` (macOS), PowerShell (Windows)
**Impact:** Medium-High — quality-of-life feature everyone will use daily

---

### 6. 🌍 Multi-Language Voice Support

**What:** Extend voice input beyond English to all 99 languages whisper.cpp supports. Auto-detect language or let user configure preferred language.

**Why it's unique:** Current copilot-plus is English-only. International developers are locked out of voice features.

**Key capabilities:**
- Config option: `"voiceLanguage": "auto"` or `"es"`, `"ja"`, `"de"`, etc.
- Auto-language detection (whisper's built-in feature)
- Use non-.en models (e.g., `ggml-base.bin` instead of `ggml-base.en.bin`)
- Language-specific wake phrases
- Setup wizard prompts for language preference

**Complexity:** Low — whisper already supports this, mainly config/model changes
**Impact:** High — opens the tool to the entire international developer community

---

### 7. 📌 Response Bookmarks & Snippet Manager (`copilot+ --snippets`)

**What:** Save, tag, and search useful AI responses. Build a personal knowledge base from your Copilot interactions.

**Why it's unique:** Copilot CLI conversations are ephemeral. `/share` exports a whole session but there's no way to bookmark specific responses.

**Key capabilities:**
- Hotkey to bookmark the last response (e.g., `Ctrl+B`)
- Tag bookmarks (e.g., "docker", "typescript", "debugging")
- `copilot+ --snippets` → searchable TUI browser
- Re-inject a saved snippet into current conversation
- Export bookmarks to Markdown

**Complexity:** Medium — output parsing, SQLite storage, new TUI view
**Impact:** Medium — builds institutional knowledge from AI conversations

---

### 8. 🔔 Smart Notifications & Alerting Rules

**What:** Configurable notification rules that go beyond the current "ATTENTION" status in the monitor.

**Why it's unique:** Copilot CLI has no notification system. The current monitor shows status but can't alert proactively.

**Key capabilities:**
- "Alert me if a session is waiting >60s for my response" (desktop notification)
- "Alert me when any background session completes"
- "Alert me if I've used >80% of my premium quota"
- Notification channels: desktop notification, sound, terminal bell
- Slack/Discord webhook integration (optional)
- Configurable in `copilot-plus.json`

**Complexity:** Low-Medium — build on existing monitor infrastructure
**Impact:** Medium — great for users running multiple sessions

---

### 9. ⚡ Quick Commands / Shell Integration

**What:** Run shell commands directly from the Copilot prompt with a prefix (e.g., `!git status`) and inject the output as context. Bridges the gap between terminal and AI.

**Why it's unique:** In Copilot CLI, you have to exit or use a separate terminal to run commands, then manually paste output back.

**Key capabilities:**
- `!command` prefix → run in shell, inject stdout as context
- `!!` → re-run last shell command and inject output
- Preserve command output in session context
- Common shortcuts: `!diff`, `!test`, `!lint`, `!build`

**Complexity:** Low — shell exec + output capture + text injection
**Impact:** High — eliminates constant terminal switching

---

### 10. 🎨 Theme Engine & Terminal Customization

**What:** Customizable color themes for the command palette, monitor dashboard, and status indicators. Ship with several presets (dark, light, solarized, etc.).

**Why it's unique:** Copilot CLI has `/theme` but it only affects Copilot's own output. copilot-plus UI elements (palette, monitor) are hardcoded.

**Key capabilities:**
- Theme presets in config: `"theme": "dark"` / `"monokai"` / `"solarized"`
- Custom color overrides for palette, monitor, status badges
- Respect terminal capabilities (256-color, truecolor, or basic)

**Complexity:** Low — ANSI color abstraction layer
**Impact:** Low-Medium — nice polish, community loves customization

---

### 11. 📡 Session Sharing & Team Sync

**What:** Export/import copilot-plus sessions (including macros, workflows, model configs) as shareable packages. Team leads can distribute standard configurations.

**Why it's unique:** Copilot CLI `/share` exports conversation text. This would share the entire copilot-plus *setup* — macros, workflows, model preferences.

**Key capabilities:**
- `copilot+ --export-config` → shareable JSON/YAML package
- `copilot+ --import-config <url|file>` → apply team config
- Merge strategies (overwrite / keep existing / merge)
- Version pinning for config compatibility

**Complexity:** Low — config serialization/deserialization
**Impact:** Medium — great for teams adopting copilot-plus together

---

### 12. 🔒 Sensitive Data Guard

**What:** Scan prompts before sending to detect and warn about secrets, API keys, passwords, or PII that shouldn't be sent to the AI.

**Why it's unique:** Copilot CLI has no pre-send content scanning. Enterprise users worry about accidentally sharing secrets.

**Key capabilities:**
- Regex patterns for common secrets (AWS keys, GitHub tokens, passwords, emails)
- Warning popup: "Your prompt contains what looks like an API key. Send anyway? [y/N]"
- Configurable patterns and severity levels
- Auto-redact option (replace with `[REDACTED]`)

**Complexity:** Low-Medium — regex scanning, confirmation prompt injection
**Impact:** High — enterprise/security-conscious users will love this

---

## Summary Matrix

| # | Feature | Complexity | Impact | Uniqueness |
|---|---------|-----------|--------|------------|
| 1 | Session History & Analytics | Medium | ⭐⭐⭐⭐⭐ | No CLI tool does this |
| 2 | Smart Auto-Context Injection | Medium | ⭐⭐⭐⭐⭐ | Biggest friction saver |
| 3 | Prompt Workflows / Chains | Medium-High | ⭐⭐⭐⭐ | GitHub Actions for AI |
| 4 | Text-to-Speech Output | Low-Medium | ⭐⭐⭐⭐ | True hands-free coding |
| 5 | Clipboard Integration | Low | ⭐⭐⭐⭐ | Daily quality-of-life |
| 6 | Multi-Language Voice | Low | ⭐⭐⭐⭐ | Opens international market |
| 7 | Response Bookmarks | Medium | ⭐⭐⭐ | Personal AI knowledge base |
| 8 | Smart Notifications | Low-Medium | ⭐⭐⭐ | Multi-session power users |
| 9 | Quick Shell Commands | Low | ⭐⭐⭐⭐ | Eliminates terminal switching |
| 10 | Theme Engine | Low | ⭐⭐ | Nice polish |
| 11 | Session/Config Sharing | Low | ⭐⭐⭐ | Team adoption driver |
| 12 | Sensitive Data Guard | Low-Medium | ⭐⭐⭐⭐ | Enterprise must-have |

## My Top Recommendations (if I were picking)

**Quick wins (ship in a day or two):**
- #5 Clipboard Integration
- #6 Multi-Language Voice
- #9 Quick Shell Commands

**High-impact, medium-effort (flagship features):**
- #1 Session History & Analytics — this becomes THE reason to use copilot+ over bare copilot
- #2 Smart Auto-Context — solves the biggest daily pain point
- #12 Sensitive Data Guard — enterprise unlock

**Differentiator / viral potential:**
- #4 Text-to-Speech — "talk to copilot and it talks back" is a demo that sells itself
- #3 Prompt Workflows — "GitHub Actions for your AI conversations" is a compelling pitch
