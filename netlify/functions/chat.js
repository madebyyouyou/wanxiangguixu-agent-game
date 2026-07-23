'use strict';

const { loadPrompts } = require('../../server/agent/prompt-builder.js');
const { createDeepSeekProvider } = require('../../server/agent/provider.js');
const { createRelayService } = require('../../server/agent/relay-service.js');

let service;

function getService() {
  service ||= createRelayService({
    prompts: loadPrompts(),
    provider: createDeepSeekProvider(),
  });
  return service;
}

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const json = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const result = await getService()(body);
  return json(result.status, result.body);
};
