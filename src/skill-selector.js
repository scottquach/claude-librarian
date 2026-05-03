const ALL_SKILLS = ['journal', 'task-review', 'calendar', 'strava', 'scheduler'];

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function extractCurrentInput(text = '') {
    const match = String(text).match(/(?:^|\n)Current input:\s*\n([\s\S]*)$/);
    return (match ? match[1] : text).trim();
}

function hasAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
}

function looksLikeCalendarRequest(text) {
    return hasAny(text, [
        /\b(calendar|meeting|meetings|appointment|appointments|event|events|schedule|availability|available|busy|free)\b/i,
        /\bwhat(?:'s| is) on (?:my )?(?:calendar|schedule)\b/i,
        /\bdo i have\b.*\b(meeting|appointment|event|calendar)\b/i,
    ]);
}

function looksLikeStravaRequest(text) {
    return hasAny(text, [
        /\b(strava|run|runs|running|ride|rides|cycling|bike|workout|workouts|activity|activities|pace|mileage|distance|elevation)\b/i,
        /\bhow far did i\b/i,
        /\blog (?:my )?(?:latest|last|recent) (?:run|ride|workout|activity)\b/i,
    ]);
}

function looksLikeSchedulingRequest(text) {
    return hasAny(text, [
        /\b(remind me|reminder|schedule this|schedule a|set a reminder|every day|daily|weekly|monthly|tomorrow at|next .* at)\b/i,
        /\b(list|show|cancel|pause|resume)\b.*\b(reminders|schedules|scheduled)\b/i,
    ]);
}

function looksLikeTaskReviewRequest(text) {
    return hasAny(text, [
        /\b(what tasks|which tasks|task list|open tasks|completed tasks|unfinished tasks|rollover|carry over)\b/i,
        /\b(on my plate|didn't finish|did not finish|how many tasks)\b/i,
        /\bwhat do i need to do\b/i,
    ]);
}

function looksLikeJournalWrite(text) {
    return hasAny(text, [
        /\b(add|log|note|capture|write down|record|remember)\b/i,
        /\b(grocery|groceries|shopping list)\b/i,
        /\b(i should|i need to|i want to|i have to|remind me to)\b/i,
        /\b(i feel|i felt|feeling|mood)\b/i,
        /\b(done|finished|completed|move|reschedule)\b.*\b(task|todo|to-do)\b/i,
    ]);
}

function selectSkills({ text = '', source = 'unknown', jobName } = {}) {
    if (source === 'job') return ALL_SKILLS;

    const input = extractCurrentInput(text);
    const skills = [];

    if (looksLikeSchedulingRequest(input)) skills.push('scheduler');
    if (looksLikeCalendarRequest(input)) skills.push('calendar');
    if (looksLikeStravaRequest(input)) skills.push('strava');
    if (looksLikeTaskReviewRequest(input)) skills.push('task-review');
    if (looksLikeJournalWrite(input)) skills.push('journal');

    if (jobName) return unique(skills.length > 0 ? skills : ALL_SKILLS);
    return unique(skills.length > 0 ? skills : ['journal']);
}

module.exports = {
    ALL_SKILLS,
    extractCurrentInput,
    looksLikeCalendarRequest,
    looksLikeJournalWrite,
    looksLikeSchedulingRequest,
    looksLikeStravaRequest,
    looksLikeTaskReviewRequest,
    selectSkills,
};
