import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentResponse } from '../web/src/agent/responseParser.js';

test('parses state and a closed purchase action', () => {
  assert.deepEqual(
    parseAgentResponse(
      '<state>兴奋</state>可以买 <action>{"type":"purchase","item_id":"ITEM_NOTE","qty":1}</action>',
    ),
    {
      state: '兴奋',
      text: '可以买',
      action: { type: 'purchase', item_id: 'ITEM_NOTE', qty: 1 },
    },
  );
});

test('tolerates full-width punctuation and a missing closing tag', () => {
  const parsed = parseAgentResponse(
    '<state>平静>收到 <action>{“type”：“insight”，“key”：“T09”}',
  );

  assert.equal(parsed.state, '平静');
  assert.deepEqual(parsed.action, { type: 'insight', key: 'T09' });
  assert.equal(parsed.text, '收到');
});

test('malformed action is removed from visible text but not executed', () => {
  const parsed = parseAgentResponse('回答 <action>{not-json}</action>');

  assert.equal(parsed.text, '回答');
  assert.equal(parsed.action, null);
});
