import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const textOf = node => node == null || typeof node === 'boolean'
  ? ''
  : typeof node !== 'object'
    ? String(node)
    : (node.children || []).map(textOf).join(' ')

const PRESSURE = { projectedTokens: 176000, pressureTokens: 150000, contextWindow: 1000000 }
const BREAKDOWN = { systemTokens: 19100, toolsTokens: 35400, messageTokens: 121500 }

async function contextPill({ projection = {}, open = true } = {}) {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace(
    '    function UsageRings({ rpc }) {',
    '    globalThis.testContextPill = ContextPill;\n    function UsageRings({ rpc }) {',
  )
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    createPortal: node => node,
    Fragment: Symbol('Fragment'),
    useState: () => [open, () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':r7:',
    useEffect: () => {},
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = { contextPressure: PRESSURE, contextBreakdown: BREAKDOWN, ...projection }
  return context.testContextPill({ useProjection: key => values[key] })
}

test('the pill reports the pressure the host itself would show', async () => {
  const text = textOf(await contextPill())
  assert.match(text, /18%/)
  assert.match(text, /~176K \/ 1M/)
})

test('the panel splits the window into the three host segments', async () => {
  const text = textOf(await contextPill())
  assert.match(text, /上下文/)
  assert.match(text, /已用/)
  assert.match(text, /剩余/)
  assert.match(text, /系统提示词/)
  assert.match(text, /工具定义/)
  assert.match(text, /对话消息/)
  assert.match(text, /176K \/ 1M/)
})

test('without pressure figures the control disappears instead of inventing a number', async () => {
  assert.equal(await contextPill({ projection: { contextPressure: undefined } }), null)
  assert.equal(await contextPill({ projection: { contextPressure: { pressureTokens: 5, contextWindow: 0 } } }), null)
})

test('a missing breakdown still shows the headline without segments', async () => {
  const text = textOf(await contextPill({ projection: { contextBreakdown: undefined } }))
  assert.match(text, /18%/)
  assert.doesNotMatch(text, /系统提示词/)
})
