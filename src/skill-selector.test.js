const test = require('node:test');
const assert = require('node:assert/strict');

const { extractCurrentInput, selectSkills } = require('./skill-selector');

test('extractCurrentInput returns the current input block when present', () => {
    const text = `[Context: today is 2026-05-03]\n\nCurrent input:\nadd milk to the grocery list`;
    assert.equal(extractCurrentInput(text), 'add milk to the grocery list');
});

test('selectSkills chooses journal for obvious ingest requests', () => {
    assert.deepEqual(selectSkills({ source: 'telegram', text: 'add milk to the grocery list' }), ['journal']);
    assert.deepEqual(selectSkills({ source: 'telegram', text: 'I should email Jenna' }), ['journal']);
});

test('selectSkills chooses domain skills for read requests', () => {
    assert.deepEqual(selectSkills({ source: 'telegram', text: "what's on my calendar tomorrow?" }), ['calendar']);
    assert.deepEqual(selectSkills({ source: 'telegram', text: 'how far did I run this week?' }), ['strava']);
    assert.deepEqual(selectSkills({ source: 'telegram', text: 'what tasks do I have today?' }), ['task-review']);
});

test('selectSkills loads all skills for jobs', () => {
    assert.deepEqual(selectSkills({ source: 'job', text: 'daily prompt' }), [
        'journal',
        'task-review',
        'calendar',
        'strava',
        'scheduler',
    ]);
});
