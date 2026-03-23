const { query } = require('@anthropic-ai/claude-agent-sdk');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const CLAUDE_CONVERSATION_DIRECTORY_PATH = join(__dirname, 'conversations');

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

            entries.push({ content: userMessage, role: 'user' }, { content: assistantMessage, role: 'assistant' });

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

const c = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    magenta: '\x1b[35m',
};

function logStreamEvent(event) {
    const type = event.type;
    if (type === 'system') return; // skip init noise

    if (type === 'assistant') {
        const blocks = event.message?.content ?? [];
        for (const block of blocks) {
            if (block.type === 'text' && block.text) {
                process.stdout.write(`${c.reset}${block.text}`);
            } else if (block.type === 'thinking' && block.thinking) {
                process.stdout.write(`${c.dim}[thinking] ${block.thinking}${c.reset}\n`);
            } else if (block.type === 'tool_use') {
                const input = JSON.stringify(block.input ?? {});
                process.stdout.write(`${c.cyan}[tool] ${block.name}(${input})${c.reset}\n`);
            }
        }
    } else if (type === 'tool_result' || (type === 'user' && event.message?.content?.[0]?.type === 'tool_result')) {
        const results = type === 'tool_result' ? [event] : event.message.content;
        for (const r of results) {
            const content = Array.isArray(r.content) ? r.content.map((c) => c.text ?? '').join('') : (r.content ?? '');
            const preview = content.slice(0, 120).replace(/\n/g, ' ');
            process.stdout.write(`${c.yellow}[result] ${preview}${content.length > 120 ? '…' : ''}${c.reset}\n`);
        }
    } else if (type === 'result') {
        const cost = event.total_cost_usd != null ? ` $${event.total_cost_usd.toFixed(4)}` : '';
        const dur = event.duration_ms != null ? ` ${(event.duration_ms / 1000).toFixed(1)}s` : '';
        process.stdout.write(`\n${c.green}[done]${cost}${dur}${c.reset}\n`);
    }
}

function createClaudeCommandRunner({ model = 'haiku', tools = [], directories = [], systemPrompt = '' } = {}) {
    return async function runClaudeCommand({ prompt = '', sessionId = null } = {}) {
        let newSessionId = sessionId;
        let result = null;

        console.log("directories", directories);
        console.log("claude path", process.env.CLAUDE_PATH ?? 'claude');

        const options = {
            pathToClaudeCodeExecutable: process.env.CLAUDE_PATH ?? 'claude',
            env: process.env,
            cwd: directories[0],
            additionalDirectories: directories.slice(1),
            allowedTools: tools,
            model,
            systemPrompt: systemPrompt || undefined,
            permissionMode: 'acceptEdits',
            allowDangerouslySkipPermissions: false,
            includePartialMessages: true,
            ...(sessionId ? { resume: sessionId } : {}),
        };

        for await (const message of query({ prompt, options })) {
            logStreamEvent(message);
            if (message.type === 'system' && message.subtype === 'init') {
                newSessionId = message.session_id;
            }
            if (message.type === 'result') {
                if (message.subtype === 'success') {
                    result = message.result ?? '';
                } else {
                    throw new Error(message.errors?.join('; ') ?? `Claude ended with subtype: ${message.subtype}`);
                }
            }
        }

        return { output: result ?? '', sessionId: newSessionId ?? '' };
    };
}

module.exports = {
    createClaudeCommandRunner,
    createClaudeConversationStore,
};
