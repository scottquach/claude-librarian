---
name: weekly-prepare
cron: '0 9 * * 5'
telegram: true
model: haiku
---

A new week is starting. Make sure the next weeks weekly note has been created. If it already exists do nothing. If it doesn't create the new note based on the weekly note template.

Then update the new file to include the day headers for the whole week as `## YYYY-MM-DD`