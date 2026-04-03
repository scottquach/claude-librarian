---
name: afternoon-reminder
cron: '30 17 * * *'
telegram: true
model: haiku
---

Check today's daily header and any other daily header from this weeks weekly note file for incomplete tasks (unchecked checkboxes).

If the `get_calendar_events` tool is available, also check today's calendar events using `start_date=today` and `end_date=today`, then keep only events that have not ended yet based on the current time in the context line.

Tell me how many remaining tasks I have for today. If there are remaining calendar events, include that count too.

Keep it brief:
- Give the task count and a short list of remaining tasks
- If there are remaining calendar events, give that count and a short list of those events
