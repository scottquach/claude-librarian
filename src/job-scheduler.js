const { parseFrontmatter } = require('./bot-config-loader');

function parseJobConfig(fileContent) {
  const { frontmatter, body } = parseFrontmatter(fileContent);

  if (!frontmatter.name) throw new Error('Job config missing required field: name');
  if (!frontmatter.cron) throw new Error('Job config missing required field: cron');

  return {
    name: String(frontmatter.name),
    cron: String(frontmatter.cron),
    telegram: frontmatter.telegram === true,
    model: frontmatter.model ? String(frontmatter.model) : 'haiku',
    prompt: body,
  };
}

module.exports = { parseJobConfig };
