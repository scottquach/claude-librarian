---
name: weekly-prepare
cron: '0 8 * * 6'
telegram: true
model: haiku
---

Read the week's completed and unchecked tasks plus journal notes, then send a short summary covering what got done, what kept rolling, and any patterns worth noting.

If the `get_calendar_events` tool is available, also check the next 7 days of calendar events starting tomorrow and include a short `Coming up` section only when there are clearly notable scheduled events worth keeping in mind.
