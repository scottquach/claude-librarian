// src/bot-factory.js
const { message } = require('telegraf/filters');
const {
  createClaudeCommandRunner,
  createCommandHandler,
  createClaudeConversationStore,
} = require('../bot');
const { loadAllBotConfigs: defaultLoadAllBotConfigs } = require('./bot-config-loader');

function createMultiBotTextMessageHandler({ activeBotMap, botRunnerMap, conversationStore }) {
  return async function handleTextMessage(ctx) {
    const chatId = String(ctx.chat?.id ?? 'global');
    const username = ctx.from?.username ?? ctx.from?.id ?? 'unknown';
    const botName = activeBotMap.get(chatId);

    console.log(`[message] text received from user=${username} chatId=${chatId} activeBot=${botName ?? 'none'}`);

    if (!botName) {
      await ctx.reply('You said: ' + ctx.message.text);
      return;
    }

    console.log(`[claude] continuing conversation via --continue bot=${botName}`);

    const runClaudeCommand = botRunnerMap.get(botName);

    try {
      const { output, sessionId } = await runClaudeCommand({ prompt: ctx.message.text, resume: true });
      console.log(`[claude] reply succeeded sessionId=${sessionId} outputLength=${output.length}`);
      conversationStore.appendExchange({ assistantMessage: output, sessionId, userMessage: ctx.message.text });
      await ctx.reply(output, { parse_mode: 'HTML' });
    } catch (error) {
      console.error(`[claude] reply failed error=${error.message}`);
      await ctx.reply('Claude command failed: ' + error.message);
    }
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
