const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseJobConfig } = require('./job-scheduler');

const SAMPLE_JOB_MD = `---
name: daily-summary
cron: "0 9 * * 1-5"
telegram: true
---

Summarize journal entries from the past 24 hours.
`;

test('parseJobConfig extracts name, cron, telegram, and prompt from a job file', () => {
  const job = parseJobConfig(SAMPLE_JOB_MD);
  assert.equal(job.name, 'daily-summary');
  assert.equal(job.cron, '0 9 * * 1-5');
  assert.equal(job.telegram, true);
  assert.match(job.prompt, /Summarize journal entries/);
});

test('parseJobConfig defaults telegram to false when omitted', () => {
  const md = `---\nname: silent-job\ncron: "*/5 * * * *"\n---\n\nDo something quietly.\n`;
  const job = parseJobConfig(md);
  assert.equal(job.telegram, false);
});

test('parseJobConfig throws when name is missing', () => {
  const md = `---\ncron: "0 9 * * *"\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /name/);
});

test('parseJobConfig throws when cron is missing', () => {
  const md = `---\nname: my-job\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /cron/);
});

test('parseJobConfig throws when cron expression is invalid', () => {
  const md = `---\nname: bad-job\ncron: "0 9 * *"\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /invalid cron/);
});

test('weekly reflection is scheduled for Sunday morning', () => {
  const weeklyReflection = readFileSync(
    join(__dirname, '..', 'jobs', 'weekly-reflection.md'),
    'utf8',
  );

  const job = parseJobConfig(weeklyReflection);

  assert.equal(job.cron, '0 8 * * 0');
});

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

test('scheduleJobs throws when runClaudeCommand is not provided', () => {
  const fakeCron = makeFakeCron();
  assert.throws(
    () => scheduleJobs(makeFakeBot(), '/fake/jobs', {
      cron: fakeCron,
      readdir: () => [],
      readFile: () => '',
    }),
    /runClaudeCommand/
  );
});

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
    runClaudeCommand: async () => ({ output: 'done' }),
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
    runClaudeCommand: async () => ({ output: 'task result' }),
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
    runClaudeCommand: async () => ({ output: 'quiet result' }),
    defaultChatId: '42',
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(fakeBot.sent.length, 0);
});

test('scheduleJobs does not send to Telegram when output starts with [SKIP]', async () => {
  const files = {
    'skip-job.md': `---\nname: skip-job\ncron: "0 9 * * *"\ntelegram: true\n---\n\nDo something.\n`,
  };
  const fakeCron = makeFakeCron();
  const fakeBot = makeFakeBot('42');

  scheduleJobs(fakeBot, '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => ({ output: '[SKIP]' }),
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

test('scheduleJobs uses conversation store prompt context and appends job exchange', async () => {
  const files = {
    'context-job.md': `---\nname: context-job\ncron: "0 9 * * *"\ntelegram: false\n---\n\nDo something.\n`,
  };
  const fakeCron = makeFakeCron();
  const fakeBot = makeFakeBot('42');
  const calls = [];
  const fakeStore = {
    buildPrompt({ chatId, currentInput }) {
      calls.push({ type: 'buildPrompt', chatId, currentInput });
      return `context:\n${currentInput}`;
    },
    appendTurn(payload) {
      calls.push({ type: 'appendTurn', payload });
    },
  };

  scheduleJobs(fakeBot, '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async ({ prompt }) => {
      calls.push({ type: 'runClaudeCommand', prompt });
      return { output: 'job output' };
    },
    defaultChatId: '42',
    conversationStore: fakeStore,
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(calls[0].type, 'buildPrompt');
  assert.equal(calls[0].chatId, '42');
  assert.match(calls[1].prompt, /^context:/);
  assert.equal(calls[2].type, 'appendTurn');
  assert.equal(calls[2].payload.chatId, '42');
  assert.equal(calls[2].payload.source, 'job:context-job');
  assert.equal(calls[2].payload.assistantMessage, 'job output');
});

test('scheduleJobs does not append skipped output to conversation store', async () => {
  const files = {
    'skip-job.md': `---\nname: skip-job\ncron: "0 9 * * *"\ntelegram: false\n---\n\nDo something.\n`,
  };
  const fakeCron = makeFakeCron();
  let appended = false;
  const fakeStore = {
    buildPrompt({ currentInput }) {
      return currentInput;
    },
    appendTurn() {
      appended = true;
    },
  };

  scheduleJobs(makeFakeBot('42'), '/fake/jobs', {
    cron: fakeCron,
    readdir: () => Object.keys(files),
    readFile: (p) => files[require('node:path').basename(p)],
    runClaudeCommand: async () => ({ output: '[SKIP]' }),
    defaultChatId: '42',
    conversationStore: fakeStore,
  });

  await fakeCron.scheduled[0].callback();

  assert.equal(appended, false);
});
