import { OpenAI, toFile } from 'openai';

function createTranscriber({ apiKey } = {}) {
  let openai;

  return async function transcribeVoice(ctx) {
    if (!openai) {
      openai = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
    }
    const fileId = ctx.message.voice.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Failed to download voice file: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const file = await toFile(buffer, 'voice.ogg', { type: 'audio/ogg' });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    return transcription.text;
  };
}

export { createTranscriber };
