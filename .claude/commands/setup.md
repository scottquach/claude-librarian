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

### 3. Voice transcription (Whisper)

Read `.env` to check if `OPENAI_API_KEY` is already set.

If OPENAI_API_KEY is NOT set in `.env`:
- Ask: "Do you want voice message support? This uses OpenAI Whisper and requires an OpenAI API key. Enter your key, or press Enter to skip:"
- If they provide a key: add/update `OPENAI_API_KEY=<key>` in `.env`
- If they skip: note that voice messages will fail gracefully — the bot still works for text

### 4. Obsidian vault path

Use Glob to find all `bots/*/BOT.md` files, then read each one.
For each bot that has a `directories:` field in its frontmatter, extract the current paths.

If any bot has directories configured:
- Show the current paths — e.g. "Journal bot is pointing to: /Users/scottquach/Documents/My Vault synced"
- Ask: "Are these vault/directory paths correct for this machine? Enter a new path to update, or press Enter to keep as-is:"
- If they provide a new path: update the `directories:` value in that bot's BOT.md frontmatter, and also update any hardcoded absolute paths in the body of the prompt (e.g. `Journal files live in /...`)
- Apply the same replacement to all supplementary `.md` files in that bot's directory

### 5. Bots directory

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

### 6. Summary

Print a setup summary:
- Prerequisites: ✓ / ✗
- Telegram token: configured / missing
- Voice (Whisper): configured / skipped
- Vault/directory paths: updated / unchanged
- Bots: list names and their commands
- How to run: `node index.js`

If anything critical is missing (no token, no bots), call that out clearly.
