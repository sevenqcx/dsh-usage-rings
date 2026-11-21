import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUsageByModelEvent,
  initUsageByModel,
  usageOfEvent,
  viewUsageByModel,
} from './usage-by-model.js';

const header = (provider, model) => ({
  type: 'request/header',
  data: { header: { config: { provider, model } }, reason: 'initial' },
});
const settled = (turn, step, usage) => ({ type: 'assistant/message', data: { turn, step, usage, message: { content: [] } } });
const fold = (events) => events.reduce(applyUsageByModelEvent, initUsageByModel());

test('attributes usage to the route recorded by the latest request header', () => {
  const state = fold([
    header('magpie-responses', 'codex/gpt-5'),
    settled(1, 1, { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 }),
    header('antigravity', 'gemini-3-pro'),
    settled(1, 2, { inputTokens: 200, outputTokens: 20, cacheReadTokens: 50 }),
  ]);
  const view = viewUsageByModel(state);
  assert.equal(view.current.provider, 'antigravity');
  assert.equal(view.current.model, 'gemini-3-pro');
  assert.equal(view.models.length, 2);
  const byModel = Object.fromEntries(view.models.map((entry) => [entry.model, entry]));
  assert.equal(byModel['codex/gpt-5'].tokens, 110);
  assert.equal(byModel['gemini-3-pro'].tokens, 270);
  assert.equal(byModel['gemini-3-pro'].cacheReadTokens, 50);
  assert.equal(view.total, 380);
  assert.equal(view.models[0].model, 'gemini-3-pro');
});

test('replaces a repeated sample for the same step instead of double counting', () => {
  const view = viewUsageByModel(fold([
    header('p', 'm'),
    settled(2, 3, { inputTokens: 100, outputTokens: 10 }),
    settled(2, 3, { inputTokens: 140, outputTokens: 12 }),
  ]));
  assert.equal(view.models.length, 1);
  assert.equal(view.models[0].uncachedInputTokens, 140);
  assert.equal(view.models[0].outputTokens, 12);
  assert.equal(view.models[0].steps, 1);
});

test('a retried step counts the next attempt on its own', () => {
  const view = viewUsageByModel(fold([
    header('p', 'm'),
    settled(4, 1, { inputTokens: 100, outputTokens: 10 }),
    { type: 'llm/retry-started', data: { turn: 4, step: 1 } },
    settled(4, 1, { inputTokens: 30, outputTokens: 2 }),
  ]));
  // token-meter semantics: the retried attempt is added, not substituted.
  assert.equal(view.models[0].tokens, 142);
  assert.equal(view.models[0].steps, 2);
  assert.equal(view.total, 142);
});

test('falls back to the usage chunk embedded in the stream', () => {
  const event = {
    type: 'assistant/attempt',
    data: {
      turn: 1,
      step: 1,
      stream: [
        { type: 'chunk', chunk: { type: 'text', text: 'hi' } },
        { type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } } },
      ],
    },
  };
  assert.deepEqual(usageOfEvent(event), { inputTokens: 7, outputTokens: 3 });
  const view = viewUsageByModel(fold([event]));
  assert.equal(view.models[0].provider, '未知');
  assert.equal(view.models[0].tokens, 10);
});

test('keeps separate routes for providers whose model ids contain slashes', () => {
  const view = viewUsageByModel(fold([
    header('magpie-responses', 'codex/gpt-5'),
    settled(1, 1, { inputTokens: 5, outputTokens: 5 }),
    header('deepseek-account', 'codex/gpt-5'),
    settled(1, 2, { inputTokens: 1, outputTokens: 1 }),
  ]));
  assert.equal(view.models.length, 2);
  assert.deepEqual(
    view.models.map((entry) => `${entry.provider}|${entry.model}`).sort(),
    ['deepseek-account|codex/gpt-5', 'magpie-responses|codex/gpt-5'],
  );
});

test('ignores events without provider usage and returns the same reference', () => {
  const state = initUsageByModel();
  assert.equal(applyUsageByModelEvent(state, { type: 'turn/start', data: { turn: 1 } }), state);
  assert.equal(applyUsageByModelEvent(state, settled(1, 1, undefined)), state);
  assert.equal(applyUsageByModelEvent(state, { type: 'llm/retry-started', data: { turn: 1, step: 1 } }), state);
  assert.equal(viewUsageByModel(state).models.length, 0);
  assert.equal(viewUsageByModel(state).current, null);
});

test('records group/* settlements on state without exposing raw groupSteps in wire view', () => {
  const state = fold([
    header('magpie', 'group/smart-split'),
    { type: 'assistant/attempt', time: 1000, data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 2 } } },
    { type: 'assistant/message', time: 1200, data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20 } } },
  ]);
  assert.equal(state.groupSteps.length, 1);
  assert.deepEqual(state.groupSteps[0], {
    req: 'group/smart-split',
    time: 1200,
    in: 10,
    out: 5,
    cacheRead: 20,
    cacheWrite: 0,
  });
  const view = viewUsageByModel(state);
  assert.equal('groupSteps' in view, false);
});
