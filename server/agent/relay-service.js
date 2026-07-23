'use strict';

const { validateChatRequest } = require('./request-validator.js');
const { buildSystemMessages } = require('./prompt-builder.js');

function createRelayService({ prompts, provider }) {
  return async function relay(body) {
    const checked = validateChatRequest(body);
    if (!checked.ok) {
      return {
        status: checked.status,
        body: { error: checked.code },
      };
    }

    const { messages, persona, reviewPack } = checked.value;
    try {
      const systemMessages = buildSystemMessages(persona, reviewPack, prompts);
      const data = await provider([...systemMessages, ...messages]);
      return { status: 200, body: { ok: true, data } };
    } catch (error) {
      if (error && error.code === 'missing_api_key') {
        return {
          status: 503,
          body: { error: 'model_not_configured' },
        };
      }
      return {
        status: 502,
        body: { error: 'model_provider_error' },
      };
    }
  };
}

module.exports = { createRelayService };
