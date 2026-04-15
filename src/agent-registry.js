const { readFileSync, readdirSync: fsReaddirSync } = require('node:fs');
const { dirname, isAbsolute, join, resolve } = require('node:path');

const { loadBotConfig } = require('./bot-config-loader');

function resolvePath(baseDir, targetPath) {
    if (!targetPath) return null;
    return isAbsolute(targetPath) ? targetPath : resolve(baseDir, targetPath);
}

function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean))];
}

function loadAgentRegistry(registryPath, opts = {}) {
    const readFile = opts.readFile ?? ((path) => readFileSync(path, 'utf8'));
    const readdirSync = opts.readdirSync ?? ((path) => fsReaddirSync(path));
    const env = opts.env ?? process.env;
    const registryDir = dirname(registryPath);
    const registry = JSON.parse(readFile(registryPath));

    if (!registry || typeof registry !== 'object') {
        throw new Error('Agent registry must be a JSON object');
    }

    if (typeof registry.parentAgentId !== 'string' || registry.parentAgentId.length === 0) {
        throw new Error('Agent registry missing required field: parentAgentId');
    }

    if (!Array.isArray(registry.agents) || registry.agents.length === 0) {
        throw new Error('Agent registry missing required field: agents');
    }

    const agents = registry.agents.map((agent) => {
        if (!agent || typeof agent !== 'object') {
            throw new Error('Agent registry entries must be objects');
        }

        if (typeof agent.id !== 'string' || agent.id.length === 0) {
            throw new Error('Agent registry entry missing required field: id');
        }

        if (typeof agent.botConfigPath !== 'string' || agent.botConfigPath.length === 0) {
            throw new Error(`Agent registry entry "${agent.id}" missing required field: botConfigPath`);
        }

        const botConfigPath = resolvePath(registryDir, agent.botConfigPath);
        const promptsDir = resolvePath(
            registryDir,
            agent.promptsDir ?? join(dirname(agent.botConfigPath), 'prompts'),
        );
        const config = loadBotConfig(botConfigPath, promptsDir, { env, readFile, readdirSync });

        return {
            ...config,
            id: agent.id,
            description: typeof agent.description === 'string' ? agent.description : config.description,
            botConfigPath,
            promptsDir,
        };
    });

    const parent = agents.find((agent) => agent.id === registry.parentAgentId);
    if (!parent) {
        throw new Error(`Parent agent "${registry.parentAgentId}" was not found in the registry`);
    }

    return {
        agents,
        childAgents: agents.filter((agent) => agent.id !== registry.parentAgentId),
        directories: uniqueStrings(agents.flatMap((agent) => agent.directories)),
        parent,
        parentAgentId: registry.parentAgentId,
    };
}

module.exports = {
    loadAgentRegistry,
};
