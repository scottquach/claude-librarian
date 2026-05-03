const TOOLS_BY_SKILL = {
    journal: ['Read', 'Write', 'Edit'],
    'task-review': ['Read'],
    calendar: ['mcp__calendar'],
    strava: ['Read', 'mcp__strava'],
    scheduler: [
        'mcp__scheduler__schedule_task',
        'mcp__scheduler__schedule_message',
        'mcp__scheduler__list_schedules',
        'mcp__scheduler__cancel_schedule',
    ],
};

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function toolsForSkills(skills = [], { includeAgentFallback = true, baseTools = [] } = {}) {
    const skillTools = skills.flatMap((skill) => TOOLS_BY_SKILL[skill] ?? []);
    return unique([
        ...baseTools,
        ...(includeAgentFallback ? ['Agent'] : []),
        ...skillTools,
    ]);
}

module.exports = {
    TOOLS_BY_SKILL,
    toolsForSkills,
};
