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

module.exports = { parseJobConfig };
