import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../web/src/core/GameState.js';
import { AgentClient } from '../web/src/core/AgentClient.js';

const bus = { emit() {} };

test('purchase remains the only deterministic state mutation path', () => {
  const state = new GameState(bus);
  const client = new AgentClient(state);
  const before = state.points;

  const result = client.applyAction({
    type: 'purchase',
    item_id: 'ITEM_MATCH',
    qty: 1,
  });

  assert.equal(result.ok, true);
  assert.ok(state.points < before);
  assert.equal(state.hasItem('ITEM_MATCH'), true);
});

test('unknown model actions do not change points or inventory', () => {
  const state = new GameState(bus);
  const client = new AgentClient(state);
  const before = JSON.stringify(state.toJSON());

  assert.equal(client.applyAction({ type: 'set_points', value: 999 }), null);
  assert.equal(JSON.stringify(state.toJSON()), before);
});

test('insufficient points is rejected by GameState', () => {
  const state = new GameState(bus);
  state.points = 0;

  const result = state.purchase('ITEM_REWIND_CLOCK', 1);

  assert.equal(result.ok, false);
  assert.match(result.reason, /积分不足/);
});
