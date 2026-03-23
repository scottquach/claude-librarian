// src/bot-setup.js
const { message } = require('telegraf/filters');
const { computeDateContext, injectContext } = require('./date-context');
const { markdownToTelegramHtml } = require('./telegram-format');

function buildContextPrompt(text) {
  const { today, weekNum, year } = computeDateContext();
  const weekNumPadded = String(weekNum).padStart(2, '0');
  const weeklyNote = `Journal/${year}-W${weekNumPadded}.md`;
  const monthlyNote = `Journal/${today.slice(0, 7)}.md`;
  const dayHeader = `## [[${today}]]`;
  return {
    today,
    prompt: injectContext(text, { day_header: dayHeader, weekly_note: weeklyNote, monthly_note: monthlyNote }),
  };
}

async function handleMessage(ctx, text, { runClaudeCommand, conversationStore, sessionIdMap }) {
  const chatId = String(ctx.chat?.id ?? 'global');
  const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

  console.log(`[message] from user=${username} chatId=${chatId}`);

  const { prompt } = buildContextPrompt(text);
  const existingSessionId = sessionIdMap.get(chatId) ?? null;

  try {
    const { output, sessionId } = await runClaudeCommand({ prompt, sessionId: existingSessionId });
    console.log(`[claude] succeeded sessionId=${sessionId} outputLength=${output.length}`);
    sessionIdMap.set(chatId, sessionId);
    conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
    await ctx.reply(markdownToTelegramHtml(output), { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`[claude] failed error=${error.message}`);
    await ctx.reply('Something went wrong: ' + error.message);
  }
}

function setupBot(telegramBot, { runClaudeCommand, conversationStore, sessionIdMap, transcribeVoice }) {
  telegramBot.on(message('text'), (ctx) => {
    return handleMessage(ctx, ctx.message.text, { runClaudeCommand, conversationStore, sessionIdMap });
  });

  telegramBot.on(message('voice'), async (ctx) => {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';
    console.log(`[message] voice received from user=${username} chatId=${chatId}`);

    let transcript;
    try {
      transcript = await transcribeVoice(ctx);
      console.log(`[whisper] transcribed voice message="${transcript.slice(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
    } catch (error) {
      console.error(`[whisper] transcription failed error=${error.message}`);
      await ctx.reply('Failed to transcribe voice message: ' + error.message);
      return;
    }

    await handleMessage(ctx, transcript, { runClaudeCommand, conversationStore, sessionIdMap });
  });

  telegramBot.start((ctx) => ctx.reply('Welcome'));
  telegramBot.help((ctx) => ctx.reply('Send me a message and I\'ll log it to your journal.'));
}

module.exports = { setupBot, buildContextPrompt };
