const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildInvocationPrompt,
    createParentAgentRunner,
    createParentOptions,
} = require('./parent-agent');

function makeRegistry() {
    return {
        parentAgentId: 'parent',
        directories: ['/vault', '/shared'],
        parent: {
            id: 'parent',
            model: 'haiku',
            tools: ['Agent'],
            systemPrompt: 'Parent instructions.',
        },
        childAgents: [
            {
                id: 'journal-ingest',
                description: 'Journal specialist',
                model: 'haiku',
                tools: ['Read', 'Edit'],
                systemPrompt: 'Journal prompt.',
            },
            {
                id: 'calendar-integration',
                description: 'Calendar specialist',
                model: 'haiku',
                tools: ['mcp__calendar__get_calendar_events'],
                systemPrompt: 'Calendar prompt.',
            },
        ],
    };
}

test('buildInvocationPrompt includes source metadata', () => {
    const prompt = buildInvocationPrompt({
        chatId: '42',
        jobName: 'daily-rollover',
        prompt: 'Body prompt',
        source: 'job',
    });

    assert.match(prompt, /\[Invocation metadata\]/);
    assert.match(prompt, /source: job/);
    assert.match(prompt, /job_name: daily-rollover/);
    assert.match(prompt, /chat_id: 42/);
    assert.match(prompt, /Body prompt/);
});

test('createParentOptions includes Agent tool and subagent definitions', () => {
    const options = createParentOptions({
        registry: makeRegistry(),
        mcpServers: { calendar: { type: 'stdio' } },
    });

    assert.deepEqual(options.allowedTools, ['WebSearch', 'Agent', 'Read', 'Edit', 'mcp__calendar__get_calendar_events']);
    assert.equal(options.cwd, '/vault');
    assert.deepEqual(options.additionalDirectories, ['/shared']);
    assert.equal(options.agents['journal-ingest'].description, 'Journal specialist');
    assert.deepEqual(options.agents['journal-ingest'].tools, ['WebSearch', 'Read', 'Edit']);
    assert.deepEqual(options.agents['calendar-integration'].tools, ['WebSearch', 'mcp__calendar__get_calendar_events']);
    assert.equal(options.systemPrompt, 'Parent instructions.');
});

test('createParentAgentRunner sends prompt through parent and tracks delegated subagents', async () => {
    const calls = [];
    const queryFn = async function* ({ prompt, options }) {
        calls.push({ prompt, options });
        yield {
            type: 'assistant',
            message: {
                content: [
                    {
                        type: 'tool_use',
                        name: 'Agent',
                        input: { subagent_type: 'calendar-integration' },
                    },
                ],
            },
        };
        yield {
            type: 'result',
            subtype: 'success',
            result: 'Tomorrow looks busy.',
        };
    };

    const runParentAgent = createParentAgentRunner({
        registry: makeRegistry(),
        mcpServers: { calendar: { type: 'stdio' } },
        queryFn,
    });

    const result = await runParentAgent({
        chatId: '42',
        prompt: 'What meetings do I have tomorrow afternoon?',
        source: 'telegram',
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].prompt, /source: telegram/);
    assert.match(calls[0].prompt, /What meetings do I have tomorrow afternoon\?/);
    assert.ok(calls[0].options.allowedTools.includes('Agent'));
    assert.ok(calls[0].options.allowedTools.includes('WebSearch'));
    assert.deepEqual(result.delegatedAgents, ['calendar-integration']);
    assert.equal(result.output, 'Tomorrow looks busy.');
});
