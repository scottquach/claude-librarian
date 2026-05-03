const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const DEFAULT_SKILLS_DIR = join(__dirname, '..', 'agents', 'parent', 'skills');

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function loadSkill(name, { skillsDir = DEFAULT_SKILLS_DIR, readFile = readFileSync } = {}) {
    return readFile(join(skillsDir, `${name}.md`), 'utf8').trim();
}

function buildSkillPrompt(skills = [], opts = {}) {
    const selectedSkills = unique(skills);
    if (selectedSkills.length === 0) return '';

    const sections = selectedSkills.map((skill) => {
        const body = loadSkill(skill, opts);
        return `## Loaded Skill: ${skill}\n\n${body}`;
    });

    return [
        '## Loaded Skills',
        'Use only the loaded skill instructions below for direct domain work in this request.',
        'If the request needs a domain that is not loaded, use the subagent fallback instead of improvising.',
        '',
        ...sections,
    ].join('\n\n');
}

function appendSkillPrompt(systemPrompt = '', skills = [], opts = {}) {
    const skillPrompt = buildSkillPrompt(skills, opts);
    if (!skillPrompt) return systemPrompt;
    return `${systemPrompt.trim()}\n\n---\n\n${skillPrompt}`;
}

module.exports = {
    DEFAULT_SKILLS_DIR,
    appendSkillPrompt,
    buildSkillPrompt,
    loadSkill,
};
