import { readFileSync, readdirSync as fsReaddirSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { loadBotConfig } from './bot-config-loader.js';

function resolvePath(baseDir, targetPath) {
    if (!targetPath) return null;
    if (baseDir.startsWith('/') && !isAbsolute(targetPath)) {
        return posix.resolve(baseDir, targetPath);
    }
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

    if (!registry.parent || typeof registry.parent !== 'object') {
        throw new Error('Agent registry missing required field: parent');
    }

    const parentSpec = registry.parent;
    if (typeof parentSpec.id !== 'string' || parentSpec.id.length === 0) {
        throw new Error('Agent registry parent missing required field: id');
    }

    if (typeof parentSpec.botConfigPath !== 'string' || parentSpec.botConfigPath.length === 0) {
        throw new Error(`Agent registry parent "${parentSpec.id}" missing required field: botConfigPath`);
    }

    const botConfigPath = resolvePath(registryDir, parentSpec.botConfigPath);
    const promptsDir = resolvePath(
        registryDir,
        parentSpec.promptsDir ?? join(dirname(parentSpec.botConfigPath), 'prompts'),
    );
    const config = loadBotConfig(botConfigPath, promptsDir, { env, readFile, readdirSync });
    const parent = {
        ...config,
        id: parentSpec.id,
        description: typeof parentSpec.description === 'string' ? parentSpec.description : config.description,
        botConfigPath,
        promptsDir,
    };

    return {
        directories: uniqueStrings(parent.directories),
        parent,
    };
}

export { loadAgentRegistry };
