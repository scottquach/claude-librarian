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

test('parseJobConfig throws when cron expression is invalid', () => {
  const md = `---\nname: bad-job\ncron: "0 9 * *"\n---\n\nPrompt.\n`;
  assert.throws(() => parseJobConfig(md), /invalid cron/);
});
