const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const {
  createClaudeCommandRunner,
  createClaudeConversationStore,
  createCommandHandler,
} = require('./bot');

function withTempStorage(runTest) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'telegram-bot-test-'));
  const conversationDirectoryPath = join(tempDirectory, 'conversations');
  const conversationStore = createClaudeConversationStore({ conversationDirectoryPath });

  return Promise.resolve()
    .then(() => runTest({
      conversationDirectoryPath,
      conversationStore,
    }))
    .finally(() => {
      rmSync(tempDirectory, { force: true, recursive: true });
    });
}

test('replies with Claude CLI output when the journal command is called', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const ctx = {
      reply(message) {
        replies.push(message);
        return Promise.resolve();
      },
    };
    const runClaudeCommand = async () => ({ output: 'hello from claude', sessionId: 'test-session' });

    const handleJournalCommand = createCommandHandler({
      conversationStore,
      runClaudeCommand,
      commandName: 'journal',
      defaultPrompt: 'Review my latest weekly note for insights',
      botName: 'journal',
      activeBotMap: new Map(),
    });

    await handleJournalCommand(ctx);

    assert.deepEqual(replies, ['hello from claude']);
  });
});

test('replies with a failure message when the journal Claude CLI command errors', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const ctx = {
      reply(message) {
        replies.push(message);
        return Promise.resolve();
      },
    };
    const runClaudeCommand = async () => {
      throw new Error('command failed');
    };

    const handleJournalCommand = createCommandHandler({
      conversationStore,
      runClaudeCommand,
      commandName: 'journal',
      defaultPrompt: 'Review my latest weekly note for insights',
      botName: 'journal',
      activeBotMap: new Map(),
    });

    await handleJournalCommand(ctx);

    assert.deepEqual(replies, ['Claude command failed: command failed']);
  });
});

test('starts a new Claude session when the journal command is called', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const runCalls = [];
    const ctx = {
      chat: { id: 1 },
      reply(message) {
        replies.push(message);
        return Promise.resolve();
      },
    };
    const runClaudeCommand = async (options) => {
      runCalls.push(options);
      return { output: 'hello from claude', sessionId: 'session-456' };
    };

    const handleJournalCommand = createCommandHandler({
      conversationStore,
      runClaudeCommand,
      commandName: 'journal',
      defaultPrompt: 'Review my latest weekly note for insights',
      botName: 'journal',
      activeBotMap: new Map(),
    });

    await handleJournalCommand(ctx);

    assert.equal(runCalls.length, 1);
    assert.match(runCalls[0].prompt, /^\[Context:.*\]\n\nReview my latest weekly note for insights$/s);
    assert.equal(runCalls[0].resume, false);
    assert.deepEqual(replies, ['hello from claude']);
  });
});

test('passes the journal command text to Claude as the prompt', async () => {
  await withTempStorage(async ({ conversationStore }) => {
    const replies = [];
    const runCalls = [];
    const ctx = {
      chat: { id: 1 },
      message: { text: '/journal summarize the latest note' },
      reply(message) {
        replies.push(message);
        return Promise.resolve();
      },
    };
    const runClaudeCommand = async (options) => {
      runCalls.push(options);
      return { output: 'hello from claude', sessionId: 'session-789' };
    };

    const handleJournalCommand = createCommandHandler({
      conversationStore,
      runClaudeCommand,
      commandName: 'journal',
      defaultPrompt: 'Review my latest weekly note for insights',
      botName: 'journal',
      activeBotMap: new Map(),
    });

    await handleJournalCommand(ctx);

    assert.equal(runCalls.length, 1);
    assert.match(runCalls[0].prompt, /^\[Context:.*\]\n\nsummarize the latest note$/s);
    assert.equal(runCalls[0].resume, false);
    assert.deepEqual(replies, ['hello from claude']);
  });
});

test('stores session conversations as XML in the conversations folder', async () => {
  await withTempStorage(async ({ conversationDirectoryPath, conversationStore }) => {
    const ctx = {
      chat: { id: 1 },
      message: { text: '/journal summarize <this> & that' },
      reply() {
        return Promise.resolve();
      },
    };
    const handleJournalCommand = createCommandHandler({
      conversationStore,
      runClaudeCommand: async () => ({ output: 'assistant says <ok> & "done"', sessionId: 'session-xml' }),
      commandName: 'journal',
      defaultPrompt: 'Review my latest weekly note for insights',
      botName: 'journal',
      activeBotMap: new Map(),
    });

    await handleJournalCommand(ctx);

    const transcript = readFileSync(join(conversationDirectoryPath, 'session-xml.xml'), 'utf8');

    assert.match(transcript, /^<conversation session-id="session-xml">/);
    assert.match(transcript, /summarize &lt;this&gt; &amp; that<\/user>/);
    assert.match(transcript, /^\s+<assistant>assistant says &lt;ok&gt; &amp; &quot;done&quot;<\/assistant>/m);
    assert.match(transcript, /<\/conversation>$/);
  });
});

test('runs the Claude CLI with inherited stdin and returns stdout', async () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;

  let spawnArgs;
  const spawnCommand = (command, args, options) => {
    spawnArgs = { command, args, options };

    process.nextTick(() => {
      stdout.emit('data', Buffer.from('{"type":"result","result":"hello from claude","session_id":"test-uuid"}\n'));
      child.emit('close', 0, null);
    });

    return child;
  };

  const runClaudeCommand = createClaudeCommandRunner({
    spawnCommand,
    timeoutMs: 50,
    model: 'haiku',
    tools: ['Read', 'Edit'],
    directories: ['/Users/scottquach/Documents/My Vault synced'],
  });

  const result = await runClaudeCommand({
    prompt: 'Review my latest weekly note for insights',
  });

  assert.deepEqual(result, { output: 'hello from claude', sessionId: 'test-uuid' });
  assert.equal(spawnArgs.command, 'claude');
  assert.deepEqual(spawnArgs.args, [
    '--model', 'haiku',
    '--add-dir', '/Users/scottquach/Documents/My Vault synced',
    '--allowed-tools', 'Read,Edit',
    '--output-format', 'json',
    '-p', 'Review my latest weekly note for insights',
  ]);
  assert.deepEqual(spawnArgs.options.stdio, ['inherit', 'pipe', 'pipe']);
});

test('times out the Claude CLI when it does not finish promptly', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  let killedWithSignal;
  child.kill = (signal) => {
    killedWithSignal = signal;
    process.nextTick(() => child.emit('close', null, signal));
    return true;
  };

  const runClaudeCommand = createClaudeCommandRunner({
    spawnCommand: () => child,
    timeoutMs: 10,
  });

  await assert.rejects(
    runClaudeCommand(),
    /Claude command timed out after 10ms/,
  );
  assert.equal(killedWithSignal, 'SIGTERM');
});
