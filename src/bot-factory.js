// src/bot-factory.js
const { message } = require('telegraf/filters');
const {
  createClaudeCommandRunner,
  createCommandHandler,
  createClaudeConversationStore,
} = require('../bot');
const { loadAllBotConfigs: defaultLoadAllBotConfigs } = require('./bot-config-loader');
const { createTranscriber } = require('./transcribe');

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

function createMultiBotTextMessageHandler({ activeBotMap, botRunnerMap, conversationStore }) {
  return async function handleTextMessage(ctx) {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';
    const botName = activeBotMap.get(chatId);

    console.log(`[message] text received from user=${username} chatId=${chatId} activeBot=${botName ?? 'none'}`);

    await routeMessageToActiveBot(ctx, ctx.message.text, { activeBotMap, botRunnerMap, conversationStore });
  };
}

function registerBot(telegramBot, config, { conversationStore, activeBotMap, spawnCommand } = {}) {
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
    });
    const result = telegramBot.command(command.name, handler);
    if (result && typeof result.then === 'function') {
      commandPromises.push(result);
    }
  }
  Promise.all(commandPromises);

  return { runClaudeCommand };
}

function createBotFromDirectory(telegramBot, botsDir, opts = {}) {
  const loadAllBotConfigs = opts.loadAllBotConfigs ?? defaultLoadAllBotConfigs;
  const conversationStore = opts.conversationStore ?? createClaudeConversationStore();
  const activeBotMap = new Map();
  const botRunnerMap = new Map();
  const transcribeVoice = opts.transcribeVoice ?? createTranscriber();

  const botConfigs = loadAllBotConfigs(botsDir, opts);
  console.log(`[startup] loaded ${botConfigs.length} bot config(s): ${botConfigs.map((c) => c.name).join(', ')}`);

  for (const config of botConfigs) {
    console.log(`[startup] registering bot="${config.name}" commands=[${config.commands.map((c) => '/' + c.name).join(', ')}]`);
    const { runClaudeCommand } = registerBot(telegramBot, config, {
      conversationStore,
      activeBotMap,
      spawnCommand: opts.spawnCommand,
    });
    botRunnerMap.set(config.name, runClaudeCommand);
  }

  telegramBot.on(
    message('text'),
    createMultiBotTextMessageHandler({ activeBotMap, botRunnerMap, conversationStore })
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

    const activeBotName = activeBotMap.get(chatId);

    if (activeBotName) {
      await routeMessageToActiveBot(ctx, transcript, { activeBotMap, botRunnerMap, conversationStore });
      return;
    }

    // No active session — start a new one with the default (first) bot
    const defaultConfig = botConfigs[0];
    if (!defaultConfig) {
      await ctx.reply('No bots configured.');
      return;
    }

    const now = new Date();
    const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = localDate(now);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = localDate(weekStart);
    const jan1 = new Date(weekStart.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((weekStart - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const weekNumPadded = String(weekNum).padStart(2, '0');
    const year = weekStart.getFullYear();
    const weeklyNote = `Journal/${year}-W${weekNumPadded}.md`;
    const monthlyNote = `Journal/${today.slice(0, 7)}.md`;
    const dayHeader = `## [[${today}]]`;
    const prompt = `[Context: today is ${today}, week starts ${weekStartStr}, week number ${weekNum}, day_header="${dayHeader}", weekly_note="${weeklyNote}", monthly_note="${monthlyNote}"]\n\n${transcript}`;

    console.log(`[claude] starting new session via voice bot=${defaultConfig.name}`);

    const runClaudeCommand = botRunnerMap.get(defaultConfig.name);
    try {
      const { output, sessionId } = await runClaudeCommand({ prompt, resume: false });
      console.log(`[claude] voice session started sessionId=${sessionId} outputLength=${output.length}`);
      activeBotMap.set(chatId, defaultConfig.name);
      conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: prompt });
      await ctx.reply(output, { parse_mode: 'HTML' });
    } catch (error) {
      console.error(`[claude] voice session failed error=${error.message}`);
      await ctx.reply('Claude command failed: ' + error.message);
    }
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
