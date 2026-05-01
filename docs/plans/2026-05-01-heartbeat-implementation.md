# Heartbeat Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a periodic heartbeat job that wakes the agent every 2 hours, evaluates a minimal context snapshot, and either notifies the user, silently schedules a follow-up check, or does nothing.

**Architecture:** A new `jobs/heartbeat.md` file defines the cron schedule and the full decision-layer prompt. The existing job-scheduler infrastructure runs it; the parent agent delegates reads to task-review and calendar-integration in parallel, then makes the holistic judgment. Timestamps are added to conversation context messages so the agent can reason about the last-activity signal.

**Tech Stack:** Node.js, node-cron, existing job-scheduler + conversation-state modules, parent agent + MCP scheduler tools.

---

### Task 1: Add timestamps to formatted conversation context

The heartbeat needs to know when the user was last active. Currently `formatRecentMessages` omits timestamps from the output. Add `[HH:MM]` prefix derived from the message's `createdAt` field.

**Files:**
- Modify: `src/conversation-state.js` — `formatRecentMessages` function (line 63)
- Test: `src/conversation-state.test.js` (does not exist yet — create it)

**Step 1: Create the failing test**

Create `src/conversation-state.test.js`:

```js
const { createConversationStateStore, createDefaultState } = require('./conversation-state');

describe('formatRecentMessages via buildPrompt', () => {
    it('includes HH:MM timestamps in formatted messages', () => {
        const store = createConversationStateStore({
            conversationDirectoryPath: require('node:os').tmpdir(),
        });

        // Directly test the internal via buildContextBlock by seeding a known state
        // We test the output of buildPrompt which calls buildContextBlock → formatRecentMessages
        const createdAt = '2026-05-01T14:30:00.000Z'; // known timestamp
        const state = {
            ...createDefaultState('test-chat'),
            messages: [
                { role: 'user', content: 'hello', source: 'user', createdAt },
                { role: 'assistant', content: 'hi there', source: 'user', createdAt },
            ],
        };

        // Access internal via saving and loading
        store.save(state);
        const prompt = store.buildPrompt({ chatId: 'test-chat', currentInput: 'ping' });

        // The formatted block should include a time like [14:30] or similar HH:MM
        expect(prompt).toMatch(/\[\d{2}:\d{2}\]/);
    });
});
```

**Step 2: Run the test to confirm it fails**

```bash
node --test src/conversation-state.test.js
```

Expected: fails — no timestamp in output.

**Step 3: Update `formatRecentMessages` in `src/conversation-state.js`**

Replace the existing `formatRecentMessages` function (lines 63-70):

```js
function formatRecentMessages(messages) {
    if (messages.length === 0) return '- (none)';
    return messages
        .map((message) => {
            const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User';
            const time = message.createdAt
                ? new Date(message.createdAt).toISOString().slice(11, 16)
                : '--:--';
            return `- [${time}] ${roleLabel}: ${message.content}`;
        })
        .join('\n');
}
```

**Step 4: Run the test to confirm it passes**

```bash
node --test src/conversation-state.test.js
```

Expected: passes.

**Step 5: Run the full test suite to check for regressions**

```bash
node --test src/**/*.test.js
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/conversation-state.js src/conversation-state.test.js
git commit -m "feat: add timestamps to conversation context message format"
```

---

### Task 2: Create the heartbeat job

A single `.md` file in `jobs/` defines both the cron and the full decision-layer prompt. No code changes required — the existing job-scheduler picks it up automatically.

**Files:**
- Create: `jobs/heartbeat.md`

**Step 1: Create `jobs/heartbeat.md`**

```markdown
---
name: heartbeat
cron: '0 7,9,11,13,15,17,19,21 * * *'
telegram: true
---

You are running a periodic heartbeat check. Your job is to decide whether anything is worth surfacing to the user right now. Most cycles should result in no output — output `[SKIP]` unless something genuinely warrants attention.

## Step 1: Gather context in parallel

Delegate to `task-review` and `calendar-integration` simultaneously:

- Ask `task-review`: What unchecked tasks exist for today? Are any overdue?
- Ask `calendar-integration`: What events are coming up in the next 3 hours? Did any event just finish in the last 30 minutes?

Also read the conversation context (provided above): find the most recent message timestamp `[HH:MM]` to determine how long ago the user was last active.

## Step 2: Make the holistic judgment

With the gathered context, answer: **is anything worth surfacing right now?**

Surface something if ANY of these are true:
- A calendar event starts in 60–120 minutes (prep window)
- It is past 4pm, tasks remain unchecked, and the user has been inactive for 3+ hours
- It is past 7pm and no rollover or reflection has happened today (check conversation context)
- A task has a due date of today and is not yet checked off

Schedule a silent follow-up (and output `[SKIP]`) if:
- A calendar event is 2–4 hours away (not yet in the prep window)
- Something might need attention later but not right now
- Use `mcp__scheduler__schedule_task` with a one-shot ISO 8601 datetime ~90 minutes from now and a prompt identical to this job prompt

Output `[SKIP]` with no follow-up if:
- The user was active within the last 2 hours (check the `[HH:MM]` timestamps in conversation context)
- No tasks are due today and no events are coming up
- It is before 9am or after 9pm with nothing urgent

## Step 3: Act

- If surfacing: write a brief, Telegram-friendly message (2–5 lines). Do not ask questions. Do not suggest tasks. Just surface the relevant fact.
- If scheduling a follow-up: call `mcp__scheduler__schedule_task` silently, then output `[SKIP]`.
- If nothing applies: output exactly `[SKIP]`.
```

**Step 2: Verify the job is picked up at startup**

Start the bot and check logs:

```bash
node index.js 2>&1 | head -20
```

Expected output includes: `[job] scheduled: heartbeat (0 7,9,11,13,15,17,19,21 * * *)`

**Step 3: Manually trigger a heartbeat to test end-to-end**

Temporarily change the cron to fire in 1 minute for a smoke test. Set `cron: '* * * * *'` in `jobs/heartbeat.md`, restart the bot, wait 1 minute, check logs and Telegram. Then revert to `0 7,9,11,13,15,17,19,21 * * *`.

**Step 4: Commit**

```bash
git add jobs/heartbeat.md
git commit -m "feat: add heartbeat job with holistic decision-layer prompt"
```
