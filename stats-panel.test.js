import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const textOf = node => node == null || typeof node === 'boolean'
  ? ''
  : typeof node !== 'object'
    ? String(node)
    : (node.children || []).map(textOf).join(' ')

const STATS = { turns: 3, steps: 9, llmMs: 60000, toolMs: 20000, ttftMs: 3000, ttftSteps: 3, decodeMs: 30000, decodeTokens: 1500 }

const MODELS = {
  current: { provider: 'magpie-responses', model: 'codex/gpt-6.1-terra' },
  total: 13490000,
  models: [
    { provider: 'magpie-responses', model: 'codex/gpt-6.1-terra', tokens: 12000000, outputTokens: 15000, cacheReadTokens: 9000000, uncachedInputTokens: 2985000, cacheWriteTokens: 0, steps: 61 },
    { provider: 'antigravity', model: 'gemini-4-hydrogen', tokens: 1490000, outputTokens: 4000, cacheReadTokens: 900000, uncachedInputTokens: 586000, cacheWriteTokens: 0, steps: 8 },
  ],
}

async function activityStats({ projection = {}, open = true } = {}) {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace('    function UsageRings({ rpc }) {', '    globalThis.testActivityStats = ActivityStats;\n    function UsageRings({ rpc }) {')
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    createPortal: node => node,
    Fragment: Symbol('Fragment'),
    useState: () => [open, () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':r0:',
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = { sessionStats: STATS, modelSelection: { lastUsed: MODELS.current, next: MODELS.current }, usageByModel: MODELS, ...projection }
  const state = { legacy: { nodes: [] }, timeline: { turnOrder: [] }, nodes: { turnDataSource: () => ({ subscribe: () => () => {}, getSnapshot: () => [] }) } }
  return context.testActivityStats({
    useProjection: key => values[key],
    useChat: selector => selector(state),
    sessionId: 'session-1',
  })
}

test('the panel names the route in use and every model the conversation consumed', async () => {
  const text = textOf(await activityStats())
  assert.match(text, /正在使用/)
  assert.match(text, /codex\/gpt-6\.1-terra/)
  assert.doesNotMatch(text, /magpie-responses \/ codex/)
  assert.match(text, /本会话模型用量/)
  assert.match(text, /codex\/gpt-6\.1-terra/)
  assert.match(text, /gemini-4-hydrogen/)
  assert.match(text, /1200万 · 89%/)
  assert.match(text, /输出 1\.5万/)
  assert.match(text, /61 步/)
  assert.match(text, /合计 1349万 令牌/)
})

test('the pending route is disclosed only when it differs from the live one', async () => {
  const same = textOf(await activityStats())
  assert.doesNotMatch(same, /下一步/)
  const switched = textOf(await activityStats({
    projection: { modelSelection: { lastUsed: MODELS.current, next: { provider: 'deepseek-account', model: 'deepseek-flash' } } },
  }))
  assert.match(switched, /下一步/)
  assert.match(switched, /deepseek-account\/deepseek-flash/)
})

test('missing per-model data is reported instead of invented', async () => {
  const text = textOf(await activityStats({ projection: { usageByModel: undefined } }))
  assert.match(text, /重开一次 DSH 后显示/)
  assert.doesNotMatch(text, /本会话模型用量[\s\S]*合计/)
  const empty = textOf(await activityStats({ projection: { usageByModel: { current: MODELS.current, total: 0, models: [] } } }))
  assert.match(empty, /尚无带用量的模型记录/)
})

test('a session without a recorded request says so rather than showing a model', async () => {
  const text = textOf(await activityStats({ projection: { modelSelection: { lastUsed: null, next: null } } }))
  assert.match(text, /等待首次请求/)
})

test('group/smart-split expands into concrete models and hides smart-route labels in ActivityStats', async () => {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace('    function UsageRings({ rpc }) {', '    globalThis.testActivityStats = ActivityStats;\n    function UsageRings({ rpc }) {')
  const stateSlots = [
    true,
    {
      groups: {
        'group/smart-split': {
          last: { provider: 'agy-cli', model: 'gemini-4-hydrogen' },
          models: [
            { provider: 'agy-cli', model: 'gemini-4-hydrogen', tokens: 12000000, uncachedInputTokens: 2000000, outputTokens: 15000, cacheReadTokens: 9985000, cacheWriteTokens: 0, calls: 20 },
            { provider: 'codex', model: 'gpt-6.1-terra', tokens: 1490000, uncachedInputTokens: 400000, outputTokens: 4000, cacheReadTokens: 1086000, cacheWriteTokens: 0, calls: 5 },
          ],
        },
      },
      lastServed: { req: 'group/smart-split', provider: 'agy-cli', model: 'gemini-4-hydrogen' },
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
    useId: () => ':r0:',
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = {
    sessionStats: STATS,
    modelSelection: { lastUsed: { provider: 'magpie', model: 'group/smart-split' }, next: { provider: 'magpie', model: 'group/smart-split' } },
    usageByModel: {
      current: { provider: 'magpie', model: 'group/smart-split' },
      total: 13490000,
      models: [{ provider: 'magpie', model: 'group/smart-split', tokens: 13490000, outputTokens: 19000, cacheReadTokens: 11071000, uncachedInputTokens: 2400000, cacheWriteTokens: 0, steps: 25 }],
    },
  }
  const chatState = {
    legacy: { nodes: [] },
    timeline: { turnOrder: [1] },
    nodes: { turnDataSource: () => ({ subscribe: () => () => {}, getSnapshot: () => [{ tokenUsage: { outputTokens: 500, routes: [{ provider: 'magpie', model: 'group/smart-split' }] } }] }) },
  }
  const text = textOf(context.testActivityStats({
    useProjection: key => values[key],
    useChat: selector => selector(chatState),
    sessionId: 'session-1',
    rpc: { call: async () => ({}) },
  }))
  assert.match(text, /agy-cli\/gemini-4-hydrogen/)
  assert.match(text, /gemini-4-hydrogen/)
  assert.match(text, /gpt-6\.1-terra/)
  assert.doesNotMatch(text, /group\/smart-split/)
  assert.doesNotMatch(text, /智能路由/)
  assert.doesNotMatch(text, /下一步/)
})
