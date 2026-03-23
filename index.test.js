const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { createClaudeConversationStore } = require('./bot');

function withTempStorage(runTest) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'telegram-bot-test-'));
  const conversationDirectoryPath = join(tempDirectory, 'conversations');
  const conversationStore = createClaudeConversationStore({ conversationDirectoryPath });

  return Promise.resolve()
    .then(() => runTest({ conversationDirectoryPath, conversationStore }))
    .finally(() => {
      rmSync(tempDirectory, { force: true, recursive: true });
    });
}

test('conversation store writes XML with escaped content', async () => {
  await withTempStorage(async ({ conversationDirectoryPath, conversationStore }) => {
    conversationStore.appendExchange({
      userMessage: 'summarize <this> & that',
      assistantMessage: 'assistant says <ok> & "done"',
      sessionId: 'session-xml',
    });

    const transcript = readFileSync(join(conversationDirectoryPath, 'session-xml.xml'), 'utf8');
    assert.match(transcript, /^<conversation session-id="session-xml">/);
    assert.match(transcript, /summarize &lt;this&gt; &amp; that<\/user>/);
    assert.match(transcript, /assistant says &lt;ok&gt; &amp; &quot;done&quot;<\/assistant>/);
    assert.match(transcript, /<\/conversation>$/);
  });
});

test('conversation store appends multiple exchanges', async () => {
  await withTempStorage(async ({ conversationDirectoryPath, conversationStore }) => {
    conversationStore.appendExchange({
      userMessage: 'first message',
      assistantMessage: 'first reply',
      sessionId: 'multi-session',
    });
    conversationStore.appendExchange({
      userMessage: 'second message',
      assistantMessage: 'second reply',
      sessionId: 'multi-session',
    });

    const transcript = readFileSync(join(conversationDirectoryPath, 'multi-session.xml'), 'utf8');
    assert.match(transcript, /first message/);
    assert.match(transcript, /first reply/);
    assert.match(transcript, /second message/);
    assert.match(transcript, /second reply/);
  });
});
