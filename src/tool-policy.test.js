const test = require('node:test');
const assert = require('node:assert/strict');

const { toolsForSkills } = require('./tool-policy');

test('toolsForSkills scopes tools to selected skills plus Agent fallback', () => {
    assert.deepEqual(toolsForSkills(['journal']), ['Agent', 'Read', 'Write', 'Edit']);
    assert.deepEqual(toolsForSkills(['calendar']), ['Agent', 'mcp__calendar']);
});

test('toolsForSkills de-duplicates overlapping tools', () => {
    assert.deepEqual(toolsForSkills(['journal', 'task-review']), ['Agent', 'Read', 'Write', 'Edit']);
});
