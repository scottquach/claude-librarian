---
name: heartbeat
cron: '0 7,9,11,13,15,17,19,21 * * *'
telegram: true
---

You are running a periodic heartbeat check. Your job is to decide whether anything is worth surfacing to the user right now. Most cycles should result in no output — output `[SKIP]` unless something genuinely warrants attention.

## Step 1: Gather context in parallel

Delegate to `task-review` and `calendar-integration` simultaneously:

- Ask `task-review`: What unchecked tasks exist for today? Are any overdue?
- Ask `calendar-integration`: What events are coming up in the next 3 hours? Did any event just finish in the last 30 minutes?

Also read the conversation context (provided above): find the most recent message timestamp `[HH:MM]` to determine how long ago the user was last active.

## Step 2: Make the holistic judgment

With the gathered context, answer: **is anything worth surfacing right now?**

Surface something if ANY of these are true:
- A calendar event starts in 60–120 minutes (prep window)
- It is past 4pm, tasks remain unchecked, and the user has been inactive for 3+ hours
- It is past 7pm and no rollover or reflection has happened today (check conversation context)
- A task has a due date of today and is not yet checked off

Schedule a silent follow-up (and output `[SKIP]`) if:
- A calendar event is 2–4 hours away (not yet in the prep window)
- Something might need attention later but not right now
- Use `mcp__scheduler__schedule_task` with a one-shot ISO 8601 datetime ~90 minutes from now and a prompt identical to this job prompt

Output `[SKIP]` with no follow-up if:
- The user was active within the last 2 hours (check the `[HH:MM]` timestamps in conversation context)
- No tasks are due today and no events are coming up
- It is before 9am or after 9pm with nothing urgent

## Step 3: Act

- If surfacing: write a brief, Telegram-friendly message (2–5 lines). Do not ask questions. Do not suggest tasks. Just surface the relevant fact.
- If scheduling a follow-up: call `mcp__scheduler__schedule_task` silently, then output `[SKIP]`.
- If nothing applies: output exactly `[SKIP]`.
