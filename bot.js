const { spawn } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { injectContext } = require('./src/date-context');
const { markdownToTelegramHtml } = require('./src/telegram-format');

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

const c = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m' };

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
            const content = Array.isArray(r.content) ? r.content.map(c => c.text ?? '').join('') : (r.content ?? '');
            const preview = content.slice(0, 120).replace(/\n/g, ' ');
            process.stdout.write(`${c.yellow}[result] ${preview}${content.length > 120 ? '…' : ''}${c.reset}\n`);
        }
    } else if (type === 'result') {
        const cost = event.cost_usd != null ? ` $${event.cost_usd.toFixed(4)}` : '';
        const dur = event.duration_ms != null ? ` ${(event.duration_ms / 1000).toFixed(1)}s` : '';
        process.stdout.write(`\n${c.green}[done]${cost}${dur}${c.reset}\n`);
    }
}

function createClaudeCommandRunner({
    spawnCommand = spawn,
    timeoutMs = 80000,
    model = 'haiku',
    tools = [],
    directories = [],
    systemPrompt = '',
} = {}) {
    const toolsArg = tools.join(',');

    function buildArgs({ prompt, resume = false }) {
        const args = [];
        if (!resume) {
            args.push('--model', model);
            for (const dir of directories) args.push('--add-dir', dir);
            if (systemPrompt) args.push('--system-prompt', systemPrompt);
        }
        if (tools.length) args.push('--allowed-tools', toolsArg);
        if (resume) args.push('--continue');
        args.push('--output-format', 'stream-json');
        args.push('--verbose');
        args.push('-p', prompt);
        return args;
    }

    return function runClaudeCommand({ prompt = '', resume = false } = {}) {
        const args = buildArgs({ prompt, resume });
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

            let lineBuffer = '';
            child.stdout.on('data', (chunk) => {
                const text = chunk.toString();
                stdout += text;
                lineBuffer += text;
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop(); // keep incomplete last line
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);
                        logStreamEvent(event);
                    } catch {
                        process.stdout.write(line + '\n');
                    }
                }
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

                try {
                    const lines = stdout.trim().split('\n').filter(Boolean);
                    const resultLine = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).findLast(e => e.type === 'result');
                    if (resultLine) {
                        resolve({ output: resultLine.result ?? '', sessionId: resultLine.session_id ?? '' });
                    } else {
                        resolve({ output: stdout.trim() || stderr.trim() || 'Claude command completed without output.', sessionId: '' });
                    }
                } catch {
                    resolve({ output: stdout.trim() || stderr.trim() || 'Claude command completed without output.', sessionId: '' });
                }
            });
        });
    };
}

function createCommandHandler({
    commandName,
    defaultPrompt,
    conversationStore = createClaudeConversationStore(),
    runClaudeCommand,
    botName = 'default',
    activeBotMap = new Map(),
    sessionDateMap = null,
}) {
    return async function handleCommand(ctx) {
        const chatId = String(ctx.chat?.id ?? 'global');
        const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

        console.log(`[command] /${commandName} received from user=${username} chatId=${chatId}`);

        const rawPrompt = getCommandPrompt(ctx.message?.text ?? '', commandName, defaultPrompt);

        const prompt = injectContext(rawPrompt);

        console.log(`[claude] running command prompt="${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`);

        try {
            const { output, sessionId } = await runClaudeCommand({ prompt, resume: false });
            console.log(`[claude] command succeeded sessionId=${sessionId} outputLength=${output.length}`);
            activeBotMap.set(chatId, botName);
            if (sessionDateMap) sessionDateMap.set(chatId, today);
            conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
            await ctx.reply(markdownToTelegramHtml(output), { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`[claude] command failed error=${error.message}`);
            await ctx.reply('Claude command failed: ' + error.message);
        }
    };
}

module.exports = {
    createClaudeCommandRunner,
    createClaudeConversationStore,
    createCommandHandler,
    getCommandPrompt,
};
