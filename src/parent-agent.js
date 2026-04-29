const { query } = require('@anthropic-ai/claude-agent-sdk');
const { execFile } = require('node:child_process');

const defaultTools = ['WebSearch'];

const c = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
};

function logStreamEvent(event) {
    const type = event.type;
    if (type === 'system') return;

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
        for (const result of results) {
            const content = Array.isArray(result.content)
                ? result.content.map((item) => item.text ?? '').join('')
                : (result.content ?? '');
            const preview = content.slice(0, 120).replace(/\n/g, ' ');
            process.stdout.write(`${c.yellow}[result] ${preview}${content.length > 120 ? '…' : ''}${c.reset}\n`);
        }
    } else if (type === 'result') {
        const cost = event.total_cost_usd != null ? ` $${event.total_cost_usd.toFixed(4)}` : '';
        const duration = event.duration_ms != null ? ` ${(event.duration_ms / 1000).toFixed(1)}s` : '';
        process.stdout.write(`\n${c.green}[done]${cost}${duration}${c.reset}\n`);
    }
}

function buildInvocationPrompt({ prompt = '', source = 'unknown', jobName, chatId }) {
    const lines = [
        '[Invocation metadata]',
        `source: ${source}`,
    ];

    if (jobName) lines.push(`job_name: ${jobName}`);
    if (chatId) lines.push(`chat_id: ${chatId}`);

    lines.push('[/Invocation metadata]', '', prompt);
    return lines.join('\n');
}

function withDefaultTools(tools = []) {
    return [...new Set([...defaultTools, ...tools])];
}

function createSubagentDefinitions(registry, mcpServers = {}) {
    const forwardedMcpServers = Object.entries(mcpServers)
        .filter(([, config]) => config.type !== 'sdk')
        .map(([name, config]) => ({ [name]: config }));

    return Object.fromEntries(
        registry.childAgents.map((agent) => [
            agent.id,
            {
                description: agent.description,
                model: agent.model,
                prompt: agent.systemPrompt,
                tools: withDefaultTools(agent.tools),
                ...(forwardedMcpServers.length > 0 ? { mcpServers: forwardedMcpServers } : {}),
            },
        ]),
    );
}

function createParentOptions({ registry, mcpServers } = {}) {
    const parent = registry.parent;
    const allowedTools = [
        ...new Set([
            ...withDefaultTools(parent.tools ?? []),
            'Agent',
            ...registry.childAgents.flatMap((agent) => withDefaultTools(agent.tools ?? [])),
        ]),
    ];

    return {
        pathToClaudeCodeExecutable: process.env.CLAUDE_PATH ?? 'claude',
        env: process.env,
        cwd: registry.directories[0],
        additionalDirectories: registry.directories.slice(1),
        agents: createSubagentDefinitions(registry, mcpServers),
        allowedTools,
        allowDangerouslySkipPermissions: false,
        includePartialMessages: true,
        mcpServers: mcpServers || undefined,
        model: parent.model,
        permissionMode: 'acceptEdits',
        systemPrompt: parent.systemPrompt || undefined,
    };
}

function collectDelegatedAgents(event, delegatedAgents) {
    const blocks = event.message?.content ?? [];
    for (const block of blocks) {
        if (block.type !== 'tool_use' || block.name !== 'Agent') continue;
        const agentId = block.input?.subagent_type ?? block.input?.agent ?? block.input?.name;
        if (agentId) delegatedAgents.add(agentId);
    }
}

function checkClaudeExecutable(claudePath) {
    return new Promise((resolve) => {
        execFile(claudePath, ['--version'], { timeout: 5000 }, (err, stdout, stderr) => {
            if (err) {
                console.error(`[claude] preflight check failed for "${claudePath}":`, err.message);
                if (stderr) console.error('[claude] preflight stderr:', stderr);
            } else {
                console.log(`[claude] preflight ok: ${stdout.trim()}`);
            }
            resolve();
        });
    });
}

function createParentAgentRunner({ registry, mcpServers, queryFn = query } = {}) {
    const options = createParentOptions({ registry, mcpServers });
    checkClaudeExecutable(options.pathToClaudeCodeExecutable ?? 'claude');

    return async function runParentAgent({ prompt = '', source, jobName, chatId } = {}) {
        const delegatedAgents = new Set();
        const finalPrompt = buildInvocationPrompt({ chatId, jobName, prompt, source });
        let result = null;

        for await (const message of queryFn({ prompt: finalPrompt, options })) {
            logStreamEvent(message);
            if (message.type === 'assistant') {
                collectDelegatedAgents(message, delegatedAgents);
            }
            if (message.type === 'result') {
                if (message.subtype === 'success') {
                    result = message.result ?? '';
                    continue;
                }

                const errorMsg = message.errors?.join('; ') ?? `Claude ended with subtype: ${message.subtype}`;
                console.error('[claude] result event failure:', JSON.stringify(message, null, 2));
                throw new Error(errorMsg);
            }
        }

        return {
            delegatedAgents: [...delegatedAgents],
            output: result ?? '',
        };
    };
}

module.exports = {
    buildInvocationPrompt,
    createParentAgentRunner,
    createParentOptions,
    createSubagentDefinitions,
};
