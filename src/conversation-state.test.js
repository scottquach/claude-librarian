const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationStateStore, createDefaultState } = require('./conversation-state');

test('formatRecentMessages via buildPrompt includes HH:MM timestamps in formatted messages', () => {
    const store = createConversationStateStore({
        conversationDirectoryPath: require('node:os').tmpdir(),
    });

    const createdAt = '2026-05-01T14:30:00.000Z';
    const state = {
        ...createDefaultState('test-chat'),
        messages: [
            { role: 'user', content: 'hello', source: 'user', createdAt },
            { role: 'assistant', content: 'hi there', source: 'user', createdAt },
        ],
    };

    store.save(state);
    const prompt = store.buildPrompt({ chatId: 'test-chat', currentInput: 'ping' });

    assert.match(prompt, /\[\d{2}:\d{2}\]/);
});
