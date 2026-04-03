require('dotenv').config();
const { Telegraf } = require('telegraf');
const { join } = require('node:path');
const { createClaudeCommandRunner } = require('./bot');
const { createConversationStateStore } = require('./src/conversation-state');
const { loadBotConfig } = require('./src/bot-config-loader');
const { setupBot } = require('./src/bot-setup');
const { scheduleJobs } = require('./src/job-scheduler');
const { createTranscriber } = require('./src/transcribe');
const { createCalendarServer } = require('./src/mcp/calendar');

const bot = new Telegraf(process.env.BOT_TOKEN);
const config = loadBotConfig(join(__dirname, 'BOT.md'), join(__dirname, 'prompts'));

const mcpServers = {};
if (process.env.ICAL_URLS) {
    const urls = process.env.ICAL_URLS.split(',').map((u) => u.trim()).filter(Boolean);
    const labels = (process.env.ICAL_LABELS || '').split(',').map((l) => l.trim());
    mcpServers.calendar = createCalendarServer(urls, labels);
}

const runClaudeCommand = createClaudeCommandRunner({
    model: config.model,
    tools: config.tools,
    directories: config.directories,
    systemPrompt: config.systemPrompt,
    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
});
const conversationStore = createConversationStateStore();

setupBot(bot, {
    runClaudeCommand,
    conversationStore,
    transcribeVoice: createTranscriber(),
});

scheduleJobs(bot, join(__dirname, 'jobs'), {
    runClaudeCommand,
    conversationStore,
});

console.log('Bot is running...');
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
