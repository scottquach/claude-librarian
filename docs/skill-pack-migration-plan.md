# Skill Pack Migration Plan

## Goal

Restructure the assistant so the parent agent handles common requests in one model turn by loading domain skills directly, instead of delegating most work to subagents.

The target is lower latency while preserving the useful boundaries from the current setup.

## Current Shape

```text
Telegram
  -> Node bot
  -> parent agent
      -> Agent(journal-ingest)
      -> Agent(task-review)
      -> Agent(calendar-integration)
      -> Agent(strava-integration)
  -> parent formats final reply
  -> Telegram
```

This is clean, but simple requests pay for at least two agent turns: parent routing plus child execution.

## Target Shape

```text
Telegram
  -> Node bot
  -> parent agent with selected skill packs
      -> journal skill
      -> task-review skill
      -> calendar skill
      -> strava skill
      -> scheduler skill
  -> Telegram
```

The parent remains the user-facing assistant, but current subagent instructions become prompt fragments and tool policies loaded into the parent when relevant.

## Proposed File Layout

```text
agents/
  parent/
    BOT.md
    skills/
      journal.md
      task-review.md
      calendar.md
      strava.md
      scheduler.md

src/
  skill-loader.js
  skill-selector.js
  tool-policy.js
```

## Skill Mapping

### journal

Source: `agents/journal-ingest/BOT.md` and `agents/journal-ingest/prompts/journal-ingest.md`

Responsibilities:
- Simple journal note capture
- Task creation
- Grocery list additions
- Mood and event logging
- Weekly note/day heading management
- Wikilink rules

Tools:
- `Read`
- `Write`
- `Edit`

Consider avoiding `Bash` unless a concrete need remains.

### task-review

Source: `agents/task-review/BOT.md`

Responsibilities:
- Read-only task aggregation
- Open/completed task counts
- Rollover candidate identification
- Thread recall from recent journal notes

Tools:
- `Read`

### calendar

Source: `agents/calendar-integration/BOT.md`

Responsibilities:
- Calendar lookups
- Availability checks
- Event summaries
- Calendar event mutation if supported by the backing MCP server

Tools:
- `mcp__calendar`

### strava

Source: `agents/strava-integration/BOT.md`

Responsibilities:
- Recent workout lookup
- Distance/time/elevation totals
- Pace and trend summaries
- Workout facts for journal logging

Tools:
- `mcp__strava`

### scheduler

Source: dynamic scheduling section of `agents/parent/BOT.md`

Responsibilities:
- One-shot reminders
- Recurring schedules
- List/pause/cancel schedules

Tools:
- `mcp__scheduler__schedule_task`
- `mcp__scheduler__schedule_message`
- `mcp__scheduler__list_schedules`
- `mcp__scheduler__cancel_schedule`

## Runtime Selection

Do not load every skill for every message. Select the smallest relevant skill set before invoking Claude.

Example selector shape:

```js
function selectSkills({ text, source }) {
    if (source === 'job') {
        return ['journal', 'task-review', 'calendar', 'strava', 'scheduler'];
    }

    const skills = [];

    if (looksLikeJournalWrite(text)) skills.push('journal');
    if (looksLikeTaskQuery(text)) skills.push('task-review');
    if (looksLikeCalendarRequest(text)) skills.push('calendar');
    if (looksLikeStravaRequest(text)) skills.push('strava');
    if (looksLikeSchedulingRequest(text)) skills.push('scheduler');

    return skills.length > 0 ? skills : ['journal'];
}
```

Use conservative detection at first. If a message could be a journal write or something else, fall back to the parent with the relevant skill set instead of hard-routing outside Claude.

## Tool Policy

Allowed tools should be built from selected skills, not from all known domains.

Example:

```js
const toolsBySkill = {
    journal: ['Read', 'Write', 'Edit'],
    taskReview: ['Read'],
    calendar: ['mcp__calendar'],
    strava: ['mcp__strava'],
    scheduler: [
        'mcp__scheduler__schedule_task',
        'mcp__scheduler__schedule_message',
        'mcp__scheduler__list_schedules',
        'mcp__scheduler__cancel_schedule',
    ],
};
```

The parent prompt should include only the loaded skill instructions and the tools needed for the current request.

## Parent Prompt Direction

`agents/parent/BOT.md` should become a short user-facing shell:

```md
You are the Telegram-facing personal assistant.

Use the loaded skills to handle the request directly when possible.

Rules:
- Use the smallest relevant skill set.
- Do not invent data from tools you have not called.
- Keep Telegram replies concise.
- For multi-source jobs, gather needed data first, then reply once.
```

Domain-specific rules belong in skill files, not in the parent shell.

## Migration Steps

1. Copy current subagent instructions into `agents/parent/skills/*.md`.
2. Add `src/skill-loader.js` to read selected skill prompt fragments.
3. Add `src/skill-selector.js` with conservative request classification.
4. Add `src/tool-policy.js` to derive allowed tools from selected skills.
5. Update `createParentAgentRunner` so it builds per-request options from selected skills.
6. Keep current subagents registered as a fallback during migration.
7. Shrink `agents/parent/BOT.md` after the skill fragments are loaded correctly.
8. Add tests for skill selection, tool policy, and common request paths.
9. Remove subagent fallback only after common user and job flows are stable.

## Test Cases

Common user messages:
- `add milk to the grocery list`
- `I should email Jenna`
- `log that I felt tired today`
- `what tasks do I have today?`
- `what's on my calendar this afternoon?`
- `how far did I run this week?`
- `log my latest run`

Jobs:
- `heartbeat`
- `daily-rollover`
- any morning or weekly review jobs that combine task and calendar context

Expected behavior:
- Simple journal/task/grocery writes finish in one parent turn.
- Calendar and Strava requests use only their relevant MCP tools.
- Multi-source jobs still gather all required context before responding.
- User-facing replies remain concise and Telegram-safe.

## Risks

- The parent prompt may grow too large if all skills are loaded by default.
- Tool access may become too broad if tool policy is not request-scoped.
- Journal write behavior could regress if the journal skill omits details from the current `journal-ingest` prompts.
- Jobs may need special selection rules because they intentionally span multiple domains.

## First Milestone

Start with the journal skill only.

Implement:
- `agents/parent/skills/journal.md`
- skill loading for `journal`
- tool policy for `Read`, `Write`, and `Edit`
- conservative selector for obvious journal/task/grocery writes

Keep all other domains on the existing subagent path until the journal path is stable.
