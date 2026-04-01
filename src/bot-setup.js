// src/bot-setup.js
const { message } = require('telegraf/filters');
const { markdownToTelegramHtml } = require('./telegram-format');

async function handleMessage(ctx, text, { runClaudeCommand, conversationStore }) {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

    console.log(`[message] from user=${username} chatId=${chatId}`);

    const promptWithContext = conversationStore.buildPrompt({ chatId, currentInput: text });
    console.log("promptWithContext", promptWithContext);

    try {
        const { output } = await runClaudeCommand({ prompt: promptWithContext });
        console.log(`[claude] succeeded outputLength=${output.length}`);
        conversationStore.appendTurn({
            assistantMessage: output,
            chatId,
            source: 'telegram',
            userMessage: text,
        });
        await ctx.reply(markdownToTelegramHtml(output), { parse_mode: 'HTML' });
    } catch (error) {
        console.error(`[claude] failed error=${error.message}`);
        await ctx.reply('Something went wrong: ' + error.message);
    }
}

function setupBot(telegramBot, { runClaudeCommand, conversationStore, transcribeVoice }) {
    telegramBot.on(message('text'), (ctx) => {
        return handleMessage(ctx, ctx.message.text, { runClaudeCommand, conversationStore });
    });

    telegramBot.on(message('voice'), async (ctx) => {
        const chatId = String(ctx.chat?.id ?? 'global');
        const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';
        console.log(`[message] voice received from user=${username} chatId=${chatId}`);

        let transcript;
        try {
            transcript = await transcribeVoice(ctx);
            console.log(
                `[whisper] transcribed voice message="${transcript.slice(0, 100)}${transcript.length > 100 ? '...' : ''}"`,
            );
        } catch (error) {
            console.error(`[whisper] transcription failed error=${error.message}`);
            await ctx.reply('Failed to transcribe voice message: ' + error.message);
            return;
        }

        await handleMessage(ctx, transcript, { runClaudeCommand, conversationStore });
    });

    telegramBot.start((ctx) => ctx.reply('Welcome'));
    telegramBot.help((ctx) => ctx.reply("Send me a message and I'll log it to your journal."));
}

module.exports = { setupBot };
