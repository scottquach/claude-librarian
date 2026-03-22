// src/bot-factory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createClaudeConversationStore } = require('../bot');
const { computeDateContext } = require('./date-context');

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
      sessionIdMap: new Map(),
      createRunner: () => async () => ({ output: 'journal output', sessionId: 'test-session' }),
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
    registerBot(fakeBot, JOURNAL_CONFIG, {
      conversationStore,
      activeBotMap,
      sessionIdMap: new Map(),
      createRunner: () => async () => ({ output: 'ok', sessionId: 'test-session' }),
    });

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
    const { today } = computeDateContext();
    const sessionDateMap = new Map([['42', today]]);

    const { createMultiBotTextMessageHandler } = require('./bot-factory');
    const botRunnerMap = new Map();
    botRunnerMap.set('journal', async () => ({ output: 'resumed response', sessionId: 'test-session' }));

    const handler = createMultiBotTextMessageHandler({
      activeBotMap, sessionDateMap, botRunnerMap, conversationStore,
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
      sessionDateMap: new Map(),
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
