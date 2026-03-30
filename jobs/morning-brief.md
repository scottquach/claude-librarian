---
name: morning-brief
cron: '45 7 * * *'
telegram: true
model: haiku
---

Check today's day header in the current weekly note for unchecked tasks.

If there are no unchecked tasks for today, output exactly: `[SKIP]`

If there are unchecked tasks, send a brief Telegram-friendly morning reminder with just:
- A short opening line that frames this as today's plan
- The unchecked tasks for today as a clean checklist

Do not ask questions. Do not suggest new tasks. Do not include tasks from other days.
