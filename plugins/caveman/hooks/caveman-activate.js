#!/usr/bin/env node
// SessionStart hook — injects caveman ruleset filtered to the active intensity level.
// Default mode: lite. Override with CAVEMAN_DEFAULT_MODE env var.

const fs = require('fs');
const path = require('path');

const VALID_MODES = ['off', 'lite', 'full', 'ultra', 'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra'];

function getMode() {
    const env = process.env.CAVEMAN_DEFAULT_MODE;
    if (env && VALID_MODES.includes(env.toLowerCase())) return env.toLowerCase();
    return 'lite';
}

const mode = getMode();

if (mode === 'off') {
    process.stdout.write('OK');
    process.exit(0);
}

const modeLabel = mode === 'wenyan' ? 'wenyan-full' : mode;

let skillContent = '';
try {
    skillContent = fs.readFileSync(
        path.join(__dirname, '..', 'skills', 'caveman', 'SKILL.md'), 'utf8'
    );
} catch (e) {}

if (!skillContent) {
    process.stdout.write('CAVEMAN MODE ACTIVE — level: ' + modeLabel);
    process.exit(0);
}

// Strip YAML frontmatter
const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');

// Filter intensity table and examples to only the active level
const filtered = body.split('\n').reduce((acc, line) => {
    const tableRowMatch = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);
    if (tableRowMatch) {
        if (tableRowMatch[1] === modeLabel) acc.push(line);
        return acc;
    }
    const exampleMatch = line.match(/^- (\S+?):\s/);
    if (exampleMatch) {
        if (exampleMatch[1] === modeLabel) acc.push(line);
        return acc;
    }
    acc.push(line);
    return acc;
}, []);

process.stdout.write('CAVEMAN MODE ACTIVE — level: ' + modeLabel + '\n\n' + filtered.join('\n'));
