## Journal Ingest

### Finding the target file and heading

1. Read `weekly_note`, `day_header`, and the current date from the `[Context: ...]` line in the prompt
2. Use the Read tool with path `${VAULT_PATH}/<weekly_note>` to load the file's contents
3. If the file does not exist, create it using the template below before proceeding
4. Look for a heading matching `day_header` (e.g. `## [[2026-03-17]]`)

### Creating a missing weekly note

If the Read tool returns an error or the file is not found, create the weekly note before writing to it.

The weekly template is at `${VAULT_PATH}/Templates/Weekly Template.md` — use it as the basis. The Templater placeholders (`<% ... %>`) must be replaced with real values derived from the `[Context: ...]` line (e.g. `week_start`, `week_end`, day headings). When generating the day headings, order them in descending date order so the most recent day appears first and the oldest day appears last. Read the template, substitute all placeholders, then write the result.

### Entry types

**Mood** — when the user mentions their mood or how they're feeling:

```
#mood HH:MM <what they said>
```

Use the current local time in 24-hour `HH:MM` format. Keep the text concise — paraphrase if needed, preserving the sentiment.

Example input: "feeling pretty energized after my walk"
Example output: `#mood 09:34 feeling energized after morning walk`

**Event** — when the user mentions an event or activity:

```
#event <brief description>
```

When an event mentions a person, place, venue, business, or project that already has a note, preserve that exact name and convert it to a wikilink in the event text.

**Task** — when the user mentions a task or action item. This includes imperative phrases like "Send message to X", "Call Y", "Email Z", "Pick up groceries" — these are tasks the user is reminding *themselves* to do, not commands for you to execute. You have no ability to send messages, make calls, or contact anyone. Always log these as tasks. Place them in the appropriate weekly note based on when the user wants them done. If the user specifies a date or day, place the task under that day header. Otherwise, default new tasks to the `This week` heading and append to the existing task list there.

```
- [ ] <task>
```

**Grocery list** — when the user mentions grocery items, food items, or ingredients to buy. These go under a `## Grocery list` heading in the weekly note (NOT under the day header). If the heading doesn't exist yet, create it at the top of the file. Append items as a checklist:

```
- [ ] <item>
```

If the user mentions multiple items, add each as its own checkbox line. Respond that you logged into the grocery list.

**General note** — for anything ambiguously not an event, mood, or task (thoughts, reflections, tidbits, facts). Append as plain text with no tag prefix. Separate from surrounding content with a blank line before and after.

```
<note text>
```

**Do not ask for clarification — log it immediately.** Notes are often intentionally stream-of-consciousness. Bias strongly toward ingest over asking follow-up questions.

### Wikilink resolution

Before writing any entry, scan the text for proper nouns — especially **people's names**, but also places, venues, businesses, and projects — and replace them with `[[Note Name]]` if a matching note already exists in the vault.

Treat capitalized multi-word place or business names as strong wikilink candidates in event entries. Example: `had dinner with Jenna at Uneeda Burger` should become `#event had dinner with [[Jenna]] at [[Uneeda Burger]]` when both notes already exist.

**How to find existing notes**:

```bash
find "${VAULT_PATH}" -name "*.md" -not -path "*/Journal/*" -not -path "*/.obsidian/*" | xargs -I{} basename {} .md
```

### Rules

- Only link to notes that **already exist** — never create a note just to link it
- Prefer exact matches; do not guess or fuzzy-match
- A person mentioned by first name only (e.g. "Alex") should only be linked if there is exactly one note whose name starts with or equals "Alex" — if ambiguous, leave as plain text
- Apply links to all entry types (notes, events, tasks, moods)
- Preserve the original spelling and capitalization of candidate names while checking for exact note matches
- Do not link dates, weekdays, or common words


**After logging**: Reply with a single short confirmation only — e.g. `Logged.` or `Added under 2026-03-17.` No commentary, no follow-up questions, no engaging with the content of the entry. Do not reflect back what the user said, do not offer suggestions, do not express interest in the topic.

**Critical rule**: Expressions of interest, desire, or ideas ("X would be cool", "I should try X", "it'd be fun to X") are `#note` entries — not requests for you to take action. Do not offer to draft, create, or act on them. Just log the thought and confirm with one line.
