# Job Scheduler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `jobs/` directory where `.md` files with YAML frontmatter define scheduled Claude tasks that run on cron schedules and optionally send output to Telegram.

**Architecture:** A new `src/job-scheduler.js` module reads all `.md` files from `jobs/`, parses their frontmatter (reusing existing `parseFrontmatter`), and schedules them with `node-cron`. When a job fires it runs `createClaudeCommandRunner` and, if `telegram: true`, sends the result to `DEFAULT_CHAT_ID` via `bot.telegram.sendMessage`.

**Tech Stack:** Node.js, `node-cron` (new), `yaml` (existing), `node:test` for tests, Telegraf bot instance.

---

### Task 1: Install node-cron

**Files:**
- Modify: `package.json` (automatically via npm)

**Step 1: Install the package**

```bash
npm install node-cron
```

**Step 2: Verify it appears in package.json dependencies**

```bash
grep node-cron package.json
```
Expected: `"node-cron": "^x.x.x"`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add node-cron dependency"
```

---

### Task 2: parseJobConfig — parse a job .md file

**Files:**
- Create: `src/job-scheduler.js`
- Create: `src/job-scheduler.test.js`

**Step 1: Write the failing test**

Create `src/job-scheduler.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobConfig } = require('./job-scheduler');

const SAMPLE_JOB_MD = `---
name: daily-summary
cron: "0 9 * * 1-5"
telegram: true
model: sonnet
---

Summarize journal entries from the past 24 hours.
`;

test('parseJobConfig extracts name, cron, telegram, model, and prompt from a job file', () => {
  const job = parseJobConfig(SAMPLE_JOB_MD);
  assert.equal(job.name, 'daily-summary');
  assert.equal(job.cron, '0 9 * * 1-5');
  assert.equal(job.telegram, true);
  assert.equal(job.model, 'sonnet');
  assert.match(job.prompt, /Summarize journal entries/);
});

test('parseJobConfig defaults telegram to false and model to haiku when omitted', () => {
  const md = `---\nname: silent-job\ncron: "*/5 * * * *"\n---\n\nDo something quietly.\n`;
  const job = parseJobConfig(md);
  assert.equal(job.telegram, false);
  assert.equal(job.model, 'haiku');
});

test('parseJobConfig throws when name is missing', () => {
  const md = `---\ncron: "0 9 * * *"\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /name/);
});

test('parseJobConfig throws when cron is missing', () => {
  const md = `---\nname: my-job\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /cron/);
});
```

**Step 2: Run the tests to verify they fail**

```bash
node --test src/job-scheduler.test.js
```
Expected: `Error: Cannot find module './job-scheduler'`

**Step 3: Implement parseJobConfig**

Create `src/job-scheduler.js`:

```js
const { parseFrontmatter } = require('./bot-config-loader');

function parseJobConfig(fileContent) {
  const { frontmatter, body } = parseFrontmatter(fileContent);

  if (!frontmatter.name) throw new Error('Job config missing required field: name');
  if (!frontmatter.cron) throw new Error('Job config missing required field: cron');

  return {
    name: String(frontmatter.name),
    cron: String(frontmatter.cron),
    telegram: frontmatter.telegram === true,
    model: frontmatter.model ? String(frontmatter.model) : 'haiku',
    prompt: body,
  };
}

module.exports = { parseJobConfig };
```

**Step 4: Run the tests to verify they pass**

```bash
node --test src/job-scheduler.test.js
```
Expected: all 4 tests pass

**Step 5: Commit**

```bash
git add src/job-scheduler.js src/job-scheduler.test.js
git commit -m "feat: add parseJobConfig for job .md files"
```

---

### Task 3: loadJobConfigs — read all job files from a directory

**Files:**
- Modify: `src/job-scheduler.js`
- Modify: `src/job-scheduler.test.js`

**Step 1: Write the failing test**

Append to `src/job-scheduler.test.js`:

```js
const { loadJobConfigs } = require('./job-scheduler');

test('loadJobConfigs returns a parsed job config for each .md file in the directory', () => {
  const files = {
    'daily-summary.md': `---\nname: daily-summary\ncron: "0 9 * * *"\ntelegram: true\n---\n\nSummarize journal.\n`,
    'silent-job.md': `---\nname: silent-job\ncron: "*/5 * * * *"\n---\n\nDo something.\n`,
  };

  const fakeReaddir = () => Object.keys(files);
  const fakeReadFile = (p) => files[require('node:path').basename(p)];

  const jobs = loadJobConfigs('/fake/jobs', {
    readdir: fakeReaddir,
    readFile: fakeReadFile,
  });

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].name, 'daily-summary');
  assert.equal(jobs[1].name, 'silent-job');
});

test('loadJobConfigs ignores non-.md files', () => {
  const fakeReaddir = () => ['job.md', 'README.txt', '.DS_Store'];
  const fakeReadFile = () => `---\nname: job\ncron: "0 * * * *"\n---\n\nPrompt.\n`;

  const jobs = loadJobConfigs('/fake/jobs', {
    readdir: fakeReaddir,
    readFile: fakeReadFile,
  });

  assert.equal(jobs.length, 1);
});

test('loadJobConfigs returns empty array when directory has no .md files', () => {
  const fakeReaddir = () => [];
  const jobs = loadJobConfigs('/fake/jobs', { readdir: fakeReaddir, readFile: () => '' });
  assert.deepEqual(jobs, []);
});
```

**Step 2: Run tests to verify new ones fail**

```bash
node --test src/job-scheduler.test.js
```
Expected: 3 new tests fail with `loadJobConfigs is not a function`

**Step 3: Implement loadJobConfigs**

Add to `src/job-scheduler.js` (above `module.exports`):

```js
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

function loadJobConfigs(jobsDir, opts = {}) {
  const readdir = opts.readdir ?? ((d) => readdirSync(d));
  const readFile = opts.readFile ?? ((p) => readFileSync(p, 'utf8'));

  const filenames = readdir(jobsDir);
  const mdFiles = filenames.filter((f) => f.endsWith('.md'));

  return mdFiles.map((filename) => {
    const content = readFile(join(jobsDir, filename));
    return parseJobConfig(content);
  });
}
```

Update `module.exports`:

```js
module.exports = { parseJobConfig, loadJobConfigs };
```

**Step 4: Run all tests to verify they pass**

```bash
node --test src/job-scheduler.test.js
```
Expected: all 7 tests pass

**Step 5: Commit**

```bash
git add src/job-scheduler.js src/job-scheduler.test.js
git commit -m "feat: add loadJobConfigs to read job files from directory"
```

---

### Task 4: scheduleJobs — schedule all jobs with node-cron

**Files:**
- Modify: `src/job-scheduler.js`
- Modify: `src/job-scheduler.test.js`

**Step 1: Write the failing tests**

Append to `src/job-scheduler.test.js`:

```js
const { scheduleJobs } = require('./job-scheduler');

function makeFakeCron() {
  const scheduled = [];
  return {
    schedule(expression, callback) {
      scheduled.push({ expression, callback });
    },
    scheduled,
  };
}

function makeFakeBot(chatId = '999') {
  const sent = [];
  return {
    chatId,
    telegram: {
      sendMessage(id, text) {
        sent.push({ id, text });
        return Promise.resolve();
      },
    },
    sent,
  };
}

test('scheduleJobs schedules one cron job per job config', () => {
  const files = {
    'job-a.md': `---\nname: job-a\ncron: "0 9 * * *"\n---\n\nDo A.\n`,
    'job-b.md': `---\nname: job-b\ncron: "0 18 * * *"\n---\n\nDo B.\n`,
  };
  const fakeCron = makeFakeCron();

  scheduleJobs(makeFakeBot(), '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => ({ output: 'done', sessionId: 'x' }),
  });

  assert.equal(fakeCron.scheduled.length, 2);
  assert.equal(fakeCron.scheduled[0].expression, '0 9 * * *');
  assert.equal(fakeCron.scheduled[1].expression, '0 18 * * *');
});

test('scheduleJobs sends output to Telegram when telegram is true', async () => {
  const files = {
    'notify-job.md': `---\nname: notify-job\ncron: "0 9 * * *"\ntelegram: true\n---\n\nDo something.\n`,
  };
  const fakeCron = makeFakeCron();
  const fakeBot = makeFakeBot('42');

  scheduleJobs(fakeBot, '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => ({ output: 'task result', sessionId: 'x' }),
    defaultChatId: '42',
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(fakeBot.sent.length, 1);
  assert.equal(fakeBot.sent[0].id, '42');
  assert.match(fakeBot.sent[0].text, /task result/);
});

test('scheduleJobs does not send to Telegram when telegram is false', async () => {
  const files = {
    'silent-job.md': `---\nname: silent-job\ncron: "0 9 * * *"\n---\n\nDo silently.\n`,
  };
  const fakeCron = makeFakeCron();
  const fakeBot = makeFakeBot('42');

  scheduleJobs(fakeBot, '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => ({ output: 'quiet result', sessionId: 'x' }),
    defaultChatId: '42',
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(fakeBot.sent.length, 0);
});

test('scheduleJobs sends error to Telegram when job fails and telegram is true', async () => {
  const files = {
    'failing-job.md': `---\nname: failing-job\ncron: "0 9 * * *"\ntelegram: true\n---\n\nDo something.\n`,
  };
  const fakeCron = makeFakeCron();
  const fakeBot = makeFakeBot('42');

  scheduleJobs(fakeBot, '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => { throw new Error('claude exploded'); },
    defaultChatId: '42',
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(fakeBot.sent.length, 1);
  assert.match(fakeBot.sent[0].text, /failing-job.*failed/i);
  assert.match(fakeBot.sent[0].text, /claude exploded/);
});
```

**Step 2: Run tests to verify new ones fail**

```bash
node --test src/job-scheduler.test.js
```
Expected: 4 new tests fail with `scheduleJobs is not a function`

**Step 3: Implement scheduleJobs**

Add to `src/job-scheduler.js` (above `module.exports`):

```js
const nodeCron = require('node-cron');
const { createClaudeCommandRunner } = require('../bot');

function scheduleJobs(bot, jobsDir, opts = {}) {
  const cron = opts.cron ?? nodeCron;
  const defaultChatId = opts.defaultChatId ?? process.env.DEFAULT_CHAT_ID;

  const jobs = loadJobConfigs(jobsDir, {
    readdir: opts.readdir,
    readFile: opts.readFile,
  });

  for (const job of jobs) {
    const runClaudeCommand = opts.runClaudeCommand ?? createClaudeCommandRunner({ model: job.model }).run;

    cron.schedule(job.cron, async () => {
      console.log(`[job] running: ${job.name}`);
      try {
        const { output } = await runClaudeCommand({ prompt: job.prompt });
        console.log(`[job] completed: ${job.name}`);
        if (job.telegram && defaultChatId) {
          await bot.telegram.sendMessage(defaultChatId, output);
        }
      } catch (error) {
        console.error(`[job] failed: ${job.name} — ${error.message}`);
        if (job.telegram && defaultChatId) {
          await bot.telegram.sendMessage(defaultChatId, `Job "${job.name}" failed: ${error.message}`);
        }
      }
    });

    console.log(`[job] scheduled: ${job.name} (${job.cron})`);
  }
}
```

Update `module.exports`:

```js
module.exports = { parseJobConfig, loadJobConfigs, scheduleJobs };
```

**Note on runClaudeCommand injection:** `createClaudeCommandRunner` returns a function directly, not an object. The opts injection in tests passes `runClaudeCommand` directly as a function. The real path uses `createClaudeCommandRunner({ model: job.model })` which also returns a function — so the real code should call:

```js
const runClaudeCommand = opts.runClaudeCommand ?? createClaudeCommandRunner({ model: job.model });
```

(No `.run` — the factory returns the runner function itself.)

**Step 4: Run all tests**

```bash
node --test src/job-scheduler.test.js
```
Expected: all 11 tests pass

**Step 5: Commit**

```bash
git add src/job-scheduler.js src/job-scheduler.test.js
git commit -m "feat: add scheduleJobs to run cron-scheduled Claude tasks"
```

---

### Task 5: Wire scheduleJobs into index.js

**Files:**
- Modify: `index.js`

**Step 1: Add the import and call**

In `index.js`, add after the existing requires at the top:

```js
const { scheduleJobs } = require('./src/job-scheduler');
```

After `bot.launch()`, add:

```js
scheduleJobs(bot, join(__dirname, 'jobs'));
```

**Step 2: Run full test suite to ensure nothing broke**

```bash
node --test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add index.js
git commit -m "feat: wire scheduleJobs into startup"
```

---

### Task 6: Create the jobs directory and an example job

**Files:**
- Create: `jobs/example.md`

**Step 1: Create the example job file**

Create `jobs/example.md`:

```markdown
---
name: example-silent-job
cron: "0 9 * * 1-5"
telegram: false
model: haiku
---

This is an example scheduled job. It runs every weekday at 9am.
Replace this prompt with your actual instructions for Claude.
```

**Step 2: Add DEFAULT_CHAT_ID to .env**

Open `.env` and add:

```
DEFAULT_CHAT_ID=<your_telegram_chat_id>
```

To find your chat ID, message your bot and check the Telegram API or use `@userinfobot`.

**Step 3: Commit**

```bash
git add jobs/example.md
git commit -m "feat: add jobs directory with example job"
```

---

## Done

The system is now live. To add a new scheduled job:

1. Create `jobs/my-job.md` with frontmatter (`name`, `cron`, optionally `telegram` and `model`)
2. Write the Claude prompt as the file body
3. Restart the app — it picks up all jobs at startup
