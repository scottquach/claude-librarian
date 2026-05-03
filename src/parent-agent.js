const { execFile } = require('node:child_process');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { availableSkills, parseToolsFromFrontmatter, toolsForSkills } = require('./tool-policy');

const pluginPath = resolve(__dirname, '../plugins/caveman');
const parentSkillsPluginPath = resolve(__dirname, '../plugins/parent-skills');

/**
 * Read every subdirectory of plugins/parent-skills/skills/ and extract its
 * tool grants from SKILL.md frontmatter.  Returns a map of skill name →
 * allowed tools, sorted alphabetically so the order is deterministic.
 */
function discoverSkillPolicy(pluginPath) {
    const skillsDir = resolve(pluginPath, 'skills');
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));

    const policy = {};
    for (const dir of dirs) {
        const content = readFileSync(resolve(skillsDir, dir.name, 'SKILL.md'), 'utf8');
        policy[dir.name] = parseToolsFromFrontmatter(content);
    }
    return policy;
}

const SKILL_POLICY = discoverSkillPolicy(parentSkillsPluginPath);
const PARENT_SKILLS = Object.freeze(Object.keys(SKILL_POLICY));

const c = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
};

function logStreamEvent(event) {
    const type = event.type;

    if (type === 'system') {
        if (event.subtype === 'init') {
            for (const server of event.mcp_servers ?? []) {
                const ok = server.status === 'connected';
                const color = ok ? c.green : c.yellow;
                process.stdout.write(`${color}[mcp] ${server.name}: ${server.status}${c.reset}\n`);
            }
            const mcpTools = (event.tools ?? []).filter((t) => t.startsWith('mcp__'));
            if (mcpTools.length > 0) {
                process.stdout.write(`${c.dim}[mcp tools] ${mcpTools.join(', ')}${c.reset}\n`);
            } else {
                process.stdout.write(`${c.yellow}[mcp tools] none registered${c.reset}\n`);
            }
        }
        return;
    }

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
    const lines = ['[Invocation metadata]', `source: ${source}`];

    if (jobName) lines.push(`job_name: ${jobName}`);
    if (chatId) lines.push(`chat_id: ${chatId}`);

    lines.push('[/Invocation metadata]', '', prompt);
    return lines.join('\n');
}

function createParentOptions({ registry, mcpServers } = {}) {
    const parent = registry.parent;
    const activeSkills = availableSkills(SKILL_POLICY, { mcpServers });
    const allowedTools = toolsForSkills(activeSkills, SKILL_POLICY, { includeAgentFallback: false });
    const builtInTools = allowedTools.filter((toolName) => !toolName.startsWith('mcp__'));

    return {
        pathToClaudeCodeExecutable: process.env.CLAUDE_PATH ?? 'claude',
        env: process.env,
        cwd: registry.directories[0],
        additionalDirectories: registry.directories.slice(1),
        agent: parent.id,
        agents: {
            [parent.id]: {
                description: parent.description ?? 'Telegram-facing parent assistant',
                model: parent.model,
                prompt: parent.systemPrompt,
                skills: [...activeSkills],
            },
        },
        allowedTools,
        tools: builtInTools,
        allowDangerouslySkipPermissions: false,
        disallowedTools: ['Agent'],
        includePartialMessages: true,
        mcpServers: mcpServers || undefined,
        model: parent.model,
        permissionMode: 'acceptEdits',
        plugins: [
            { type: 'local', path: pluginPath },
            { type: 'local', path: parentSkillsPluginPath },
        ],
        settingSources: ['project'],
        systemPrompt: parent.systemPrompt || undefined,
    };
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

function createParentAgentRunner({ registry, mcpServers, queryFn } = {}) {
    checkClaudeExecutable(process.env.CLAUDE_PATH ?? 'claude');

    let resolvedQuery = queryFn;
    async function getQuery() {
        if (!resolvedQuery) {
            resolvedQuery = (await import('@anthropic-ai/claude-agent-sdk')).query;
        }
        return resolvedQuery;
    }

    return async function runParentAgent({ prompt = '', source, jobName, chatId } = {}) {
        const loadedSkills = availableSkills(SKILL_POLICY, { mcpServers });
        const options = createParentOptions({ registry, mcpServers });
        const finalPrompt = buildInvocationPrompt({ chatId, jobName, prompt, source });
        let result = null;
        const queryImpl = await getQuery();

        for await (const message of queryImpl({ prompt: finalPrompt, options })) {
            logStreamEvent(message);
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
            delegatedAgents: [],
            loadedSkills,
            output: result ?? '',
            selectedSkills: loadedSkills,
        };
    };
}

module.exports = {
    PARENT_SKILLS,
    SKILL_POLICY,
    buildInvocationPrompt,
    createParentAgentRunner,
    createParentOptions,
};
