// src/bot-config-loader.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const {
  parseFrontmatter,
  normalizeBotConfig,
  loadBotConfig,
  discoverBotConfigs,
  loadAllBotConfigs,
} = require('./bot-config-loader');

const SAMPLE_BOT_MD = `---
name: journal
description: Analyzes journals
model: haiku
tools:
  - Read
  - Edit
directories:
  - /some/path
commands:
  - name: journal
    description: Review notes
    defaultPrompt: Review my latest note
timeoutMs: 60000
sessionIsolation: shared
---

You are a journal assistant.
`;

test('parseFrontmatter extracts frontmatter object and body', () => {
  const { frontmatter, body } = parseFrontmatter(SAMPLE_BOT_MD);
  assert.equal(frontmatter.name, 'journal');
  assert.equal(frontmatter.model, 'haiku');
  assert.deepEqual(frontmatter.tools, ['Read', 'Edit']);
  assert.deepEqual(frontmatter.directories, ['/some/path']);
  assert.equal(frontmatter.timeoutMs, 60000);
  assert.equal(frontmatter.sessionIsolation, 'shared');
  assert.match(body, /You are a journal assistant/);
});

test('parseFrontmatter parses commands array of objects', () => {
  const { frontmatter } = parseFrontmatter(SAMPLE_BOT_MD);
  assert.deepEqual(frontmatter.commands, [{
    name: 'journal',
    description: 'Review notes',
    defaultPrompt: 'Review my latest note',
  }]);
});

test('parseFrontmatter throws when file does not start with ---', () => {
  assert.throws(() => parseFrontmatter('no frontmatter here'), /frontmatter/i);
});

test('normalizeBotConfig applies defaults', () => {
  const config = normalizeBotConfig(
    { name: 'test', model: 'haiku', commands: [{ name: 'test', description: '', defaultPrompt: 'hello' }] },
    'system prompt',
    '/bots/test'
  );
  assert.equal(config.timeoutMs, 80000);
  assert.equal(config.sessionIsolation, 'perCommand');
  assert.deepEqual(config.tools, []);
  assert.deepEqual(config.directories, []);
  assert.equal(config.systemPrompt, 'system prompt');
  assert.equal(config.configDir, '/bots/test');
});

test('normalizeBotConfig throws when name is missing', () => {
  assert.throws(
    () => normalizeBotConfig({ model: 'haiku', commands: [{ name: 'x', description: '', defaultPrompt: 'y' }] }, '', '/'),
    /name/i
  );
});

test('normalizeBotConfig throws when model is missing', () => {
  assert.throws(
    () => normalizeBotConfig({ name: 'x', commands: [{ name: 'x', description: '', defaultPrompt: 'y' }] }, '', '/'),
    /model/i
  );
});

test('normalizeBotConfig throws when commands is empty', () => {
  assert.throws(
    () => normalizeBotConfig({ name: 'x', model: 'haiku', commands: [] }, '', '/'),
    /commands/i
  );
});

test('loadBotConfig reads BOT.md and returns BotConfig', () => {
  const readFile = (p) => {
    if (p.endsWith('BOT.md')) return SAMPLE_BOT_MD;
    throw Object.assign(new Error('not found'), { code: 'ENOENT' });
  };
  const readdirSync = () => ['BOT.md'];
  const config = loadBotConfig('/bots/journal/BOT.md', { readFile, readdirSync });
  assert.equal(config.name, 'journal');
  assert.equal(config.model, 'haiku');
  assert.equal(config.configDir, '/bots/journal');
});

test('loadBotConfig appends supplementary .md files alphabetically', () => {
  const files = { 'BOT.md': SAMPLE_BOT_MD, 'extra.md': 'Extra context here.' };
  const readFile = (p) => {
    const base = p.split('/').pop();
    if (files[base]) return files[base];
    throw Object.assign(new Error(), { code: 'ENOENT' });
  };
  const readdirSync = () => ['BOT.md', 'extra.md'];
  const config = loadBotConfig('/bots/journal/BOT.md', { readFile, readdirSync });
  assert.match(config.systemPrompt, /You are a journal assistant/);
  assert.match(config.systemPrompt, /Extra context here/);
});

test('loadBotConfig works when no supplementary files exist', () => {
  const readFile = (p) => {
    if (p.endsWith('BOT.md')) return SAMPLE_BOT_MD;
    throw Object.assign(new Error(), { code: 'ENOENT' });
  };
  const readdirSync = () => ['BOT.md'];
  const config = loadBotConfig('/bots/journal/BOT.md', { readFile, readdirSync });
  assert.match(config.systemPrompt, /You are a journal assistant/);
});

test('discoverBotConfigs finds BOT.md files recursively', () => {
  const structure = {
    '/bots': [{ name: 'journal', isDirectory: () => true }],
    '/bots/journal': [{ name: 'BOT.md', isDirectory: () => false }],
  };
  const readdirSync = (dir, opts) => structure[dir] ?? [];
  const paths = discoverBotConfigs('/bots', { readdirSync });
  assert.deepEqual(paths, ['/bots/journal/BOT.md']);
});

test('discoverBotConfigs returns empty array for empty directory', () => {
  const readdirSync = () => [];
  const paths = discoverBotConfigs('/bots', { readdirSync });
  assert.deepEqual(paths, []);
});

test('loadAllBotConfigs throws when two bots share the same name', () => {
  // Create two BOT.md files with same name - should throw with both paths listed
  const botMd = `---\nname: dup\nmodel: haiku\ncommands:\n  - name: dup\n    description: x\n    defaultPrompt: x\n---\nPrompt.`;
  const readFile = () => botMd;
  const readdirSync = (dir, opts) => {
    if (dir === '/bots') return [
      { name: 'a', isDirectory: () => true },
      { name: 'b', isDirectory: () => true },
    ];
    return [{ name: 'BOT.md', isDirectory: () => false }];
  };
  assert.throws(
    () => loadAllBotConfigs('/bots', { readFile, readdirSync }),
    /dup/i
  );
});
