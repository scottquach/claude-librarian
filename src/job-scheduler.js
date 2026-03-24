const { parseFrontmatter } = require('./bot-config-loader');
const nodeCron = require('node-cron');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { injectContext } = require('./date-context');
const { markdownToTelegramHtml } = require('./telegram-format');

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

function scheduleJobs(bot, jobsDir, opts = {}) {
    const cron = opts.cron ?? nodeCron;
    const defaultChatId = opts.defaultChatId ?? process.env.DEFAULT_CHAT_ID;
    const runClaudeCommand = opts.runClaudeCommand;
    const sessionIdMap = opts.sessionIdMap ?? null;
    const conversationStore = opts.conversationStore ?? null;

    if (!runClaudeCommand) {
        throw new Error('scheduleJobs requires a runClaudeCommand option');
    }

    const jobs = loadJobConfigs(jobsDir, {
        readdir: opts.readdir,
        readFile: opts.readFile,
    });

    for (const job of jobs) {
        const chatId = String(defaultChatId ?? 'global');
        cron.schedule(
            job.cron,
            async () => {
                console.log(`[job] running: ${job.name}`);
                try {
                    const prompt = injectContext(job.prompt);
                    const existingSessionId = sessionIdMap?.get(chatId) ?? null;
                    const { output, sessionId } = await runClaudeCommand({ prompt, sessionId: existingSessionId });
                    const shouldSkip = output.trimStart().startsWith('[SKIP]');
                    console.log(`[job] completed: ${job.name} ${job.telegram} sessionId=${sessionId}${shouldSkip ? ' (skipped)' : ''}`);
                    if (sessionIdMap) sessionIdMap.set(chatId, sessionId);
                    if (conversationStore && !shouldSkip) {
                        conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
                    }
                    if (job.telegram && defaultChatId && !shouldSkip) {
                        await bot.telegram
                            .sendMessage(defaultChatId, markdownToTelegramHtml(output), { parse_mode: 'HTML' })
                            .catch((err) => console.error(`[job] telegram send failed: ${err.message}`));
                    }
                } catch (error) {
                    console.error(`[job] failed: ${job.name} — ${error.message}`);
                    if (job.telegram && defaultChatId) {
                        await bot.telegram
                            .sendMessage(defaultChatId, `Job "${job.name}" failed: ${error.message}`)
                            .catch((err) => console.error(`[job] telegram send failed: ${err.message}`));
                    }
                }
            },
            { timezone: process.env.BOT_TIMEZONE ?? 'America/Chicago' },
        );

        console.log(`[job] scheduled: ${job.name} (${job.cron})`);
    }
}

module.exports = { parseJobConfig, loadJobConfigs, scheduleJobs };
