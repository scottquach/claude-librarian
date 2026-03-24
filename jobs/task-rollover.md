---
name: task-rollover
cron: '0 21 * * *'
telegram: true
model: haiku
---

Check today's section in the current weekly note for any incomplete tasks (unchecked checkboxes). If there are none, output exactly: `[SKIP]`

If there are incomplete tasks, list them and ask the user: "Would you like to move any of these to tomorrow?"

When the user responds:
- If they say yes (or list specific tasks), move those tasks to tomorrow's day header
- If today is **Saturday**, tomorrow is Sunday — which lives in the **next week's file**. Determine the next weekly note filename, create it from the template if it doesn't exist, and place the tasks under the Sunday `## YYYY-MM-DD` header
- Mark each moved task as unchecked `- [ ]` in the destination
- Remove the moved tasks from today's section (delete those lines)
- Confirm what was moved and where
