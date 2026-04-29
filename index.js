require('dotenv').config();
const { Telegraf } = require('telegraf');
const { join } = require('node:path');
const { loadAgentRegistry } = require('./src/agent-registry');
const { createParentAgentRunner } = require('./src/parent-agent');
const { createConversationStateStore } = require('./src/conversation-state');
const { setupBot } = require('./src/bot-setup');
const { scheduleJobs } = require('./src/job-scheduler');
const { createTranscriber } = require('./src/transcribe');
const { createCalendarServer } = require('./src/mcp/calendar');

const bot = new Telegraf(process.env.BOT_TOKEN);
const registry = loadAgentRegistry(join(__dirname, 'agents', 'registry.json'));

const mcpServers = {};
if (process.env.COMPOSIO_CONSUMER_API_KEY) {
    mcpServers.calendar = {
        type: 'http',
        url: 'https://connect.composio.dev/mcp',
        headers: { 'x-consumer-api-key': process.env.COMPOSIO_CONSUMER_API_KEY },
    };
} else if (process.env.ICAL_URLS) {
    const urls = process.env.ICAL_URLS.split(',').map((u) => u.trim()).filter(Boolean);
    const labels = (process.env.ICAL_LABELS || '').split(',').map((l) => l.trim());
    mcpServers.calendar = createCalendarServer(urls, labels);
}

const runParentAgent = createParentAgentRunner({
    registry,
    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
});
const conversationStore = createConversationStateStore();

setupBot(bot, {
    runParentAgent,
    conversationStore,
    transcribeVoice: createTranscriber(),
});

scheduleJobs(bot, join(__dirname, 'jobs'), {
    runParentAgent,
    conversationStore,
});

console.log('Bot is running...');
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
