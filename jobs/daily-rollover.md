---
name: daily-rollover
cron: '0 21 * * *'
telegram: true
model: haiku
---

Review the current weekly note.

1. Find today's `## YYYY-MM-DD` section and collect all unchecked tasks from today.
2. Review the `This week` section and identify any unchecked tasks that are not already scheduled under a day header later this week.
3. If the `get_calendar_events` tool is available, check tomorrow's calendar events using `start_date` and `end_date` set to tomorrow, then use that schedule to judge how much space tomorrow realistically has.
4. Propose only `This week` tasks that would make sense to schedule for tomorrow. Keep the list selective and practical, and avoid overloading a day that already looks busy from the calendar.

Output rules:

- If there are no unchecked tasks from today and there is nothing reasonable to propose from `This week`, output exactly: `[SKIP]`
- Otherwise, send a short prompt to the user:
  - List today's unchecked tasks under `Carry over from today`
  - List proposed `This week` tasks under `Could also add for tomorrow`
  - If calendar context materially affected your judgment, include one short line noting that tomorrow looks busy or open
  - Ask which tasks should be moved to tomorrow

When the user responds:

- If they reply with only `yes`, move all tasks from `Carry over from today` and all tasks from `Could also add for tomorrow`
- If they name specific tasks, move only the tasks they selected
- If they decline or do not select any tasks, make no file changes
- If today is **Saturday**, tomorrow is Sunday and belongs in the next week's file. Determine the next weekly note filename, create it from the weekly note template if it does not exist, and place moved tasks under the Sunday `## YYYY-MM-DD` header
- Otherwise, place moved tasks under tomorrow's `## YYYY-MM-DD` header in the current weekly note
- Mark each moved task as unchecked `- [ ]` in the destination
- Do not create duplicate tasks in the destination if the same task already exists there
- Remove moved tasks from today's section
- Remove moved tasks from the `This week` section if they were moved from there
- Confirm exactly what was moved and where
