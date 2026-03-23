require('dotenv').config();
const { Telegraf } = require('telegraf');
const { join } = require('node:path');
const { createClaudeCommandRunner, createClaudeConversationStore } = require('./bot');
const { loadBotConfig } = require('./src/bot-config-loader');
const { setupBot } = require('./src/bot-setup');
const { scheduleJobs } = require('./src/job-scheduler');
const { createTranscriber } = require('./src/transcribe');

const bot = new Telegraf(process.env.BOT_TOKEN);
const config = loadBotConfig(join(__dirname, 'BOT.md'), join(__dirname, 'prompts'));

const runClaudeCommand = createClaudeCommandRunner({
    model: config.model,
    tools: config.tools,
    directories: config.directories,
    systemPrompt: config.systemPrompt,
});
const conversationStore = createClaudeConversationStore();
const sessionIdMap = new Map();

setupBot(bot, {
    runClaudeCommand,
    conversationStore,
    sessionIdMap,
    transcribeVoice: createTranscriber(),
});

scheduleJobs(bot, join(__dirname, 'jobs'), {
    runClaudeCommand,
    sessionIdMap,
    conversationStore,
});

console.log('Bot is running...');
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
