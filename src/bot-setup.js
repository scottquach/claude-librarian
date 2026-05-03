import { message } from 'telegraf/filters';
import { markdownToTelegramHtml } from './telegram-format.js';

async function handleMessage(ctx, text, { runParentAgent, conversationStore }) {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

    console.log(`[message] from user=${username} chatId=${chatId}`);

    const promptWithContext = conversationStore.buildPrompt({ chatId, currentInput: text });
    console.log('promptWithContext', promptWithContext);

    try {
        const { output } = await runParentAgent({
            chatId,
            prompt: promptWithContext,
            source: 'telegram',
        });
        console.log(`[claude] succeeded outputLength=${output.length}`);
        conversationStore.appendTurn({
            assistantMessage: output,
            chatId,
            source: 'telegram',
            userMessage: text,
        });
        await ctx.reply(markdownToTelegramHtml(output), { parse_mode: 'HTML' });
    } catch (error) {
        console.error(`[claude] failed error=${error.message}`, error.stack ?? '');
        await ctx.reply('Something went wrong: ' + error.message);
    }
}

function setupBot(telegramBot, { runParentAgent, conversationStore, transcribeVoice }) {
    telegramBot.on(message('text'), (ctx) => {
        return handleMessage(ctx, ctx.message.text, { runParentAgent, conversationStore });
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

        await handleMessage(ctx, transcript, { runParentAgent, conversationStore });
    });

    telegramBot.start((ctx) => ctx.reply('Welcome'));
    telegramBot.help((ctx) => ctx.reply("Send me a message and I'll log it to your journal."));
}

export { setupBot };
