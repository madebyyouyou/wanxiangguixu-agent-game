import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../web/src/core/GameState.js';
import { AgentClient, API_CONFIG } from '../web/src/core/AgentClient.js';

test('public config is offline and returns a fallback response without fetching', async () => {
  assert.equal(API_CONFIG.enabled, false);
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error('network should not be used');
  };

  try {
    const state = new GameState({ emit() {} });
    state.persona = 'queshe';
    const client = new AgentClient(state);
    const result = await client.ask({ playerInput: '在吗' });

    assert.equal(result.offline, true);
    assert.equal(typeof result.text, 'string');
    assert.ok(result.text.length > 0);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('real-call history keeps only the latest 12 compact messages', async () => {
  const state = new GameState({ emit() {} });
  state.persona = 'queshe';
  const client = new AgentClient(state);
  client.history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `turn-${index}`,
  }));
  client._post = async () => new Response(JSON.stringify({
    data: {
      choices: [{ message: { content: '<state>平静</state>收到' } }],
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await client._callApi({ playerInput: 'new turn' });

  assert.equal(client.history.length, 12);
  assert.equal(client.history.at(-1).content, '收到');
});

test('self-deployed provider failure falls back and opens the circuit', async () => {
  const state = new GameState({ emit() {} });
  state.persona = 'queshe';
  const client = new AgentClient(state, {
    ...API_CONFIG,
    enabled: true,
    downCooldown: 1000,
  });
  let called = 0;
  client._callApi = async () => {
    called += 1;
    throw new TypeError('Failed to fetch');
  };
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const result = await client.ask({ playerInput: 'hello' });

    assert.equal(called, 1);
    assert.equal(result.offline, true);
    assert.equal(client.offlineNow(), true);
  } finally {
    console.warn = originalWarn;
  }
});
