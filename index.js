require('dotenv').config();
const { Telegraf } = require('telegraf');
const { join } = require('node:path');
const { createBotFromDirectory } = require('./src/bot-factory');
const { scheduleJobs } = require('./src/job-scheduler');

const token = process.env.BOT_TOKEN;
const bot = new Telegraf(token);

createBotFromDirectory(bot, join(__dirname, 'bots'));

console.log('Bot is running...');
bot.launch();
bot.on('message', (ctx) => {
    console.log('Message received:', ctx.message.chat.id);
});
scheduleJobs(bot, join(__dirname, 'jobs'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
