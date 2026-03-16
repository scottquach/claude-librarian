require('dotenv').config();
const { Telegraf } = require('telegraf');
const { join } = require('node:path');
const { createBotFromDirectory } = require('./src/bot-factory');

const token = process.env.BOT_TOKEN || '***REDACTED***';
const bot = new Telegraf(token);

createBotFromDirectory(bot, join(__dirname, 'bots'));

console.log('Bot is running...');
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
