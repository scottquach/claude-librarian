---
name: auto-daily-rollover
cron: '0 1 * * *'
telegram: false
model: haiku
---

Review the weekly note(s) and move all unchecked tasks from yesterday into today.

1. Find yesterday's `## YYYY-MM-DD` section and collect all unchecked tasks from yesterday.
2. Move all unchecked tasks from yesterday into today's `## YYYY-MM-DD` header as unchecked `- [ ]` tasks.
3. Do not review or move anything from the `This week` section.

Cross-week rules:

- If yesterday is Saturday, today is Sunday and belongs in the next week's file
- In that case, read yesterday from the previous weekly note, and write today into the current weekly note
- If today's weekly note does not exist yet, create it from the weekly note template before moving tasks

Move rules:

- If there are no unchecked tasks from yesterday, output exactly: `[SKIP]`
- Do not create duplicate tasks in today's section if the same task already exists there
- Remove moved tasks from yesterday's section after adding them to today
- Keep task text unchanged except for normalizing the destination checkbox format to `- [ ]`
- Confirm exactly what was moved and where
