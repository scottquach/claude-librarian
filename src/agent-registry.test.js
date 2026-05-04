import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAgentRegistry } from './agent-registry.js';

test('loadAgentRegistry hydrates parent and child agent configs', () => {
    const files = {
        '/project/agents/registry.json': JSON.stringify({
            parentAgentId: 'parent',
            agents: [
                { id: 'parent', description: 'Parent router', botConfigPath: 'parent/BOT.md' },
                { id: 'journal-ingest', description: 'Journal specialist', botConfigPath: 'journal/BOT.md', promptsDir: 'journal/prompts' },
            ],
        }),
        '/project/agents/parent/BOT.md': `---
name: parent
model: haiku
tools:
  - Agent
directories:
  - \${VAULT_PATH}
---

Parent instructions.
`,
        '/project/agents/journal/BOT.md': `---
name: journal-ingest
model: haiku
tools:
  - Read
  - Edit
directories:
  - \${VAULT_PATH}
---

Journal instructions.
`,
        '/project/agents/journal/prompts/rules.md': 'Additional journal rules.',
    };

    const readFile = (path) => {
        if (files[path]) return files[path];
        throw Object.assign(new Error(`Missing file: ${path}`), { code: 'ENOENT' });
    };
    const readdirSync = (path) => {
        if (path === '/project/agents/journal/prompts') return ['rules.md'];
        throw Object.assign(new Error(`Missing directory: ${path}`), { code: 'ENOENT' });
    };

    const registry = loadAgentRegistry('/project/agents/registry.json', {
        env: { VAULT_PATH: '/vault' },
        readFile,
        readdirSync,
    });

    assert.equal(registry.parentAgentId, 'parent');
    assert.equal(registry.parent.id, 'parent');
    assert.equal(registry.childAgents.length, 1);
    assert.deepEqual(registry.directories, ['/vault']);
    assert.equal(registry.childAgents[0].description, 'Journal specialist');
    assert.match(registry.childAgents[0].systemPrompt, /Journal instructions/);
    assert.match(registry.childAgents[0].systemPrompt, /Additional journal rules/);
});

test('loadAgentRegistry throws when parent agent is missing', () => {
    const files = {
        '/project/agents/registry.json': JSON.stringify({
            parentAgentId: 'parent',
            agents: [{ id: 'journal-ingest', botConfigPath: 'journal/BOT.md' }],
        }),
        '/project/agents/journal/BOT.md': `---
name: journal-ingest
model: haiku
---

Journal instructions.
`,
    };

    const readFile = (path) => {
        if (files[path]) return files[path];
        throw Object.assign(new Error(`Missing file: ${path}`), { code: 'ENOENT' });
    };

    assert.throws(
        () => loadAgentRegistry('/project/agents/registry.json', {
            readFile,
            readdirSync: () => {
                throw Object.assign(new Error('Missing directory'), { code: 'ENOENT' });
            },
        }),
        /Parent agent "parent" was not found/
    );
});
