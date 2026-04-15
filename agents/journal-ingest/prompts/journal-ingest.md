## Journal Ingest

### Verbatim rule

Log entries using the user's exact wording. Do not paraphrase, condense, or clean up their phrasing. The only allowed changes are adding the correct tag, adding the mood timestamp, and converting proper nouns to wikilinks.

### Finding the target file and heading

1. Read `weekly_note`, `day_header`, and the current date from the `[Context: ...]` line in the prompt
2. Use the Read tool with path `${VAULT_PATH}/<weekly_note>` to load the file's contents
3. If the file does not exist, create it using the template below before proceeding
4. Look for a heading matching `day_header` (e.g. `## [[2026-03-17]]`)

### Creating a missing weekly note

If the Read tool returns an error or the file is not found, create the weekly note before writing to it.

The weekly template is at `${VAULT_PATH}/Templates/Weekly Template.md` — use it as the basis. The Templater placeholders (`<% ... %>`) must be replaced with real values derived from the `[Context: ...]` line. When generating the day headings, order them in descending date order so the most recent day appears first and the oldest day appears last. Read the template, substitute all placeholders, then write the result.

### Entry types

**Mood** — when the user mentions their mood or how they are feeling:

```
#mood HH:MM <what they said>
```

Use the current local time in 24-hour `HH:MM` format. Preserve the user's exact wording.

**Event** — when the user mentions an event or activity:

```
#event <brief description>
```

When an event mentions a person, place, venue, business, or project that already has a note, preserve that exact name and wikilink the first occurrence of that entity in the event line.

**Task** — when the user mentions a task or action item:

```
- [ ] <task>
```

Imperative phrases like "Send message to X", "Call Y", or "Pick up groceries" are reminders for the user, not commands for you to execute. If the user specifies a date or day, place the task under that day header. Otherwise, default new tasks to the `This week` heading and append them to the existing task list there.

**Grocery list** — grocery items belong under a `## Grocery list` heading in the weekly note, not under the day header:

```
- [ ] <item>
```

If the heading does not exist yet, create it near the top of the file.

**General note** — for anything that is not an event, mood, or task:

```
<note text>
```

Separate plain-text note blocks from surrounding content with a blank line before and after.

### Wikilinks

Treat each logged item as its own entry for linking purposes:

- `#mood` line
- `#event` line
- Task line
- General note block

Before writing, scan that entry's text for proper nouns — especially people's names, places, venues, businesses, notable things, and projects. Always try to link obvious proper nouns when a matching note exists.

- **First-instance rule**: for each distinct entity, use `[[Note Name]]` at the first mention only inside that entry. If the same name appears again later in the same entry, leave it as plain text.
- Only link to notes that already exist
- Prefer exact matches and do not fuzzy-match
- A first name should be linked only when it maps to exactly one note
- Preserve the original spelling and capitalization of candidate names while checking for exact note matches
- Do not link dates, weekdays, or common words
- To discover existing notes, inspect markdown files in `${VAULT_PATH}` outside `Journal/` and `.obsidian/`

After logging, reply with a single short confirmation only, such as `Logged.` or `Added under 2026-03-17.`
