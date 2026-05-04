import { message } from 'telegraf/filters';
import { markdownToTelegramHtml } from './telegram-format.js';

function isHandlerTimeoutError(error) {
    return error?.name === 'TimeoutError' && /Promise timed out after \d+ milliseconds/.test(error?.message ?? '');
}

function describeUpdate(ctx) {
    return {
        chatId: String(ctx.chat?.id ?? 'global'),
        updateId: ctx.update?.update_id ?? 'unknown',
        userId: ctx.from?.id ?? 'unknown',
    };
}

async function handleMessage(ctx, text, { runParentAgent, conversationStore }) {
    const { chatId, updateId } = describeUpdate(ctx);
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';
    const startedAt = Date.now();

    console.log(`[message] from user=${username} chatId=${chatId} updateId=${updateId}`);

    const promptWithContext = conversationStore.buildPrompt({ chatId, currentInput: text });
    console.log('promptWithContext', promptWithContext);

    try {
        console.log(`[claude] runParentAgent started chatId=${chatId} updateId=${updateId}`);
        const { output } = await runParentAgent({
            chatId,
            prompt: promptWithContext,
            source: 'telegram',
        });
        console.log(
            `[claude] succeeded chatId=${chatId} updateId=${updateId} outputLength=${output.length} durationMs=${Date.now() - startedAt}`,
        );
        conversationStore.appendTurn({
            assistantMessage: output,
            chatId,
            source: 'telegram',
            userMessage: text,
        });
        await ctx.reply(markdownToTelegramHtml(output), { parse_mode: 'HTML' });
    } catch (error) {
        console.error(
            `[claude] failed chatId=${chatId} updateId=${updateId} durationMs=${Date.now() - startedAt} error=${error.message}`,
            error.stack ?? '',
        );
        await ctx.reply('Something went wrong: ' + error.message);
    }
}

function setupBot(telegramBot, { runParentAgent, conversationStore, transcribeVoice }) {
    telegramBot.catch((error, ctx) => {
        const { chatId, updateId, userId } = describeUpdate(ctx);
        const prefix = isHandlerTimeoutError(error) ? '[telegram] handler timeout' : '[telegram] unhandled bot error';
        console.error(
            `${prefix} updateId=${updateId} chatId=${chatId} userId=${userId} error=${error.message}`,
            error.stack ?? '',
        );
        if (isHandlerTimeoutError(error)) {
            console.error('[telegram] timed-out handler may still be running because Telegraf does not cancel the pending work.');
        }
    });

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

export { describeUpdate, handleMessage, isHandlerTimeoutError, setupBot };
