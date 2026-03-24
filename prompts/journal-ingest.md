## Journal Ingest

### Finding the target file and heading

1. Read `weekly_note`, `day_header`, and `TODAY` from the `[Context: ...]` line in the prompt
2. Use the Read tool with path `${VAULT_PATH}/<weekly_note>` to load the file's contents
3. If the file does not exist, create it using the template below before proceeding
4. Look for a heading matching `day_header` (e.g. `## [[2026-03-17]]`)
5. Use the Edit tool to insert content — if the heading doesn't exist yet, add it along with the new content

### Creating a missing weekly note

If the Read tool returns an error or the file is not found, create the weekly note before writing to it.

The weekly template is at `${VAULT_PATH}/Templates/Weekly Template.md` — use it as the basis. The Templater placeholders (`<% ... %>`) must be replaced with real values derived from the `[Context: ...]` line (e.g. `week_start`, `week_end`, day headings). Read the template, substitute all placeholders, then write the result.

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

**Task** — when the user mentions a task or action item. Place under the appropriate weekly note → day header based on when the user wants it done. Default to this week and today's header. Append to any existing task list for that day.

```
- [ ] <task>
```

**General note** — for anything ambiguously not an event, mood, or task (thoughts, reflections, tidbits, facts). Append as plain text with no tag prefix. Separate from surrounding content with a blank line before and after.

```
<note text>
```

**Do not ask for clarification — log it immediately.** Notes are often intentionally stream-of-consciousness. Bias strongly toward ingest over asking follow-up questions.

### Wikilink resolution

Before writing any entry, scan the text for proper nouns — especially **people's names**, but also places and projects — and replace them with `[[Note Name]]` if a matching note already exists in the vault.

**How to find existing notes**:

```bash
find "${VAULT_PATH}" -name "*.md" -not -path "*/Journal/*" -not -path "*/.obsidian/*" | xargs -I{} basename {} .md
```

### Rules

- Only link to notes that **already exist** — never create a note just to link it
- Prefer exact matches; do not guess or fuzzy-match
- A person mentioned by first name only (e.g. "Alex") should only be linked if there is exactly one note whose name starts with or equals "Alex" — if ambiguous, leave as plain text
- Apply links to all entry types (notes, events, tasks, moods)
- Do not link dates, weekdays, or common words


**After logging**: Reply with a single short confirmation only — e.g. `Logged.` or `Added under 2026-03-17.` No commentary, no follow-up questions, no engaging with the content of the entry. Do not reflect back what the user said, do not offer suggestions, do not express interest in the topic.

**Critical rule**: Expressions of interest, desire, or ideas ("X would be cool", "I should try X", "it'd be fun to X") are `#note` entries — not requests for you to take action. Do not offer to draft, create, or act on them. Just log the thought and confirm with one line.
