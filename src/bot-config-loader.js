// src/bot-config-loader.js
const { readFileSync, readdirSync: fsReaddirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { parse: parseYaml } = require('yaml');

function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    throw new Error('File must start with YAML frontmatter delimited by ---');
  }

  const withoutOpening = content.slice(4);
  const closingIdx = withoutOpening.search(/\n---(\r?\n|$)/);
  if (closingIdx === -1) throw new Error('Could not find closing --- in frontmatter');

  const yamlBlock = withoutOpening.slice(0, closingIdx);
  const body = withoutOpening.slice(closingIdx).replace(/^\n---\r?\n/, '').trim();

  return { frontmatter: parseYaml(yamlBlock), body };
}

function expandEnvVars(str, env) {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => (key in env ? env[key] : _));
}

function loadBotConfig(botMdPath, promptsDir, opts = {}) {
  const readFile = opts.readFile ?? ((p) => readFileSync(p, 'utf8'));
  const readdirSync = opts.readdirSync ?? ((d) => fsReaddirSync(d));
  const env = opts.env ?? process.env;
  const configDir = dirname(botMdPath);

  const { frontmatter, body } = parseFrontmatter(readFile(botMdPath));

  // Prepend CLAUDE.md identity if present
  let prompt = '';
  try {
    const identity = readFile(join(configDir, 'CLAUDE.md')).trim();
    if (identity) prompt = identity + '\n\n---\n\n';
  } catch {}

  prompt += body;

  // Append supplementary prompts from promptsDir
  try {
    const files = readdirSync(promptsDir)
      .map((f) => (typeof f === 'string' ? f : f.name))
      .filter((f) => f.endsWith('.md'))
      .sort();

    for (const filename of files) {
      try {
        prompt += '\n\n---\n\n' + readFile(join(promptsDir, filename)).trim();
      } catch {}
    }
  } catch {}

  return {
    model: String(frontmatter.model),
    tools: Array.isArray(frontmatter.tools) ? frontmatter.tools.map(String) : [],
    directories: Array.isArray(frontmatter.directories)
      ? frontmatter.directories.map((d) => expandEnvVars(String(d), env))
      : [],
    timeoutMs: typeof frontmatter.timeoutMs === 'number' ? frontmatter.timeoutMs : 80000,
    systemPrompt: expandEnvVars(prompt, env),
  };
}

module.exports = { parseFrontmatter, loadBotConfig };
