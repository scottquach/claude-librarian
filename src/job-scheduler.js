const { parseFrontmatter } = require('./bot-config-loader');
const nodeCron = require('node-cron');

function parseJobConfig(fileContent) {
  const { frontmatter, body } = parseFrontmatter(fileContent);

  if (!frontmatter.name) throw new Error('Job config missing required field: name');
  if (!frontmatter.cron) throw new Error('Job config missing required field: cron');
  if (!nodeCron.validate(String(frontmatter.cron))) {
    throw new Error(`Job config has invalid cron expression: "${frontmatter.cron}"`);
  }

  return {
    name: String(frontmatter.name),
    cron: String(frontmatter.cron),
    telegram: frontmatter.telegram === true,
    model: frontmatter.model ? String(frontmatter.model) : 'haiku',
    prompt: body,
  };
}

const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

function loadJobConfigs(jobsDir, opts = {}) {
  const readdir = opts.readdir ?? ((d) => readdirSync(d));
  const readFile = opts.readFile ?? ((p) => readFileSync(p, 'utf8'));

  const filenames = readdir(jobsDir);
  const mdFiles = filenames.filter((f) => f.endsWith('.md'));

  return mdFiles.map((filename) => {
    const content = readFile(join(jobsDir, filename));
    return parseJobConfig(content);
  });
}

module.exports = { parseJobConfig, loadJobConfigs };
