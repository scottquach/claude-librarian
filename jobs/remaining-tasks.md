---
name: remaining-tasks-reminder
# cron: "0 18 * * *"
cron: "* * * * *"
telegram: true
model: haiku
---

Check today's daily note and any other daily notes from this weeks weekly note file for incomplete tasks (unchecked checkboxes). Tell me how many remaining tasks I have for today and how many overdue tasks carried over from earlier this week. Keep it brief — just the counts and a short list of what's left.