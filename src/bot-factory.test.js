// src/bot-factory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { EventEmitter } = require('node:events');
const { createClaudeConversationStore } = require('../bot');

function withTempStorage(runTest) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'bot-factory-test-'));
  const conversationDirectoryPath = join(tempDirectory, 'conversations');
  const conversationStore = createClaudeConversationStore({ conversationDirectoryPath });
  return Promise.resolve()
    .then(() => runTest({ conversationStore, tempDirectory }))
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
  systemPrompt: 'You are a journal assistant.',
  configDir: '/bots/journal',
};

function makeSpawnCommand(responseText) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => {
      child.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'result', result: responseText, session_id: 'test-session' }) + '\n'));
      child.emit('close', 0, null);
    });
    return child;
  };
}

test('registerBot registers command name on Telegraf bot', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const registeredCommands = [];
    const fakeBot = { command: (name) => registeredCommands.push(name) };

    const { registerBot } = require('./bot-factory');
    registerBot(fakeBot, JOURNAL_CONFIG, { conversationStore, activeBotMap: new Map() });

    assert.ok(registeredCommands.includes('journal'));
  });
});

test('command handler replies with Claude output', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const capturedHandlers = [];
    const fakeBot = { command: (name, handler) => capturedHandlers.push(handler) };
    const ctx = {
      chat: { id: 42 },
      message: { text: '/journal' },
      reply: (msg) => { replies.push(msg); return Promise.resolve(); },
    };

    const { registerBot } = require('./bot-factory');
    registerBot(fakeBot, JOURNAL_CONFIG, {
      conversationStore,
      activeBotMap: new Map(),
      spawnCommand: makeSpawnCommand('journal output'),
    });

    for (const handler of capturedHandlers) await handler(ctx);

    assert.deepEqual(replies, ['journal output']);
  });
});

test('command handler updates activeBotMap on success', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const activeBotMap = new Map();
    let capturedHandler;
    const fakeBot = { command: (name, handler) => { capturedHandler = handler; } };

    const { registerBot } = require('./bot-factory');
    registerBot(fakeBot, JOURNAL_CONFIG, { conversationStore, activeBotMap, spawnCommand: makeSpawnCommand('ok') });

    await capturedHandler({
      chat: { id: 42 },
      message: { text: '/journal' },
      reply: () => Promise.resolve(),
    });

    assert.equal(activeBotMap.get('42'), 'journal');
  });
});

test('text message routes to active bot session', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const activeBotMap = new Map();
    activeBotMap.set('42', 'journal');

    const { createMultiBotTextMessageHandler } = require('./bot-factory');
    const botRunnerMap = new Map();
    const { createClaudeCommandRunner } = require('../bot');
    botRunnerMap.set('journal', createClaudeCommandRunner({
      ...JOURNAL_CONFIG,
      spawnCommand: makeSpawnCommand('resumed response'),
    }));

    const handler = createMultiBotTextMessageHandler({
      activeBotMap, botRunnerMap, conversationStore,
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
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const { createMultiBotTextMessageHandler } = require('./bot-factory');
    const handler = createMultiBotTextMessageHandler({
      activeBotMap: new Map(),
      botRunnerMap: new Map(),
      conversationStore,
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
  await withTempStorage(async ({ conversationStore }) => {
    let calledWith;
    const loadAllBotConfigs = (dir) => { calledWith = dir; return []; };
    const fakeBot = {
      command: () => {},
      on: () => {},
      start: () => {},
      help: () => {},
    };

    const { createBotFromDirectory } = require('./bot-factory');
    createBotFromDirectory(fakeBot, '/bots', { loadAllBotConfigs, conversationStore });

    assert.equal(calledWith, '/bots');
  });
});
