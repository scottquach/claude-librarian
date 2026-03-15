// src/bot-factory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createClaudeSessionStore, createClaudeConversationStore } = require('../bot');
function withTempStorage(runTest) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'bot-factory-test-'));
  const sessionFilePath = join(tempDirectory, 'sessions.json');
  const conversationDirectoryPath = join(tempDirectory, 'conversations');
  const sessionStore = createClaudeSessionStore({ sessionFilePath });
  const conversationStore = createClaudeConversationStore({ conversationDirectoryPath });
  return Promise.resolve()
    .then(() => runTest({ sessionStore, conversationStore, tempDirectory }))
    .finally(() => rmSync(tempDirectory, { force: true, recursive: true }));
}

const JOURNAL_CONFIG = {
  name: 'journal',
  description: 'Journal bot',
  model: 'haiku',
  tools: ['Read', 'Edit'],
  directories: ['/some/path'],
  commands: [{ name: 'journal', description: 'Review notes', defaultPrompt: 'Review my notes' }],
  timeoutMs: 80000,
  sessionIsolation: 'perCommand',
  systemPrompt: 'You are a journal assistant.',
  configDir: '/bots/journal',
};

test('registerBot registers command name on Telegraf bot', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    const registeredCommands = [];
    const fakeBot = { command: (name, handler) => registeredCommands.push(name) };

    const { registerBot } = require('./bot-factory');
    registerBot(fakeBot, JOURNAL_CONFIG, { sessionStore, conversationStore, activeBotMap: new Map() });

    assert.ok(registeredCommands.includes('journal'));
  });
});

test('command handler replies with Claude output', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    const replies = [];
    const fakeBot = { command: (name, handler) => handler(ctx) };
    const ctx = {
      chat: { id: 42 },
      message: { text: '/journal' },
      reply: (msg) => { replies.push(msg); return Promise.resolve(); },
    };

    const spawnCommand = () => {
      const { EventEmitter } = require('node:events');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('journal output\n'));
        child.emit('close', 0, null);
      });
      return child;
    };

    const { registerBot } = require('./bot-factory');
    await registerBot(fakeBot, JOURNAL_CONFIG, {
      sessionStore,
      conversationStore,
      activeBotMap: new Map(),
      spawnCommand,
    });

    assert.deepEqual(replies, ['journal output']);
  });
});

test('command handler updates activeBotMap on success', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    const activeBotMap = new Map();
    let capturedHandler;
    const fakeBot = { command: (name, handler) => { capturedHandler = handler; } };

    const spawnCommand = () => {
      const { EventEmitter } = require('node:events');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('ok\n'));
        child.emit('close', 0, null);
      });
      return child;
    };

    const { registerBot } = require('./bot-factory');
    registerBot(fakeBot, JOURNAL_CONFIG, { sessionStore, conversationStore, activeBotMap, spawnCommand });

    await capturedHandler({
      chat: { id: 42 },
      message: { text: '/journal' },
      reply: () => Promise.resolve(),
    });

    assert.equal(activeBotMap.get('42'), 'journal');
  });
});

test('text message routes to active bot session', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    const replies = [];
    const activeBotMap = new Map();
    activeBotMap.set('42', 'journal');
    sessionStore.set('42:journal', 'session-abc');

    const spawnCommand = () => {
      const { EventEmitter } = require('node:events');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('resumed response\n'));
        child.emit('close', 0, null);
      });
      return child;
    };

    const { createMultiBotTextMessageHandler } = require('./bot-factory');
    const botRunnerMap = new Map();
    const { createClaudeCommandRunner } = require('../bot');
    botRunnerMap.set('journal', createClaudeCommandRunner({
      ...JOURNAL_CONFIG,
      spawnCommand,
    }));

    const handler = createMultiBotTextMessageHandler({
      activeBotMap, botRunnerMap, conversationStore, sessionStore,
    });

    await handler({
      chat: { id: 42 },
      message: { text: 'tell me more' },
      reply: (msg) => { replies.push(msg); return Promise.resolve(); },
    });

    assert.deepEqual(replies, ['resumed response']);
  });
});

test('text message echoes when no active bot', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    const replies = [];
    const { createMultiBotTextMessageHandler } = require('./bot-factory');
    const handler = createMultiBotTextMessageHandler({
      activeBotMap: new Map(),
      botRunnerMap: new Map(),
      conversationStore,
      sessionStore,
    });

    await handler({
      chat: { id: 99 },
      message: { text: 'hello' },
      reply: (msg) => { replies.push(msg); return Promise.resolve(); },
    });

    assert.deepEqual(replies, ['You said: hello']);
  });
});

test('createBotFromDirectory calls loadAllBotConfigs with botsDir', async () => {
  await withTempStorage(async ({ sessionStore, conversationStore }) => {
    let calledWith;
    const loadAllBotConfigs = (dir) => { calledWith = dir; return []; };
    const fakeBot = {
      command: () => {},
      on: () => {},
      start: () => {},
      help: () => {},
    };

    const { createBotFromDirectory } = require('./bot-factory');
    createBotFromDirectory(fakeBot, '/bots', { loadAllBotConfigs, sessionStore, conversationStore });

    assert.equal(calledWith, '/bots');
  });
});
