---
name: daily-rollover
cron: '0 21 * * *'
telegram: true
model: haiku
---

Review the current weekly note.

1. Find today's `## YYYY-MM-DD` section and collect all unchecked tasks from today.
2. Review the `This week` section and identify any unchecked tasks that are not already scheduled under a day header later this week.
3. If the `get_calendar_events` tool is available, check calendar events for the next 3 days starting tomorrow. Use that schedule to judge how much space tomorrow realistically has and whether any `This week` task would be especially useful to complete before an upcoming event.
4. Propose `This week` tasks that would make sense to schedule for tomorrow. Don't propose any new tasks if there are already at most 3 tasks scheduled, unless those tasks seem low effort to complete. If there does seem to be room propose at most 2 tasks from `This week`. Keep the list selective and practical, avoid overloading a day that already looks busy from the calendar.

Output rules:

- If there are no unchecked tasks from today and there is nothing reasonable to propose from `This week`, output exactly: `[SKIP]`
- Otherwise, send a short prompt to the user:
    - List today's unchecked tasks under `Tasks to carry over from today`
    - List proposed `This week` tasks under `Could also add for tomorrow`
    - If calendar context materially affected your judgment, include one short line noting that tomorrow looks busy or open, or that a suggested task would help ahead of an upcoming event
    - Ask which tasks should be moved to tomorrow

When the user responds:

- If they reply with only `yes`, move all tasks from `Could also add for tomorrow`
- If they name specific tasks, move the tasks they selected as long as the intended match is unambiguous
- Accept shorthand references when they map cleanly to one listed task, including a distinctive substring, a numbered or ordered reference if the bot used an ordered list, or grouped intent like `all from today`
- If the user's selection could refer to multiple listed tasks, ask a brief clarification question and make no file changes yet
- If they decline or do not select any tasks, make no file changes
- If today is **Saturday**, tomorrow is Sunday and belongs in the next week's file. Determine the next weekly note filename, create it from the weekly note template if it does not exist, and place moved tasks under the Sunday `## YYYY-MM-DD` header
- Otherwise, place moved tasks under tomorrow's `## YYYY-MM-DD` header in the current weekly note
- Mark each moved task as unchecked `- [ ]` in the destination
- Do not create duplicate tasks in the destination if the same task already exists there
- Remove moved tasks from today's section
- Remove moved tasks from the `This week` section if they were moved from there
- Confirm exactly what was moved and where
