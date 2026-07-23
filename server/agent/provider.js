'use strict';

const OpenAI = require('openai');

function createDeepSeekProvider(env = process.env) {
  let client;

  return async function provide(messages) {
    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      const error = new Error('missing_api_key');
      error.code = 'missing_api_key';
      throw error;
    }

    client ||= new OpenAI({
      apiKey,
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: Number(env.MODEL_TIMEOUT_MS || 9000),
      maxRetries: 0,
    });

    return client.chat.completions.create({
      messages,
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      temperature: Number(env.TEMPERATURE || 0.7),
      max_tokens: Number(env.MAX_TOKENS || 800),
      top_p: Number(env.TOP_P || 0.9),
      stream: false,
    });
  };
}

module.exports = { createDeepSeekProvider };
