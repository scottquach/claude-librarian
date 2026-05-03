/**
 * Parse the `tools:` list from a SKILL.md frontmatter block.
 * Returns an empty array when the field is absent or the frontmatter is missing.
 */
function parseToolsFromFrontmatter(content) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fmMatch) return [];

    const toolsBlock = fmMatch[1].match(/^tools:\n((?:[ \t]+-[ \t]+.+\n?)*)/m);
    if (!toolsBlock) return [];

    return (
        toolsBlock[1]
            .match(/^[ \t]+-[ \t]+(.+)$/gm)
            ?.map((line) => line.replace(/^[ \t]+-[ \t]+/, '').trim()) ?? []
    );
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function parseMcpServerName(toolName) {
    const match = /^mcp__([^_]+)__/.exec(toolName);
    return match ? match[1] : null;
}

function skillNeedsUnavailableMcpTool(skillTools = [], availableMcpServers = []) {
    const available = new Set(availableMcpServers);
    return skillTools.some((toolName) => {
        const serverName = parseMcpServerName(toolName);
        return serverName ? !available.has(serverName) : false;
    });
}

/**
 * Filter the discovered skill set down to the skills that can actually run in
 * this session, based on which MCP servers are configured.
 *
 * Non-MCP tools such as Read/Write/Edit are assumed to be available through
 * Claude Code itself. MCP-backed skills are omitted unless every referenced
 * server is configured.
 *
 * @param {Record<string, string[]>} toolsBySkill - Map of skill name → tool grants.
 * @param {{ mcpServers?: Record<string, unknown> }} options
 * @returns {string[]}
 */
function availableSkills(toolsBySkill = {}, { mcpServers = {} } = {}) {
    const availableMcpServers = Object.keys(mcpServers);

    return Object.keys(toolsBySkill).filter((skillName) => {
        const skillTools = toolsBySkill[skillName] ?? [];
        return !skillNeedsUnavailableMcpTool(skillTools, availableMcpServers);
    });
}

/**
 * Build the allowed-tools list for a given set of skills.
 *
 * @param {string[]} skills - Skill names to include.
 * @param {Record<string, string[]>} toolsBySkill - Map of skill name → tool grants.
 * @param {{ includeAgentFallback?: boolean, baseTools?: string[] }} options
 */
function toolsForSkills(skills = [], toolsBySkill = {}, { includeAgentFallback = true, baseTools = [] } = {}) {
    const skillTools = skills.flatMap((skill) => toolsBySkill[skill] ?? []);
    return unique([
        ...baseTools,
        'Skill',
        ...(includeAgentFallback ? ['Agent'] : []),
        ...skillTools,
    ]);
}

module.exports = {
    availableSkills,
    parseToolsFromFrontmatter,
    toolsForSkills,
};
