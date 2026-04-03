---
name: morning-brief
cron: '30 7 * * *'
telegram: true
model: haiku
---

Check today's day header in the current weekly note for unchecked tasks.

If the `get_calendar_events` tool is available, also check today's calendar events using `start_date=today` and `end_date=today`.

If there are no unchecked tasks for today and no calendar events for today, output exactly: `[SKIP]`

If there are unchecked tasks or calendar events, send a brief Telegram-friendly morning reminder with just:
- A short opening line that frames this as today's plan
- The unchecked tasks for today as a clean checklist, if any
- A short `Calendar` section with today's events in time order, if any

Do not ask questions. Do not suggest new tasks. Do not include tasks from other days.
