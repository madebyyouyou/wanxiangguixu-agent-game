import test from 'node:test';
import assert from 'node:assert/strict';
import promptBuilder from '../server/agent/prompt-builder.js';

const { buildSystemMessages, loadPrompts } = promptBuilder;
const prompts = {
  base: 'BASE',
  queshe: 'QUESHE',
  wuyou: 'WUYOU',
  shuheng: 'SHUHENG',
  review: 'TRUTH',
};

test('server prepends base and selected persona', () => {
  assert.deepEqual(buildSystemMessages('wuyou', false, prompts), [
    { role: 'system', content: 'BASE\n\n========\n\nWUYOU' },
  ]);
});

test('review truth is a second server-owned system message', () => {
  assert.equal(
    buildSystemMessages('queshe', true, prompts)[1].content,
    '【复盘真相包】\nTRUTH',
  );
});

test('loads every server-owned runtime prompt from disk', () => {
  const loaded = loadPrompts();

  assert.deepEqual(Object.keys(loaded), [
    'base',
    'queshe',
    'wuyou',
    'shuheng',
    'review',
  ]);
  assert.ok(Object.values(loaded).every((prompt) => prompt.length > 100));
});
