const test = require('node:test');
const assert = require('node:assert/strict');

const { appendSkillPrompt, buildSkillPrompt } = require('./skill-loader');

test('buildSkillPrompt loads selected skill fragments', () => {
    const files = {
        'journal.md': '# Journal Skill\n\nJournal body.',
    };

    const prompt = buildSkillPrompt(['journal'], {
        skillsDir: '/fake/skills',
        readFile: (path) => files[require('node:path').basename(path)],
    });

    assert.match(prompt, /Loaded Skill: journal/);
    assert.match(prompt, /Journal body/);
});

test('appendSkillPrompt leaves prompt unchanged when no skills are selected', () => {
    assert.equal(appendSkillPrompt('Parent prompt.', [], {}), 'Parent prompt.');
});
