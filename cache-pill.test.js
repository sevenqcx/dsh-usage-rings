import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const textOf = node => node == null || typeof node === 'boolean'
  ? ''
  : typeof node !== 'object'
    ? String(node)
    : (node.children || []).map(textOf).join(' ')

const USAGE = {
  totals: { uncachedInputTokens: 2400000, outputTokens: 180000, cacheReadTokens: 62000000, cacheWriteTokens: 300000 },
  last: null,
}

const MODELS = {
  current: null,
  total: 64600000,
  models: [
    { provider: 'magpie-responses', model: 'codex/gpt-6.1-terra', tokens: 60000000, outputTokens: 15000, cacheReadTokens: 58000000, uncachedInputTokens: 1800000, cacheWriteTokens: 100000, steps: 61 },
    { provider: 'antigravity', model: 'gemini-4-hydrogen', tokens: 4600000, outputTokens: 4000, cacheReadTokens: 4000000, uncachedInputTokens: 600000, cacheWriteTokens: 200000, steps: 8 },
  ],
}

async function cachePill({ projection = {}, open = true } = {}) {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace(
    '    function UsageRings({ rpc }) {',
    '    globalThis.testCachePill = CachePill;\n    function UsageRings({ rpc }) {',
  )
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    createPortal: node => node,
    Fragment: Symbol('Fragment'),
    useState: () => [open, () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':r9:',
    useEffect: () => {},
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = { tokenUsage: USAGE, usageByModel: MODELS, ...projection }
  return context.testCachePill({ useProjection: key => values[key] })
}

test('the trigger shows the hit rate the host computes', async () => {
  const text = textOf(await cachePill())
  assert.match(text, /96%/)
})

test('the panel separates cache reads from uncached input', async () => {
  const text = textOf(await cachePill())
  assert.match(text, /缓存命中/)
  assert.match(text, /缓存读/)
  assert.match(text, /未缓存输入/)
  assert.match(text, /缓存写/)
  assert.match(text, /各模型命中/)
  assert.match(text, /codex\/gpt-6\.1-terra/)
})

test('no prompt usage means no control at all', async () => {
  assert.equal(await cachePill({ projection: { tokenUsage: undefined } }), null)
  assert.equal(await cachePill({ projection: { tokenUsage: { totals: { cacheReadTokens: 0, uncachedInputTokens: 0, cacheWriteTokens: 0 } } } }), null)
})

test('models without cache figures are skipped rather than shown as zero', async () => {
  const text = textOf(await cachePill({
    projection: { usageByModel: { current: null, total: 1, models: [{ provider: 'p', model: 'm', tokens: 1, steps: 1 }] } },
  }))
  assert.match(text, /缓存命中/)
  assert.doesNotMatch(text, /各模型命中/)
})

test('CachePill expands group/smart-split into concrete models instead of showing group names', async () => {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace('    function UsageRings({ rpc }) {', '    globalThis.testCachePill = CachePill;\n    function UsageRings({ rpc }) {')
  const stateSlots = [
    true,
    {
      groups: {
        'group/smart-split': {
          models: [
            { provider: 'agy-cli', model: 'gemini-4-hydrogen', tokens: 60000000, uncachedInputTokens: 1800000, outputTokens: 15000, cacheReadTokens: 58000000, cacheWriteTokens: 100000, calls: 61 },
            { provider: 'codex', model: 'gpt-6.1-terra', tokens: 4600000, uncachedInputTokens: 600000, outputTokens: 4000, cacheReadTokens: 4000000, cacheWriteTokens: 200000, calls: 8 },
          ],
        },
      },
      lastServed: null,
      loading: false,
      error: false,
    },
  ]
  let slot = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    createPortal: node => node,
    Fragment: Symbol('Fragment'),
    useState: () => [stateSlots[slot++ % stateSlots.length], () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':r9:',
    useEffect: () => {},
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = {
    tokenUsage: USAGE,
    usageByModel: {
      current: { provider: 'magpie', model: 'group/smart-split' },
      total: 64600000,
      models: [{ provider: 'magpie', model: 'group/smart-split', tokens: 64600000, uncachedInputTokens: 2400000, outputTokens: 19000, cacheReadTokens: 62000000, cacheWriteTokens: 300000, steps: 69 }],
    },
  }
  const text = textOf(context.testCachePill({ useProjection: key => values[key], sessionId: 'session-1', rpc: { call: async () => ({}) } }))
  assert.match(text, /gemini-4-hydrogen/)
  assert.match(text, /gpt-6\.1-terra/)
  assert.doesNotMatch(text, /group\/smart-split/)
})
