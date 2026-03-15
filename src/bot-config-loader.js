// src/bot-config-loader.js
const { readFileSync, readdirSync: fsReaddirSync } = require('node:fs');
const { dirname, join } = require('node:path');

function parseFrontmatter(fileContent) {
  if (!fileContent.startsWith('---\n') && !fileContent.startsWith('---\r\n')) {
    throw new Error('BOT.md must start with YAML frontmatter delimited by ---');
  }

  const withoutOpening = fileContent.slice(4); // remove leading '---\n'
  const closingIdx = withoutOpening.search(/\n---(\r?\n|$)/);
  if (closingIdx === -1) throw new Error('Could not find closing --- in frontmatter');

  const yamlBlock = withoutOpening.slice(0, closingIdx);
  const body = withoutOpening.slice(closingIdx).replace(/^\n---\r?\n/, '').trim();

  const frontmatter = parseYaml(yamlBlock);
  return { frontmatter, body };
}

function parseYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Top-level scalar: "key: value"
    const scalarMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (scalarMatch) {
      const [, key, rawVal] = scalarMatch;
      const num = Number(rawVal);
      result[key] = isNaN(num) || rawVal.trim() === '' ? rawVal.trim() : num;
      i++;
      continue;
    }

    // Top-level block: "key:"
    const blockMatch = line.match(/^(\w[\w-]*)\s*:\s*$/);
    if (blockMatch) {
      const [, key] = blockMatch;
      i++;
      const items = [];

      while (i < lines.length && lines[i].match(/^\s+/)) {
        // Sub-object item starting with "  - key: value" (inline) or "  -" (bare dash)
        const inlineObjMatch = lines[i].match(/^(\s+)-\s+(\w[\w-]*)\s*:\s*(.*)$/);
        const bareDashMatch = lines[i].match(/^\s+-\s*$/);

        if (inlineObjMatch || bareDashMatch) {
          const obj = {};
          if (inlineObjMatch) {
            obj[inlineObjMatch[2]] = inlineObjMatch[3].trim();
          }
          i++;
          // Read continuation properties (deeper indent)
          while (i < lines.length && lines[i].match(/^\s{4,}/)) {
            const propMatch = lines[i].match(/^\s+(\w[\w-]*)\s*:\s*(.+)$/);
            if (propMatch) obj[propMatch[1]] = propMatch[2].trim();
            i++;
          }
          items.push(obj);
          continue;
        }

        // Scalar list item: "  - value"
        const listItemMatch = lines[i].match(/^\s+-\s+(.+)$/);
        if (listItemMatch) {
          items.push(listItemMatch[1].trim());
          i++;
          continue;
        }

        i++;
      }
      result[key] = items;
      continue;
    }

    i++;
  }

  return result;
}

function normalizeBotConfig(raw, body, configDir) {
  if (!raw.name) throw new Error('BotConfig missing required field: name');
  if (!raw.model) throw new Error('BotConfig missing required field: model');
  if (!raw.commands || raw.commands.length === 0) {
    throw new Error('BotConfig must have at least one commands entry');
  }

  return {
    name: String(raw.name),
    description: String(raw.description ?? ''),
    model: String(raw.model),
    tools: Array.isArray(raw.tools) ? raw.tools.map(String) : [],
    directories: Array.isArray(raw.directories) ? raw.directories.map(String) : [],
    commands: raw.commands.map((c) => ({
      name: String(c.name),
      description: String(c.description ?? ''),
      defaultPrompt: String(c.defaultPrompt ?? ''),
    })),
    timeoutMs: typeof raw.timeoutMs === 'number' ? raw.timeoutMs : 80000,
    sessionIsolation: raw.sessionIsolation === 'shared' ? 'shared' : 'perCommand',
    systemPrompt: String(body ?? '').trim(),
    configDir,
  };
}

function loadBotConfig(botMdPath, opts = {}) {
  const readFile = opts.readFile ?? ((p) => readFileSync(p, 'utf8'));
  const readdirSync = opts.readdirSync ?? ((d) => fsReaddirSync(d));
  const configDir = dirname(botMdPath);

  const mainContent = readFile(botMdPath);
  const { frontmatter, body } = parseFrontmatter(mainContent);

  // Load supplementary .md files alphabetically
  const allFiles = readdirSync(configDir).map((f) => (typeof f === 'string' ? f : f.name));
  const supplementary = allFiles
    .filter((f) => f.endsWith('.md') && f !== 'BOT.md')
    .sort();

  let fullBody = body;
  for (const filename of supplementary) {
    try {
      const extra = readFile(join(configDir, filename));
      fullBody += '\n\n---\n\n' + extra.trim();
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return normalizeBotConfig(frontmatter, fullBody, configDir);
}

function discoverBotConfigs(rootDir, opts = {}) {
  const readdirSync = opts.readdirSync ?? ((d, o) => fsReaddirSync(d, o));
  const results = [];

  const entries = readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subEntries = readdirSync(join(rootDir, entry.name), { withFileTypes: true });
      if (subEntries.some((e) => (typeof e === 'string' ? e : e.name) === 'BOT.md')) {
        results.push(join(rootDir, entry.name, 'BOT.md'));
      }
    }
  }

  return results;
}

function loadAllBotConfigs(rootDir, opts = {}) {
  const paths = discoverBotConfigs(rootDir, opts);
  const configs = [];
  const seenNames = new Map(); // name -> path

  for (const p of paths) {
    const config = loadBotConfig(p, opts);
    if (seenNames.has(config.name)) {
      throw new Error(
        `Duplicate bot name "${config.name}" found in:\n  ${seenNames.get(config.name)}\n  ${p}`
      );
    }
    seenNames.set(config.name, p);
    configs.push(config);
  }

  return configs;
}

module.exports = {
  parseFrontmatter,
  normalizeBotConfig,
  loadBotConfig,
  discoverBotConfigs,
  loadAllBotConfigs,
};
