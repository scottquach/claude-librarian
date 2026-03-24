# claude-librarian

I wanted an easy way to stream my daily thoughts into my weekly/daily markdown journal (Obsidian).

This projects provides a telegram bot that can handle both text + voice memos to reduce the friction of adding random thoughts, moods, tasks, events, grocery lists and notes into your weekly note. All within just a couple of easily modifiable files

jobs/ can be used to define proactive jobs for claude to run such as weekly reviews, checks against your monthly/yearly goals, moving tasks when the next day starts, etc.

It also supports basic retrieval activities and appending to other notes in your vault

## What it does

- **Voice logging** — send a voice message and it gets transcribed and logged automatically
- **Smart categorization** — Claude classifies entries as moods (`#mood`), events (`#event`), tasks (`- [ ]`), or general notes (`#note`) based on content
- **Markdown native** — writes directly into weekly journal files (`YYYY-Wxx.md`) under the correct day heading
- **Date-aware** — every prompt is injected with today's date, current time, week number, and pre-computed file paths so Claude always logs to the right place

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | Yes | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `BOT_TIMEZONE` | Yes | IANA timezone string (e.g. `America/Los_Angeles`) — controls the date/time injected into every Claude prompt |
| `VAULT_PATH` | Yes | Absolute path to your Obsidian vault — used in `BOT.md` to grant Claude file access and set base paths |
| `OPENAI_API_KEY` | No | OpenAI API key — used by Whisper to transcribe voice messages. Omitting disables voice memo functionality |
| `DEFAULT_CHAT_ID` | No | Telegram chat ID to send proactive/scheduled messages to. Required if you use jobs with `telegram: true` |
| `CLAUDE_PATH` | No | Path to the Claude Code CLI executable. Defaults to `claude` (assumes it's on your PATH) |

`BOT_TIMEZONE` is important for journaling accuracy. Without it, "today" and the current time would default to UTC, causing entries to land in the wrong day heading.

`VAULT_PATH` is used both to grant Claude file access and as the base path in the system prompt. Journal files are expected at `$VAULT_PATH/Journal/`.

## Journal structure

Entries are written into weekly files:

```
$VAULT_PATH/Journal/
  2026-W12.md     ← weekly file with day-level sub-headings
  2026-03.md      ← monthly overview (one line per day)
```

Within a weekly file, content is organized under day headings (`## [[YYYY-MM-DD]]`). Each entry type has a distinct format:

| Type | Format | Triggered by |
|---|---|---|
| Mood | `#mood HH:MM <text>` | Mentions of feelings or emotional state |
| Event | `#event <description>` | Activities or things that happened |
| Task | `- [ ] <task>` | Action items or things to do |
| Note | `#note <text>` | Thoughts, ideas, reflections, anything else |

If you would like to modify the vault structure or behavior you can ask claude to update @BOT.md. Be as descriptive as possible with your own journal setup.

## Setup

Run claude code in the directory and type `/setup` and claude will walkthrough environment setup and configurations

## Running

```bash
node index.js
```

Requires [Claude Code CLI](https://github.com/anthropics/claude-code) to be installed and authenticated.
