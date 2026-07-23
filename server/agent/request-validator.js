'use strict';

const LIMITS = Object.freeze({
  maxMessages: 13,
  maxContent: 12000,
  maxTotal: 48000,
});
const PERSONAS = new Set(['queshe', 'wuyou', 'shuheng']);
const ROLES = new Set(['user', 'assistant']);

function fail(code, status = 400) {
  return { ok: false, code, status };
}

function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('invalid_body');
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1) {
    return fail('invalid_messages');
  }
  if (body.messages.length > LIMITS.maxMessages) {
    return fail('too_many_messages', 413);
  }
  if (!PERSONAS.has(body.persona)) {
    return fail('invalid_persona');
  }
  if (body.reviewPack !== undefined && typeof body.reviewPack !== 'boolean') {
    return fail('invalid_review_pack');
  }

  let total = 0;
  const messages = [];
  for (const message of body.messages) {
    if (!message || typeof message !== 'object' || !ROLES.has(message.role)) {
      return fail('invalid_role');
    }
    if (typeof message.content !== 'string' || message.content.length === 0) {
      return fail('invalid_content');
    }
    if (message.content.length > LIMITS.maxContent) {
      return fail('message_too_long', 413);
    }

    total += message.content.length;
    if (total > LIMITS.maxTotal) {
      return fail('conversation_too_long', 413);
    }
    messages.push({ role: message.role, content: message.content });
  }

  return {
    ok: true,
    value: {
      messages,
      persona: body.persona,
      reviewPack: body.reviewPack === true,
    },
  };
}

module.exports = { LIMITS, validateChatRequest };
