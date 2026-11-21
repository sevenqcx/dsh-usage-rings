import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from './index.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

function fakeContext() {
  const registered = []
  const quotas = []
  const effects = []
  const ctx = {
    inject(names, callback) {
      const scope = {
        effect(factory, label) {
          effects.push(label)
          const dispose = factory()
          return () => { if (typeof dispose === 'function') dispose() }
        },
        logger: { error() {} },
        ...(names.includes('sessionProjections') ? {
          sessionProjections: { register: async (definition) => { registered.push(definition); return { dispose: async () => {} } } },
        } : {}),
        ...(names.includes('connection') ? {
          connection: { fetch: { register: (route) => { quotas.push(route); return { dispose() {} } } } },
        } : {}),
      }
      const dispose = callback(scope)
      return () => { if (typeof dispose === 'function') dispose() }
    },
  }
  return { ctx, registered, quotas, effects }
}

test('the host registers the per-model usage projection ready for the registry', async () => {
  const { ctx, registered, effects } = fakeContext()
  apply(ctx)
  await tick()
  assert.equal(registered.length, 1)
  const definition = registered[0]
  assert.equal(definition.key, 'usageByModel')
  assert.equal(definition.stateVersion, 2)
  // The registry parses state and view; both must round-trip the unit's own data.
  const state = definition.stateSchema.parse(definition.init())
  const next = definition.apply(state, {
    type: 'request/header',
    data: { header: { config: { provider: 'magpie-responses', model: 'codex/gpt-6.1-terra' } }, reason: 'initial' },
  })
  const settled = definition.apply(next, {
    type: 'assistant/message',
    data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 4 }, message: { content: [] } },
  })
  const view = definition.wire.viewSchema.parse(definition.wire.view(settled))
  assert.deepEqual(view.current, { provider: 'magpie-responses', model: 'codex/gpt-6.1-terra' })
  assert.equal(view.total, 14)
  assert.equal(view.models[0].model, 'codex/gpt-6.1-terra')
  assert.ok(effects.some(label => label.includes('usage by model projection')))
})

test('the quota and magpie-routes endpoints are registered alongside the projection', async () => {
  const { ctx, quotas } = fakeContext()
  apply(ctx)
  await tick()
  assert.equal(quotas.length, 5)
  assert.deepEqual(quotas.map(q => q.path).sort(), ['/api/dsh-usage-rings/magpie-routes', '/api/dsh-usage-rings/reset-cards', '/api/dsh-usage-rings/status', '/api/dsh-usage-rings/use-reset-card', '/api/dsh-usage-rings/workbuddy-checkin'])
})

test('reset card RPCs relay account selection and errors through their envelope', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method })
    return options.method === 'GET'
      ? Response.json({ object: 'list', data: [{ provider: 'codex', user: 'alice', resets: { count: 1, until: null, each: [{ id: 'c1', until: null }] } }] })
      : Response.json({ code: 'reset', windows: 1 })
  }
  try {
    const { ctx, quotas } = fakeContext()
    apply(ctx)
    const invoke = async (path, body) => (await quotas.find(route => route.path.endsWith(path)).fetch(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }))).json()
    const cards = await invoke('/reset-cards', { rpcId: 'read' })
    assert.equal(cards.rpcId, 'read')
    assert.equal(cards.result.value.accounts[0].user, 'alice')
    const bad = await invoke('/use-reset-card', { rpcId: 'bad', user: 'alice', credit: 'other' })
    assert.equal(bad.result.value.ok, false)
    assert.equal(calls.length, 1)
    const used = await invoke('/use-reset-card', { rpcId: 'use', user: 'alice', credit: 'c1' })
    assert.equal(used.rpcId, 'use')
    assert.equal(used.result.value.ok, true)
    assert.equal(calls.length, 2)
  } finally { globalThis.fetch = original }
})
