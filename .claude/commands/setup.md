Guide the user through setting up this claude-librarian project interactively. The setup is idempotent — check what's already configured before asking about it, and skip steps that are already done.

## Steps

Work through each step below in order. Use the AskUserQuestion tool to prompt the user at each decision point. Be concise — don't explain every detail, just ask what you need and act on the answer.

### 1. Check prerequisites

Run these checks in parallel using Bash:
- `node --version` — verify Node.js is installed
- `claude --version` — verify Claude Code CLI is installed
- Check if `node_modules/` exists (use Glob for `node_modules/telegraf`)

If Node.js is missing: tell the user to install it from nodejs.org and stop.
If Claude CLI is missing: tell the user to install it following anthropic.com/claude-code docs and stop.
If node_modules is missing: run `npm install` automatically (no need to ask).

### 2. Telegram Bot Token

Read `index.js` to check the current BOT_TOKEN usage.
Read `.env` if it exists to check if BOT_TOKEN is already set.

If BOT_TOKEN is NOT set in `.env`:
- Ask: "Do you have a Telegram bot token? You can create one via @BotFather on Telegram. Enter your token, or press Enter to skip:"
- If they provide a token: add/update `BOT_TOKEN=<token>` in `.env`
- If they skip: note that the bot won't run without it

### 3. Timezone

Read `.env` to check if `BOT_TIMEZONE` is already set.

If BOT_TIMEZONE is NOT set in `.env`:
- Ask: "What timezone are you in? This ensures journal entries are dated correctly when the bot runs on a server. Enter an IANA timezone (e.g. America/Los_Angeles, America/New_York, Europe/London), or press Enter to default to America/Chicago:"
- If they provide a value: add/update `BOT_TIMEZONE=<tz>` in `.env`
- If they skip: add `BOT_TIMEZONE=America/Chicago` in `.env` and note the default

### 4. Voice transcription (Whisper)

Read `.env` to check if `OPENAI_API_KEY` is already set.

If OPENAI_API_KEY is NOT set in `.env`:
- Ask: "Do you want voice message support? This uses OpenAI Whisper and requires an OpenAI API key. Enter your key, or press Enter to skip:"
- If they provide a key: add/update `OPENAI_API_KEY=<key>` in `.env`
- If they skip: note that voice messages will fail gracefully — the bot still works for text

### 5. Obsidian vault path

Use Glob to find all `bots/*/BOT.md` files, then read each one.
For each bot that has a `directories:` field in its frontmatter, extract the current paths.

If any bot has directories configured:
- Show the current paths — e.g. "Journal bot is pointing to: /Users/scottquach/Documents/My Vault synced"
- Ask: "Are these vault/directory paths correct for this machine? Enter a new path to update, or press Enter to keep as-is:"
- If they provide a new path: update the `directories:` value in that bot's BOT.md frontmatter, and also update any hardcoded absolute paths in the body of the prompt (e.g. `Journal files live in /...`)
- Apply the same replacement to all supplementary `.md` files in that bot's directory

### 6. Scheduled jobs (DEFAULT_CHAT_ID)

Read `.env` to check if `DEFAULT_CHAT_ID` is already set.
Check if any files exist in the `jobs/` directory.

If jobs exist AND `DEFAULT_CHAT_ID` is NOT set:
- Ask: "You have scheduled jobs that send Telegram messages. What is your Telegram chat ID? (You can get it by messaging @userinfobot on Telegram.) Enter your chat ID, or press Enter to skip:"
- If they provide a value: add/update `DEFAULT_CHAT_ID=<id>` in `.env`
- If they skip: note that jobs with `telegram: true` won't know where to send messages

If no jobs exist: skip this step silently.

### 7. Calendar MCP (iCal feeds)

Read `.env` to check if `ICAL_URLS` is already set.

If ICAL_URLS is NOT set in `.env`:
- Ask: "Do you want calendar access? The bot can read iCal feeds (Google Calendar, Apple Calendar, etc.) so Claude can answer questions about your schedule. Enter one or more iCal URLs (comma-separated), or press Enter to skip:"
- If they provide URLs:
  - add/update `ICAL_URLS=<urls>` in `.env`
  - Ask: "Enter labels for each calendar (comma-separated, e.g. `Personal,Work`), or press Enter to skip:"
  - If they provide labels: add/update `ICAL_LABELS=<labels>` in `.env`
  - Note: labels are matched by position to URLs

If ICAL_URLS is already set: show the configured URLs and labels (if any) and ask if they want to update them. Skip if they say no.

### 8. Bots directory

Use Glob to find all `bots/*/BOT.md` files.

If no bots are found:
- Ask: "No bots found in the bots/ directory. Would you like to create a starter bot? (yes/no)"
- If yes: create `bots/my-bot/BOT.md` with this template and tell the user to customize it:

```
---
name: my-bot
description: My custom Claude bot
model: haiku
tools:
  - Read
  - Write
commands:
  - name: chat
    description: Chat with your bot
timeoutMs: 60000
sessionIsolation: perCommand
---

You are a helpful assistant.
```

If bots exist: list their names and commands — e.g. "Found: journal (/journal)"

### 9. Summary

Print a setup summary:
- Prerequisites: ✓ / ✗
- Telegram token: configured / missing
- Timezone: configured (show value) / defaulted to America/Chicago
- Voice (Whisper): configured / skipped
- Vault/directory paths: updated / unchanged
- Scheduled jobs (DEFAULT_CHAT_ID): configured / skipped / not needed
- Calendar MCP (ICAL_URLS): configured (show count of feeds + labels) / skipped
- Bots: list names and their commands
- How to run: `node index.js`

If anything critical is missing (no token, no bots), call that out clearly.
