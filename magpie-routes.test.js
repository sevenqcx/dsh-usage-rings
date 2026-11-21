import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { foldRouteLine, readMagpieRoutes, viewRoutes } from './magpie-routes.js';

const line = (over) => JSON.stringify({
  route_id: 1,
  t: '2026-11-21T19:00:00+08:00',
  agent: 'dsh',
  provider: 'agy-cli',
  model: 'gemini-4-hydrogen',
  req: 'group/smart-split',
  served: 'gemini-4-hydrogen',
  in: 10,
  out: 4,
  cache_read: 2,
  cache_write: 0,
  session: '9094ed7c-c709-4e72-aa27-b390ef3fb859',
  ...over,
});

test('folds a group route into per-concrete-model usage', () => {
  const groups = new Map();
  foldRouteLine(groups, JSON.parse(line({})), '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  const view = viewRoutes(groups);
  const group = view['group/smart-split'];
  assert.ok(group);
  assert.equal(group.models.length, 1);
  assert.equal(group.models[0].provider, 'agy-cli');
  assert.equal(group.models[0].model, 'gemini-4-hydrogen');
  assert.equal(group.models[0].tokens, 16);
  assert.equal(group.models[0].calls, 1);
  assert.equal(group.total, 16);
});

test('accumulates several calls and keeps concrete models separate', () => {
  const groups = new Map();
  const session = '9094ed7c-c709-4e72-aa27-b390ef3fb859';
  foldRouteLine(groups, JSON.parse(line({ served: 'gemini-4-hydrogen', model: 'gemini-4-hydrogen', in: 10 })), session);
  foldRouteLine(groups, JSON.parse(line({ served: 'gemini-4-hydrogen', model: 'gemini-4-hydrogen', in: 20 })), session);
  foldRouteLine(groups, JSON.parse(line({ provider: 'codex', served: 'gpt-6.1-terra', model: 'gpt-6.1-terra', in: 100 })), session);
  const view = viewRoutes(groups);
  const models = view['group/smart-split'].models;
  assert.equal(models.length, 2);
  const byModel = Object.fromEntries(models.map((m) => [m.model, m]));
  assert.equal(byModel['gemini-4-hydrogen'].calls, 2);
  assert.equal(byModel['gemini-4-hydrogen'].tokens, 42);
  assert.equal(byModel['gpt-6.1-terra'].tokens, 106);
  // sorted by tokens, largest first
  assert.equal(models[0].model, 'gpt-6.1-terra');
});

test('matches session with or without the session- prefix', () => {
  const groups = new Map();
  foldRouteLine(groups, JSON.parse(line({ session: 'session-9094ed7c-c709-4e72-aa27-b390ef3fb859' })), '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  foldRouteLine(groups, JSON.parse(line({ session: '9094ed7c-c709-4e72-aa27-b390ef3fb859' })), 'session-9094ed7c-c709-4e72-aa27-b390ef3fb859');
  assert.equal(viewRoutes(groups)['group/smart-split'].models[0].calls, 2);
});

test('ignores non-group routes and other sessions', () => {
  const groups = new Map();
  foldRouteLine(groups, JSON.parse(line({ req: 'codex/gpt-6.1-terra' })), '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  foldRouteLine(groups, JSON.parse(line({ session: 'other-session-id' })), '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  assert.deepEqual(viewRoutes(groups), {});
});

test('tolerates missing served and malformed rows', () => {
  const groups = new Map();
  foldRouteLine(groups, null, '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  foldRouteLine(groups, JSON.parse(line({ served: undefined, model: undefined })), '9094ed7c-c709-4e72-aa27-b390ef3fb859');
  const view = viewRoutes(groups);
  assert.equal(view['group/smart-split'].models[0].model, '未记录');
});

test('readMagpieRoutes falls back to token-signature + time matching when usage rows lack session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-routes-'));
  const usagePath = join(dir, 'usage.jsonl');
  try {
    const startMs = Date.parse('2026-11-21T22:00:00.000+08:00');
    const rows = [
      line({ session: undefined, t: '2026-11-21T22:00:00.000+08:00', ms: 5000, in: 100, out: 25, cache_read: 400, cache_write: 0, served: 'gemini-4-hydrogen', provider: 'agy-cli' }),
      // Unrelated session at a different time with different tokens
      line({ session: undefined, t: '2026-11-21T21:00:00.000+08:00', ms: 1000, in: 999, out: 99, cache_read: 0, cache_write: 0, served: 'glm-5.3-flash', provider: 'workbuddy' }),
    ];
    await writeFile(usagePath, `${rows.join('\n')}\n`, 'utf8');
    const result = await readMagpieRoutes('session-5fa56803', {
      usagePath,
      groupSteps: [
        { req: 'group/smart-split', time: startMs + 5100, in: 100, out: 25, cacheRead: 400, cacheWrite: 0 },
      ],
    });
    assert.equal(result.groups['group/smart-split'].models.length, 1);
    assert.equal(result.groups['group/smart-split'].models[0].model, 'gemini-4-hydrogen');
    assert.deepEqual(result.lastServed, { req: 'group/smart-split', provider: 'agy-cli', model: 'gemini-4-hydrogen' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
