const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const CLAUDE_SESSION_STORE_PATH = join(__dirname, 'claude-sessions.json');
const CLAUDE_CONVERSATION_DIRECTORY_PATH = join(__dirname, 'conversations');

function getChatSessionKey(ctx, botName) {
    const chatId = String(ctx.chat?.id ?? 'global');
    return botName ? `${chatId}:${botName}` : chatId;
}

function readSessionState({ sessionFilePath, readFile = readFileSync }) {
    try {
        const fileContents = readFile(sessionFilePath, 'utf8');
        const parsedState = JSON.parse(fileContents);

        if (!parsedState || typeof parsedState !== 'object' || Array.isArray(parsedState)) {
            return {};
        }

        return parsedState;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }

        throw error;
    }
}

function writeSessionState({
    sessionFilePath,
    sessionIdsByChat,
    createDirectory = mkdirSync,
    writeFile = writeFileSync,
}) {
    createDirectory(dirname(sessionFilePath), { recursive: true });
    writeFile(
        sessionFilePath,
        JSON.stringify(Object.fromEntries(sessionIdsByChat), null, 2),
        'utf8',
    );
}

function createClaudeSessionStore({
    sessionFilePath = CLAUDE_SESSION_STORE_PATH,
    readFile = readFileSync,
    writeFile = writeFileSync,
    createDirectory = mkdirSync,
} = {}) {
    const sessionIdsByChat = new Map(
        Object.entries(readSessionState({ sessionFilePath, readFile })),
    );

    return {
        get(chatSessionKey) {
            return sessionIdsByChat.get(chatSessionKey);
        },
        set(chatSessionKey, sessionId) {
            sessionIdsByChat.set(chatSessionKey, sessionId);
            writeSessionState({
                sessionFilePath,
                sessionIdsByChat,
                createDirectory,
                writeFile,
            });
        },
        clear(chatSessionKey) {
            sessionIdsByChat.delete(chatSessionKey);
            writeSessionState({
                sessionFilePath,
                sessionIdsByChat,
                createDirectory,
                writeFile,
            });
        },
    };
}

function escapeXml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function unescapeXml(value = '') {
    return String(value)
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function getConversationFilePath({ conversationDirectoryPath, sessionId }) {
    return join(conversationDirectoryPath, `${sessionId}.xml`);
}

function readConversationEntries({ conversationFilePath, readFile = readFileSync }) {
    try {
        const xml = readFile(conversationFilePath, 'utf8');
        const entryMatches = [...xml.matchAll(/<(user|assistant)>([\s\S]*?)<\/\1>/g)];

        return entryMatches.map(([, role, content]) => ({
            content: unescapeXml(content),
            role,
        }));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }

        throw error;
    }
}

function writeConversationEntries({
    conversationDirectoryPath,
    createDirectory = mkdirSync,
    entries,
    sessionId,
    writeFile = writeFileSync,
}) {
    const conversationFilePath = getConversationFilePath({
        conversationDirectoryPath,
        sessionId,
    });
    const xml = [
        `<conversation session-id="${escapeXml(sessionId)}">`,
        ...entries.map(({ content, role }) => `  <${role}>${escapeXml(content)}</${role}>`),
        '</conversation>',
    ].join('\n');

    createDirectory(dirname(conversationFilePath), { recursive: true });
    writeFile(conversationFilePath, xml, 'utf8');
}

function createClaudeConversationStore({
    conversationDirectoryPath = CLAUDE_CONVERSATION_DIRECTORY_PATH,
    createDirectory = mkdirSync,
    readFile = readFileSync,
    writeFile = writeFileSync,
} = {}) {
    return {
        appendExchange({ assistantMessage, sessionId, userMessage }) {
            const conversationFilePath = getConversationFilePath({
                conversationDirectoryPath,
                sessionId,
            });
            const entries = readConversationEntries({
                conversationFilePath,
                readFile,
            });

            entries.push(
                { content: userMessage, role: 'user' },
                { content: assistantMessage, role: 'assistant' },
            );

            writeConversationEntries({
                conversationDirectoryPath,
                createDirectory,
                entries,
                sessionId,
                writeFile,
            });
        },
    };
}

function getCommandPrompt(text = '', commandName, defaultPrompt) {
    const match = text.match(new RegExp(`^\\/` + commandName + `(?:@\\S+)?(?:\\s+([\\s\\S]*))?$`));
    const prompt = match?.[1]?.trim();
    return prompt || defaultPrompt;
}

function createClaudeCommandRunner({
    spawnCommand = spawn,
    timeoutMs = 80000,
    model = 'haiku',
    tools = [],
    directories = [],
    systemPrompt = '',
} = {}) {
    function buildArgs({ prompt, sessionId, resume = false }) {
        const args = [];
        if (!resume) {
            args.push('--model', model);
            if (tools.length) args.push('--allowed-tools', tools.join(','));
            for (const dir of directories) args.push('--add-dir', dir);
            if (systemPrompt) args.push('--system-prompt', systemPrompt);
        }
        if (resume && tools.length) args.push('--allowed-tools', tools.join(','));
        if (sessionId) {
            args.push(resume ? '--resume' : '--session-id', sessionId);
        }
        args.push('-p', prompt);
        return args;
    }

    return function runClaudeCommand({ prompt = '', sessionId, resume = false } = {}) {
        const args = buildArgs({ prompt, sessionId, resume });
        return new Promise((resolve, reject) => {
            const child = spawnCommand('claude', args, {
                env: process.env,
                stdio: ['inherit', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            let didTimeout = false;
            const timeoutId = setTimeout(() => {
                didTimeout = true;
                child.kill('SIGTERM');
            }, timeoutMs);

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            child.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
            child.on('close', (code, signal) => {
                clearTimeout(timeoutId);

                if (didTimeout) {
                    reject(new Error(`Claude command timed out after ${timeoutMs}ms`));
                    return;
                }

                if (code !== 0) {
                    const errorMessage =
                        stderr.trim() ||
                        `Claude command exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}`;
                    reject(new Error(errorMessage));
                    return;
                }

                const output = stdout.trim() || stderr.trim();
                resolve(output || 'Claude command completed without output.');
            });
        });
    };
}

function createCommandHandler({
    commandName,
    defaultPrompt,
    conversationStore = createClaudeConversationStore(),
    runClaudeCommand,
    sessionStore = createClaudeSessionStore(),
    sessionIsolation = 'perCommand',
    createSessionId = randomUUID,
    botName = 'default',
    activeBotMap = new Map(),
}) {
    return async function handleCommand(ctx) {
        const chatSessionKey = getChatSessionKey(ctx, botName);
        const chatId = String(ctx.chat?.id ?? 'global');
        const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

        console.log(`[command] /${commandName} received from user=${username} chatId=${chatId}`);

        let sessionId;
        const existingSessionId = sessionStore.get(chatSessionKey);
        if (sessionIsolation === 'shared' && existingSessionId) {
            sessionId = existingSessionId;
            console.log(`[session] resuming existing session sessionId=${sessionId} chatSessionKey=${chatSessionKey}`);
        } else {
            sessionId = createSessionId();
            console.log(`[session] created new session sessionId=${sessionId} chatSessionKey=${chatSessionKey}`);
        }

        const resume = sessionIsolation === 'shared' && !!existingSessionId;
        const rawPrompt = getCommandPrompt(ctx.message?.text ?? '', commandName, defaultPrompt);

        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekStartStr = weekStart.toISOString().slice(0, 10);
        const jan1 = new Date(weekStart.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((weekStart - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        const prompt = `[Context: today is ${today}, current week starts ${weekStartStr}, week number ${weekNum}]\n\n${rawPrompt}`;

        console.log(`[claude] running command prompt="${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}" resume=${resume}`);

        try {
            const output = await runClaudeCommand({ prompt, sessionId, resume });
            console.log(`[claude] command succeeded sessionId=${sessionId} outputLength=${output.length}`);
            sessionStore.set(chatSessionKey, sessionId);
            activeBotMap.set(chatId, botName);
            conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
            await ctx.reply(output, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`[claude] command failed sessionId=${sessionId} error=${error.message}`);
            const failureMessage = 'Claude command failed: ' + error.message;
            conversationStore.appendExchange({ assistantMessage: failureMessage, sessionId, userMessage: prompt });
            await ctx.reply(failureMessage);
        }
    };
}

module.exports = {
    createClaudeCommandRunner,
    createClaudeConversationStore,
    createCommandHandler,
    createClaudeSessionStore,
    getChatSessionKey,
    getCommandPrompt,
};
