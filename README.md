# claude-librarian

I wanted an easy way to stream my daily thoughts into my weekly/daily markdown journal (Obsidian).

This projects provides a telegram bot that can handle both text + voice memos to reduce the friction of adding randing thoughts, moods, tasks, events, and notes into your daily note. All within just a couple of easily modifiable files

It also supports basic retrieval activities and appending to other notes, though not the primary task.

## What it does

- **Voice logging** — send a voice message and it gets transcribed and logged automatically
- **Smart categorization** — Claude classifies entries as moods (`#mood`), events (`#event`), tasks (`- [ ]`), or general notes (`#note`) based on content
- **Markdown native** — writes directly into weekly journal files (`YYYY-Wxx.md`) under the correct day heading
- **Date-aware** — every prompt is injected with today's date, current time, week number, and pre-computed file paths so Claude always logs to the right place

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | Yes | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `OPENAI_API_KEY` | No | OpenAI API key — used by Whisper to transcribe voice messages. Omitting disables voice memo functionality |
| `BOT_TIMEZONE` | Yes | IANA timezone string (e.g. `America/Los_Angeles`) — controls the date/time injected into every Claude prompt |
| `VAULT_PATH` | Yes | Absolute path to your Obsidian vault — Claude reads and writes journal files here |

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
