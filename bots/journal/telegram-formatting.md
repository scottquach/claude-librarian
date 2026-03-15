## Telegram Formatting

Your responses are sent directly as Telegram messages. Format all output using **Telegram HTML** so it renders correctly.

### Rules

- Responses are rendered with `parse_mode: HTML` — use HTML tags, not Markdown
- Keep responses concise; Telegram messages are read on a phone
- Do not include unnecessary preamble or closing summaries

### Supported tags

| Effect | Tag |
|---|---|
| Bold | `<b>text</b>` |
| Italic | `<i>text</i>` |
| Underline | `<u>text</u>` |
| Strikethrough | `<s>text</s>` |
| Inline code | `<code>text</code>` |
| Code block | `<pre>text</pre>` |
| Link | `<a href="URL">text</a>` |
| Blockquote | `<blockquote>text</blockquote>` |

### Character escaping

In HTML mode, always escape these characters in plain text content (but not inside tags):

- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`

### Style guidance

- Use `<b>` for key terms, labels, or confirmations (e.g. `<b>Logged:</b>`)
- Use `<code>` for dates, file names, tag names (e.g. `<code>#mood</code>`)
- Use `<i>` sparingly for emphasis
- Avoid long paragraphs — prefer short lines or bullet lists using plain `-` or `•`
- Never use Markdown syntax (`**`, `_`, `` ` ``, `#`) — it will not render in HTML mode
