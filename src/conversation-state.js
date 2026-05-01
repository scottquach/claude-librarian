const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { buildContextString, computeDateContext } = require('./date-context');

const CONVERSATION_STATE_VERSION = 1;
const DEFAULT_MAX_MESSAGES = 40;
const DEFAULT_CONTEXT_WINDOW = 10;
const DEFAULT_CONVERSATION_DIRECTORY_PATH = join(__dirname, '..', 'conversations', 'chats');

function toSafeFileName(chatId) {
    return encodeURIComponent(String(chatId));
}

function getConversationStatePath({ chatId, conversationDirectoryPath }) {
    return join(conversationDirectoryPath, `${toSafeFileName(chatId)}.json`);
}

function createDefaultState(chatId) {
    return {
        chatId: String(chatId),
        messages: [],
        summary: '',
        updatedAt: new Date().toISOString(),
        version: CONVERSATION_STATE_VERSION,
    };
}

function normalizeMessage(message) {
    if (!message || typeof message !== 'object') return null;
    if (message.role !== 'user' && message.role !== 'assistant') return null;
    if (typeof message.content !== 'string') return null;

    return {
        content: message.content,
        createdAt: typeof message.createdAt === 'string' ? message.createdAt : new Date().toISOString(),
        role: message.role,
        source: typeof message.source === 'string' ? message.source : 'unknown',
    };
}

function normalizeState(chatId, raw) {
    const fallback = createDefaultState(chatId);
    if (!raw || typeof raw !== 'object') return fallback;

    const messages = Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage).filter(Boolean) : [];
    const summary = typeof raw.summary === 'string' ? raw.summary : '';

    return {
        chatId: typeof raw.chatId === 'string' ? raw.chatId : String(chatId),
        messages,
        summary,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
        version: CONVERSATION_STATE_VERSION,
    };
}

function trimMessages(messages, maxMessages = DEFAULT_MAX_MESSAGES) {
    if (!Array.isArray(messages)) return [];
    if (messages.length <= maxMessages) return messages;
    return messages.slice(messages.length - maxMessages);
}

function formatRecentMessages(messages) {
    if (messages.length === 0) return '- (none)';
    return messages
        .map((message) => {
            const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User';
            const time = message.createdAt
                ? new Date(message.createdAt).toISOString().slice(11, 16)
                : '--:--';
            return `- [${time}] ${roleLabel}: ${message.content}`;
        })
        .join('\n');
}

function buildContextBlock(state, { contextWindow = DEFAULT_CONTEXT_WINDOW } = {}) {
    const recentMessages = trimMessages(state.messages, contextWindow);
    const summary = state.summary.trim().length > 0 ? state.summary.trim() : '(none)';

    return [
        '[Stored conversation context]',
        `Summary: ${summary}`,
        'Recent messages:',
        formatRecentMessages(recentMessages),
        '[/Stored conversation context]',
    ].join('\n');
}

function createConversationStateStore({
    conversationDirectoryPath = DEFAULT_CONVERSATION_DIRECTORY_PATH,
    maxMessages = DEFAULT_MAX_MESSAGES,
    readFile = readFileSync,
    writeFile = writeFileSync,
    renameFile = renameSync,
    createDirectory = mkdirSync,
} = {}) {
    function load(chatId) {
        const statePath = getConversationStatePath({ chatId, conversationDirectoryPath });
        try {
            const rawText = readFile(statePath, 'utf8');
            const parsed = JSON.parse(rawText);
            return normalizeState(chatId, parsed);
        } catch (error) {
            if (error.code === 'ENOENT') return createDefaultState(chatId);
            if (error instanceof SyntaxError) return createDefaultState(chatId);
            throw error;
        }
    }

    function save(state) {
        const chatId = state.chatId;
        const statePath = getConversationStatePath({ chatId, conversationDirectoryPath });
        const tempPath = `${statePath}.tmp`;
        const normalized = normalizeState(chatId, state);
        const nextState = {
            ...normalized,
            messages: trimMessages(normalized.messages, maxMessages),
            updatedAt: new Date().toISOString(),
        };

        createDirectory(dirname(statePath), { recursive: true });
        writeFile(tempPath, JSON.stringify(nextState, null, 2), 'utf8');
        renameFile(tempPath, statePath);
        return nextState;
    }

    function appendTurn({ assistantMessage, chatId, source = 'unknown', userMessage }) {
        const state = load(chatId);
        state.messages.push(
            { content: userMessage, createdAt: new Date().toISOString(), role: 'user', source },
            { content: assistantMessage, createdAt: new Date().toISOString(), role: 'assistant', source },
        );
        return save(state);
    }

    function buildPrompt({ chatId, currentInput, contextWindow = DEFAULT_CONTEXT_WINDOW }) {
        const state = load(chatId);
        const contextBlock = buildContextBlock(state, { contextWindow });

        const { today, weekNum, year } = computeDateContext();
        const weekNumPadded = String(weekNum).padStart(2, '0');
        const dateContext = buildContextString({
            day_header: `## [[${today}]]`,
            weekly_note: `Journal/${year}-W${weekNumPadded}.md`,
            monthly_note: `Journal/${today.slice(0, 7)}.md`,
        });

        return `${dateContext}\n\n${contextBlock}\n\nCurrent input:\n${currentInput}`;
    }

    function replaceWithCompaction({ chatId, messages = [], summary = '' }) {
        const state = load(chatId);
        state.summary = summary;
        state.messages = trimMessages(messages.map(normalizeMessage).filter(Boolean), maxMessages);
        return save(state);
    }

    return {
        appendTurn,
        buildPrompt,
        load,
        replaceWithCompaction,
        save,
        trimMessages,
    };
}

module.exports = {
    CONVERSATION_STATE_VERSION,
    DEFAULT_CONTEXT_WINDOW,
    DEFAULT_MAX_MESSAGES,
    createConversationStateStore,
    createDefaultState,
    trimMessages,
};
