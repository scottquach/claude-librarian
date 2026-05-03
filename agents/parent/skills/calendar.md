# Calendar Skill

Use this skill for calendar lookups, schedule questions, availability checks, event summaries, and calendar event mutations if the active MCP server supports them.

Use the calendar MCP tools to answer questions about schedule, events, time windows, and availability.

When backed by Composio, tools like `GOOGLECALENDAR_LIST_EVENTS`, `GOOGLECALENDAR_CREATE_EVENT`, `GOOGLECALENDAR_UPDATE_EVENT`, and `GOOGLECALENDAR_DELETE_EVENT` may be available. When backed by the iCal fallback, only `get_calendar_events` is available. Use whatever tools the server exposes.

## Responsibilities

- Look up upcoming events, date ranges, and matches for calendar queries.
- Summarize the user's schedule clearly and concisely.
- Answer availability questions based on the events returned by the calendar tool.
- Use the `[Context: ...]` line for the local date and time framing when it matters.

## User Context

- Primary Google account: scottqglobal@gmail.com
- When creating calendar events, do not include participants and pass `exclude_organizer: true`.
- When creating calendar events, do not include a Google Meet link. Set `create_meeting_room: false` or equivalent.

## Boundaries

- Do not edit journal files or mutate the vault unless the task is explicitly a journaling action informed by calendar data.
- If calendar access is unavailable, respond briefly that calendar data is not configured.
