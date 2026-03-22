// src/bot-factory.js
const { message } = require('telegraf/filters');
const {
  createClaudeCommandRunner,
  createCommandHandler,
  createClaudeConversationStore,
} = require('../bot');
const { loadAllBotConfigs: defaultLoadAllBotConfigs } = require('./bot-config-loader');
const { createTranscriber } = require('./transcribe');
const { computeDateContext, injectContext } = require('./date-context');

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

function checkDailyReset(chatId, { activeBotMap, sessionDateMap }) {
  const { today } = computeDateContext();
  if (sessionDateMap.get(chatId) !== today) {
    activeBotMap.delete(chatId);
    sessionDateMap.delete(chatId);
    return true;
  }
  return false;
}

async function routeMessageToActiveBot(ctx, text, { activeBotMap, botRunnerMap, conversationStore }) {
  const chatId = String(ctx.chat?.id ?? 'global');
  const botName = activeBotMap.get(chatId);

  if (!botName) {
    await ctx.reply('You said: ' + text);
    return;
  }

  console.log(`[claude] continuing conversation via --continue bot=${botName}`);

  const runClaudeCommand = botRunnerMap.get(botName);

  try {
    const { output, sessionId } = await runClaudeCommand({ prompt: text, resume: true });
    console.log(`[claude] reply succeeded sessionId=${sessionId} outputLength=${output.length}`);
    conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: text });
    await ctx.reply(output, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`[claude] reply failed error=${error.message}`);
    await ctx.reply('Claude command failed: ' + error.message);
  }
}

async function startDefaultSession(ctx, text, { activeBotMap, sessionDateMap, botRunnerMap, conversationStore, defaultConfig }) {
  const chatId = String(ctx.chat?.id ?? 'global');

  if (!defaultConfig) {
    await ctx.reply('No bots configured.');
    return;
  }

  const { today, prompt } = buildContextPrompt(text);

  console.log(`[claude] starting new default session bot=${defaultConfig.name}`);

  const runClaudeCommand = botRunnerMap.get(defaultConfig.name);
  try {
    const { output, sessionId } = await runClaudeCommand({ prompt, resume: false });
    console.log(`[claude] default session started sessionId=${sessionId} outputLength=${output.length}`);
    activeBotMap.set(chatId, defaultConfig.name);
    sessionDateMap.set(chatId, today);
    conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
    await ctx.reply(output, { parse_mode: 'HTML' });
  } catch (error) {
    console.error(`[claude] default session failed error=${error.message}`);
    await ctx.reply('Claude command failed: ' + error.message);
  }
}

function createMultiBotTextMessageHandler({ activeBotMap, sessionDateMap, botRunnerMap, conversationStore, defaultConfig }) {
  return async function handleTextMessage(ctx) {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';

    const wasReset = checkDailyReset(chatId, { activeBotMap, sessionDateMap });
    const botName = activeBotMap.get(chatId);

    console.log(`[message] text received from user=${username} chatId=${chatId} activeBot=${botName ?? 'none'}${wasReset ? ' (daily reset)' : ''}`);

    if (!botName) {
      await startDefaultSession(ctx, ctx.message.text, { activeBotMap, sessionDateMap, botRunnerMap, conversationStore, defaultConfig });
      return;
    }

    await routeMessageToActiveBot(ctx, ctx.message.text, { activeBotMap, botRunnerMap, conversationStore });
  };
}

function registerBot(telegramBot, config, { conversationStore, activeBotMap, sessionDateMap, spawnCommand } = {}) {
  const runClaudeCommand = createClaudeCommandRunner({
    model: config.model,
    tools: config.tools,
    directories: config.directories,
    systemPrompt: config.systemPrompt,
    timeoutMs: config.timeoutMs,
    spawnCommand,
  });

  const commandPromises = [];
  for (const command of config.commands) {
    const handler = createCommandHandler({
      commandName: command.name,
      defaultPrompt: command.defaultPrompt,
      conversationStore,
      runClaudeCommand,
      botName: config.name,
      activeBotMap,
      sessionDateMap,
    });
    const result = telegramBot.command(command.name, handler);
    if (result && typeof result.then === 'function') {
      commandPromises.push(result);
    }
  }
  Promise.all(commandPromises).catch((err) => console.error(`[startup] command registration failed error=${err.message}`));

  return { runClaudeCommand };
}

function createBotFromDirectory(telegramBot, botsDir, opts = {}) {
  const loadAllBotConfigs = opts.loadAllBotConfigs ?? defaultLoadAllBotConfigs;
  const conversationStore = opts.conversationStore ?? createClaudeConversationStore();
  const activeBotMap = new Map();
  const sessionDateMap = new Map(); // chatId → 'YYYY-MM-DD'
  const botRunnerMap = new Map();
  const transcribeVoice = opts.transcribeVoice ?? createTranscriber();

  const botConfigs = loadAllBotConfigs(botsDir, opts);
  console.log(`[startup] loaded ${botConfigs.length} bot config(s): ${botConfigs.map((c) => c.name).join(', ')}`);

  const defaultConfig = botConfigs[0] ?? null;

  for (const config of botConfigs) {
    console.log(`[startup] registering bot="${config.name}" commands=[${config.commands.map((c) => '/' + c.name).join(', ')}]`);
    const { runClaudeCommand } = registerBot(telegramBot, config, {
      conversationStore,
      activeBotMap,
      sessionDateMap,
      spawnCommand: opts.spawnCommand,
    });
    botRunnerMap.set(config.name, runClaudeCommand);
  }

  telegramBot.on(
    message('text'),
    createMultiBotTextMessageHandler({ activeBotMap, sessionDateMap, botRunnerMap, conversationStore, defaultConfig })
  );

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

    const wasReset = checkDailyReset(chatId, { activeBotMap, sessionDateMap });
    if (wasReset) {
      console.log(`[message] daily reset for chatId=${chatId}`);
    }

    const activeBotName = activeBotMap.get(chatId);

    if (activeBotName) {
      await routeMessageToActiveBot(ctx, transcript, { activeBotMap, botRunnerMap, conversationStore });
      return;
    }

    await startDefaultSession(ctx, transcript, { activeBotMap, sessionDateMap, botRunnerMap, conversationStore, defaultConfig });
  });

  telegramBot.start((ctx) => ctx.reply('Welcome'));
  telegramBot.help((ctx) => {
    const lines = botConfigs.flatMap((c) =>
      c.commands.map((cmd) => `/${cmd.name} — ${cmd.description}`)
    );
    return ctx.reply(lines.length ? lines.join('\n') : 'No commands registered.');
  });

  return telegramBot;
}

module.exports = {
  createBotFromDirectory,
  createMultiBotTextMessageHandler,
  registerBot,
};
