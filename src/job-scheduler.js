const { parseFrontmatter } = require('./bot-config-loader');
const nodeCron = require('node-cron');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
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
    const runParentAgent = opts.runParentAgent;
    const conversationStore = opts.conversationStore ?? null;

    if (!runParentAgent) {
        throw new Error('scheduleJobs requires a runParentAgent option');
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
                    const promptWithContext = conversationStore?.buildPrompt({ chatId, currentInput: job.prompt }) ?? job.prompt;
                    const { output } = await runParentAgent({
                        chatId,
                        jobName: job.name,
                        prompt: promptWithContext,
                        source: 'job',
                    });
                    const shouldSkip = output.trimStart().startsWith('[SKIP]');
                    console.log(`[job] completed: ${job.name} ${job.telegram}${shouldSkip ? ' (skipped)' : ''}`);
                    if (conversationStore && !shouldSkip) {
                        conversationStore.appendTurn({
                            assistantMessage: output,
                            chatId,
                            source: `job:${job.name}`,
                            userMessage: job.prompt,
                        });
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
