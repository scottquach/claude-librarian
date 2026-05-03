const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const {
    PARENT_SKILLS,
    SKILL_POLICY,
    buildInvocationPrompt,
    createParentAgentRunner,
    createParentOptions,
} = require('./parent-agent');
const { availableSkills } = require('./tool-policy');

function makeRegistry() {
    return {
        parentAgentId: 'parent',
        directories: ['/vault', '/shared'],
        parent: {
            id: 'parent',
            model: 'haiku',
            tools: [],
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

test('createParentOptions uses native parent skills and disables subagent delegation', () => {
    const options = createParentOptions({
        registry: makeRegistry(),
        mcpServers: { calendar: { type: 'stdio' } },
    });

    assert.equal(options.agent, 'parent');
    // Only calendar-backed and built-in skills should remain active here.
    assert.deepEqual(options.allowedTools, [
        'Skill',
        'mcp__calendar__*',
        'Read',
        'Write',
        'Edit',
    ]);
    assert.equal(options.cwd, '/vault');
    assert.deepEqual(options.additionalDirectories, ['/shared']);
    assert.deepEqual(options.disallowedTools, ['Agent']);
    assert.deepEqual(options.settingSources, ['project']);
    assert.deepEqual(
        options.agents.parent.skills,
        availableSkills(SKILL_POLICY, { mcpServers: { calendar: { type: 'stdio' } } }),
    );
    assert.equal(options.agents.parent.prompt, 'Parent instructions.');
    assert.equal(options.agents.parent.tools, undefined);
    assert.equal(options.agents.parent.mcpServers, undefined);
    assert.equal(options.agents['journal-ingest'], undefined);
    assert.equal(options.agents['calendar-integration'], undefined);
    assert.deepEqual(options.tools, ['Skill', 'Read', 'Write', 'Edit']);
    assert.deepEqual(
        options.plugins.map((plugin) => plugin.path),
        [
            resolve(__dirname, '../plugins/caveman'),
            resolve(__dirname, '../plugins/parent-skills'),
        ],
    );
    assert.match(options.systemPrompt, /Parent instructions\./);
    assert.doesNotMatch(options.systemPrompt, /Loaded Skill: journal/);
});

test('createParentAgentRunner sends prompt through native-skilled parent without delegation', async () => {
    const calls = [];
    const queryFn = async function* ({ prompt, options }) {
        calls.push({ prompt, options });
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
    assert.equal(calls[0].options.allowedTools.includes('Agent'), false);
    assert.deepEqual(calls[0].options.disallowedTools, ['Agent']);
    assert.ok(calls[0].options.allowedTools.includes('mcp__calendar__*'));
    assert.equal(calls[0].options.agent, 'parent');
    assert.deepEqual(
        calls[0].options.agents.parent.skills,
        availableSkills(SKILL_POLICY, { mcpServers: { calendar: { type: 'stdio' } } }),
    );
    assert.deepEqual(result.delegatedAgents, []);
    assert.deepEqual(result.loadedSkills, availableSkills(SKILL_POLICY, { mcpServers: { calendar: { type: 'stdio' } } }));
    assert.deepEqual(
        result.selectedSkills,
        availableSkills(SKILL_POLICY, { mcpServers: { calendar: { type: 'stdio' } } }),
    );
    assert.equal(result.output, 'Tomorrow looks busy.');
});

test('createParentOptions omits skills whose MCP servers are unavailable', () => {
    const options = createParentOptions({
        registry: makeRegistry(),
        mcpServers: { scheduler: { type: 'stdio' } },
    });

    assert.deepEqual(options.agents.parent.skills, ['journal', 'scheduler', 'task-review']);
    assert.deepEqual(options.allowedTools, [
        'Skill',
        'Read',
        'Write',
        'Edit',
        'mcp__scheduler__schedule_task',
        'mcp__scheduler__schedule_message',
        'mcp__scheduler__list_schedules',
        'mcp__scheduler__cancel_schedule',
    ]);
    assert.deepEqual(options.tools, ['Skill', 'Read', 'Write', 'Edit']);
});

test('parent skill plugin exposes every native skill with matching frontmatter', () => {
    const skillsRoot = resolve(__dirname, '../plugins/parent-skills/skills');

    for (const skill of PARENT_SKILLS) {
        const skillPath = resolve(skillsRoot, skill, 'SKILL.md');
        const body = readFileSync(skillPath, 'utf8');
        const frontmatter = body.match(/^---\n([\s\S]*?)\n---\n/);
        assert.ok(frontmatter, `${skill} should have YAML frontmatter`);
        assert.match(frontmatter[1], new RegExp(`^name: ${skill}$`, 'm'), `${skill} name should match directory`);
        assert.match(frontmatter[1], /^description: .+/m, `${skill} should have a description`);
        assert.match(frontmatter[1], /^tools:\n/m, `${skill} should declare a tools: list`);
        assert.ok(
            Array.isArray(SKILL_POLICY[skill]) && SKILL_POLICY[skill].length > 0,
            `${skill} tools list should be non-empty`,
        );
    }
});

test('calendar skill and parent prompt allow calendar writes when tools are available', () => {
    const parentPrompt = readFileSync(resolve(__dirname, '../agents/parent/BOT.md'), 'utf8');
    const calendarSkill = readFileSync(resolve(__dirname, '../plugins/parent-skills/skills/calendar/SKILL.md'), 'utf8');

    assert.match(parentPrompt, /calendar event creation, updates, deletes/);
    assert.match(parentPrompt, /Do not claim calendar writes are unsupported unless/);
    assert.match(calendarSkill, /Create calendar events when the user asks/);
    assert.match(calendarSkill, /a second Skill invocation will not make them visible/);
    assert.match(calendarSkill, /no reminder/);
});
