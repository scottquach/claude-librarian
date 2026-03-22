# Claude Agent SDK Migration Plan

**Date:** 2026-03-22
**Status:** Proposed

## Overview

Replace the current `child_process.spawn()` approach in `bot.js` with the `@anthropic-ai/claude-agent-sdk` package. This is the same approach used by [t3code (pingdotgg/t3code)](https://github.com/pingdotgg/t3code).

The SDK internally spawns the `claude` CLI binary, so **no `ANTHROPIC_API_KEY` is required** — authentication flows through the user's existing Claude Code subscription login.

---

## Current Architecture

```
Telegram Message
  → spawn('claude', [--model, --add-dir, --allowed-tools, --output-format stream-json, ...])
  → listen on stdout
  → parse stream-json line by line
  → extract result + session_id
  → kill process on timeout (SIGTERM)
  → ctx.reply(output)
```

The relevant code in `bot.js`:
- `spawnCommand()` — wraps `child_process.spawn`
- `buildArgs()` — constructs CLI flag array
- Stream-json line parser — parses `result`, `session_id` from raw output
- Timeout/SIGTERM management

**Total lines to be replaced: ~100**

---

## Target Architecture

```
Telegram Message
  → query({ prompt, options }) from @anthropic-ai/claude-agent-sdk
  → for await (message of query(...))
  → extract result + session_id from typed message objects
  → ctx.reply(output)
```

Auth flow:
```
query()
  → internally spawns: claude CLI binary
    → claude CLI uses existing Claude Code subscription login
      → no ANTHROPIC_API_KEY required
```

---

## How t3code Does It

[t3code](https://github.com/pingdotgg/t3code) wraps `query()` in an Effect-framework service layer with:

- `pathToClaudeCodeExecutable: process.env.CLAUDE_PATH ?? "claude"` — uses local CLI binary
- `env: process.env` — passes full environment to subprocess
- `permissionMode: "acceptEdits"` — auto-accepts file changes (required for headless use)
- `includePartialMessages: true` — enables streaming deltas
- `canUseTool` callback — suspends and asks user via UI to approve/deny tools (t3code-specific)
- Long-lived `query()` sessions with turns pushed via a `Queue` (overkill for a Telegram bot)

For `claude-librarian`, a simpler one-call-per-message pattern is sufficient.

---

## Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

---

## Migration: `createClaudeCommandRunner` Replacement

Replace the entire function in `bot.js` with:

```javascript
import { query } from '@anthropic-ai/claude-agent-sdk';

export function createClaudeCommandRunner({ model, tools, directories, systemPrompt }) {
  return async function runCommand(prompt, sessionId = null) {
    let newSessionId = sessionId;
    let result = null;

    const options = {
      // Uses local Claude CLI binary — no API key required
      pathToClaudeCodeExecutable: process.env.CLAUDE_PATH ?? 'claude',
      env: process.env,

      cwd: directories[0],
      allowedTools: tools,               // e.g. ['Read', 'Write', 'Edit', 'Bash']
      model,                             // e.g. 'claude-haiku-4-5'
      systemPrompt,
      permissionMode: 'acceptEdits',     // required for headless/bot use
      allowDangerouslySkipPermissions: false,
      includePartialMessages: true,

      // Session resumption — replaces --continue flag
      ...(sessionId ? { resume: sessionId } : {}),
    };

    for await (const message of query({ prompt, options })) {
      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
      }
      if ('result' in message) {
        result = message.result;
      }
    }

    return { output: result, sessionId: newSessionId };
  };
}
```

---

## What Gets Deleted

Once migrated, remove from `bot.js`:

| Code | Lines (approx) |
|------|----------------|
| `spawnCommand()` function | ~30 |
| `buildArgs()` function | ~20 |
| stream-json line-by-line parser | ~40 |
| timeout / SIGTERM management | ~15 |
| XML conversation store (optional) | ~35 |

`bot.js` shrinks from ~230 lines to ~80 lines.

---

## CLI Flag → SDK Option Mapping

| CLI Flag | SDK Option |
|---|---|
| `--model haiku` | `model: 'claude-haiku-4-5'` |
| `--add-dir /vault` | `cwd: '/vault'` |
| `--allowed-tools Read,Write,Edit,Bash` | `allowedTools: ['Read', 'Write', 'Edit', 'Bash']` |
| `--system-prompt "..."` | `systemPrompt: "..."` |
| `--continue` | `resume: sessionId` |
| `--output-format stream-json` | built-in (SDK handles) |
| `--verbose` | built-in (SDK handles) |
| Timeout + SIGTERM | `maxTurns: N` (turn limit) |

---

## Optional Enhancements After Migration

### Multiple Directories
The `additionalDirectories` option (used by t3code) supports multiple vault paths:
```javascript
additionalDirectories: directories,  // replaces multiple --add-dir flags
```

### Effort Control
Add `effort: 'low'` for faster/cheaper Haiku responses:
```javascript
effort: 'low',  // 'low' | 'medium' | 'high' | 'max'
```

### Custom Binary Path
Allow users to override the `claude` binary location via `.env`:
```
CLAUDE_PATH=/usr/local/bin/claude
```

### Streaming to Telegram
With `includePartialMessages: true`, partial text can be sent to Telegram as Claude types, rather than waiting for the full response.

---

## Trade-offs

| | Current (spawn) | SDK (`query()`) |
|---|---|---|
| Requires `claude` on PATH | Yes | Yes (same) |
| Requires `ANTHROPIC_API_KEY` | No | No (same) |
| Manual stream parsing | Yes | No |
| Manual process/timeout management | Yes | No |
| Session state storage | XML files | SDK native |
| Type safety | No | Yes |
| Multi-directory support | Yes (multiple `--add-dir`) | Yes (`additionalDirectories`) |

---

## References

- [t3code ClaudeAdapter.ts](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts)
- [Agent SDK TypeScript docs](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/README.md)
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
