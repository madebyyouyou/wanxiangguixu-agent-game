import test from 'node:test';
import assert from 'node:assert/strict';
import providerModule from '../server/agent/provider.js';

const { createDeepSeekProvider } = providerModule;

test('missing server API key fails lazily with a stable error code', async () => {
  const provider = createDeepSeekProvider({});

  await assert.rejects(
    provider([{ role: 'user', content: 'hello' }]),
    (error) => error.code === 'missing_api_key',
  );
});
