# Job Scheduler Design

## Overview

A lightweight scheduled job system where jobs are defined as `.md` files with YAML frontmatter. On startup, the app reads the `jobs/` directory and schedules each job using `node-cron`. Jobs run Claude with the file body as the prompt, and optionally send output to a default Telegram chat.

## File Structure

```
jobs/
  daily-summary.md
  weekly-review.md
```

Each `.md` file is one job. Example:

```yaml
---
name: daily-summary
cron: "0 9 * * 1-5"
telegram: true
model: haiku
---

Summarize any journal entries from the past 24 hours and highlight action items.
```

### Frontmatter fields

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | yes | — | Human-readable job name for logging |
| `cron` | yes | — | Standard 5-field cron expression (local time) |
| `telegram` | no | `false` | Send output to default Telegram chat |
| `model` | no | `haiku` | Claude model to use |

The file body is the prompt sent to Claude when the job fires.

## Implementation

### New: `src/job-scheduler.js`

- Reads all `.md` files from the `jobs/` directory
- Parses frontmatter using the existing `yaml` package
- Schedules each job with `node-cron`
- On fire: runs `createClaudeCommandRunner` with the job's model and prompt
- If `telegram: true`: sends result to `DEFAULT_CHAT_ID` via `bot.telegram.sendMessage`
- If job errors and `telegram: true`: sends error message to Telegram so failures are visible
- Logs all job activity to console regardless of telegram setting

### Modified: `index.js`

One added call after `bot.launch()`:

```js
const { scheduleJobs } = require('./src/job-scheduler');
scheduleJobs(bot, join(__dirname, 'jobs'));
```

### New env var: `DEFAULT_CHAT_ID`

```
DEFAULT_CHAT_ID=123456789
```

Used by Telegram-enabled jobs to send output proactively.

### New dependency: `node-cron`

```
npm install node-cron
```

## Data Flow

```
startup
  → read jobs/*.md
  → parse frontmatter + body
  → node-cron.schedule(cron, handler)

on fire
  → createClaudeCommandRunner({ model, prompt })
  → if telegram: bot.telegram.sendMessage(DEFAULT_CHAT_ID, output)
  → log to console always
```

## Out of scope

- Per-job Telegram chat targeting (all jobs use `DEFAULT_CHAT_ID`)
- Interactive follow-up sessions from scheduled jobs
- Job retry logic on failure
