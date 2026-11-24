import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

async function providerRing(options = {}) {
  const source = (await readFile(new URL('./client.js', import.meta.url), 'utf8')).replace('    function UsageRings({ rpc }) {', '    globalThis.testProviderRing = ProviderRing;\n    function UsageRings({ rpc }) {')
  const open = options.open === true
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: () => [open, () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':test:',
    useEffect: () => {},
    createPortal: node => node,
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { addEventListener() {}, removeEventListener() {} }, Date }
  vm.runInNewContext(source, context)
  return context.testProviderRing
}

test('a positive fractional remaining quota is not reported as exhausted', async () => {
  const render = await providerRing()
  const tree = render({ label: 'Codex', provider: { windows: [{ name: '5 hours', remaining: 0.4, resetsAt: '2030-01-01T00:00:00Z' }] }, onRefresh() {} })
  assert.doesNotMatch(dockLabel(tree), /已用完/)
  assert.match(dockLabel(tree), /<1%/)
  assert.equal(dockPct(tree), '<1%')
})

const dockLabel = tree => tree.children[0].props['aria-label']
const dockPct = tree => tree.children[0].children[1].children[0]

const textOf = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : (node.children || []).map(textOf).join(' ')

const panelOf = tree => tree.children.find(child => child && typeof child === 'object' && child.props && child.props.role === 'dialog')

test('old and failed snapshots are visibly identified, including past reset', async () => {
  const render = await providerRing({ open: true })
  const tree = render({ label: 'Codex', provider: { readAt: '2000-01-01T00:00:00Z', windows: [{ name: '5 hours', remaining: 0, readAt: '2000-01-01T00:00:00Z', resetsAt: '2000-01-02T00:00:00Z' }] }, requestState: 'error', onRefresh() {} })
  const panel = panelOf(tree)
  assert.match(textOf(panel), /刷新失败/)
  assert.match(textOf(panel), /数据来自上一次读取/)
  assert.match(dockLabel(tree), /已过重置时间，等待更新/)
  assert.doesNotMatch(textOf(panel), /即将刷新|后刷新/)
})

test('the dock reads the same while a refresh is in flight, so the row cannot jump', async () => {
  const render = await providerRing()
  const provider = { readAt: '2030-01-01T00:00:00Z', windows: [{ name: '5 hours', remaining: 41 }, { name: '7 days', remaining: 88 }] }
  const idle = textOf(render({ label: 'Codex', provider, requestState: 'ready', onRefresh() {} }).children.slice(0, 3))
  const loading = textOf(render({ label: 'Codex', provider, requestState: 'loading', onRefresh() {} }).children.slice(0, 3))
  const failed = textOf(render({ label: 'Codex', provider, requestState: 'error', onRefresh() {} }).children.slice(0, 3))
  assert.equal(loading, idle)
  assert.equal(failed, idle)
})

test('partial account results show their limitation', async () => {
  const render = await providerRing({ open: true })
  const tree = render({ label: 'Codex', provider: { status: 'partial', readAt: '2030-01-01T00:00:00Z', windows: [{ name: '5 hours', remaining: 40 }] }, onRefresh() {} })
  assert.match(textOf(panelOf(tree)), /部分账户额度不可用/)
  assert.match(dockLabel(tree), /5小时剩余 40%/)
})

test('Codex hides image generation quota in its panel', async () => {
  const render = await providerRing({ open: true })
  const tree = render({ label: 'Codex', provider: { windows: [
    { name: '5 hours', remaining: 60 },
    { name: 'Image generation', remaining: 90 },
  ] }, onRefresh() {} })
  const collect = node => Array.isArray(node) ? node.flatMap(collect) : node && typeof node === 'object' ? [node, ...collect(node.children || [])] : []
  assert.equal(collect(panelOf(tree)).some(node => node.children.includes('图像生成')), false)
})

test('Gemini panel includes Antigravity Claude and GPT quota windows', async () => {
  const render = await providerRing({ open: true })
  const tree = render({ label: 'Gemini', provider: { windows: [
    { name: 'Gemini · 5 hours', remaining: 80 },
    { name: 'Claude & GPT · 5 hours', remaining: 55 },
  ] }, onRefresh() {} })
  const collect = node => Array.isArray(node) ? node.flatMap(collect) : node && typeof node === 'object' ? [node, ...collect(node.children || [])] : []
  const panelNodes = collect(panelOf(tree))
  assert.ok(panelNodes.some(node => node.props?.className === 'ur-quota-group-name' && node.children.includes('Claude & GPT')))
  assert.ok(panelNodes.some(node => node.props?.className === 'ur-quota-ring-pct' && node.children.includes('55%')))
})

test('an unavailable account does not display a stale percentage', async () => {
  const render = await providerRing({ open: true })
  const tree = render({ label: 'Codex', provider: { status: 'unavailable', windows: [] }, requestState: 'ready', onRefresh() {} })
  assert.equal(dockPct(tree), '—')
  assert.match(textOf(panelOf(tree)), /额度暂不可用/)
})

async function usageHarness(rpc) {
  const source = (await readFile(new URL('./client.js', import.meta.url), 'utf8')).replace('    return {\n      inject:', '    globalThis.testUsageRings = UsageRings;\n    return {\n      inject:')
  const state = []
  let cursor = 0
  let effect
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial } },
    useCallback(fn) { return fn },
    useEffect(fn) { effect = fn },
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) }, addEventListener() {}, removeEventListener() {} }, AbortController, setInterval: () => 1, clearInterval() {}, console: { warn() {} } }
  vm.runInNewContext(source, context)
  const render = () => { cursor = 0; return context.testUsageRings({ rpc }) }
  const first = render()
  const cleanup = effect()
  return { first, render, cleanup }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

async function resetCardsHarness(rpc) {
  const source = (await readFile(new URL('./client.js', import.meta.url), 'utf8')).replace('    function ResetCards({ rpc, onRefresh }) {', '    globalThis.testResetCards = ResetCards;\n    function ResetCards({ rpc, onRefresh }) {')
  const state = []
  let cursor = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial } },
    useCallback(fn) { return fn },
    useEffect(fn) { fn() },
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) }, addEventListener() {}, removeEventListener() {} }, AbortController, console: { warn() {} } }
  vm.runInNewContext(source, context)
  return { render: () => { cursor = 0; return context.testResetCards({ rpc, onRefresh() {} }) } }
}

test('the Codex panel reads and renders reset cards from Magpie', async () => {
  const rpc = { call: async (ns, method) => method === 'dsh-usage-rings/reset-cards'
    ? { ok: true, value: { accounts: [{ user: 'one@example.com', count: 1, until: '2030-01-01T00:00:00Z', each: [{ id: 'c1', until: '2030-01-01T00:00:00Z' }] }] } }
    : { ok: true, value: { ok: true } } }
  const { render } = await resetCardsHarness(rpc)
  render()
  await flush()
  const tree = render()
  const text = textOf(tree)
  assert.match(text, /重置卡/)
  assert.match(text, /1 张 · 最早 1\/1 08:00 到期/)
})

test('RPC errors keep the last value marked as failed, and unavailable replaces it', async () => {
  const pending = []
  const rpc = { call: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) }
  const app = await usageHarness(rpc)
  await flush()
  assert.equal(app.render().children[0][0].props.requestState, 'loading')
  pending[0].resolve({ ok: true, value: { codex: { status: 'available', readAt: '2030-01-01T00:00:00Z', windows: [{ name: '5 hours', remaining: 42 }] } } })
  await flush()
  let ring = app.render().children[0][0].props
  assert.equal(ring.provider.windows[0].remaining, 42)
  assert.equal(ring.requestState, 'ready')
  ring.onRefresh()
  await flush()
  assert.equal(app.render().children[0][0].props.requestState, 'loading')
  pending[1].resolve({ ok: false })
  await flush()
  ring = app.render().children[0][0].props
  assert.equal(ring.requestState, 'error')
  assert.equal(ring.provider.windows[0].remaining, 42)
  ring.onRefresh()
  await flush()
  pending[2].resolve({ ok: true, value: { codex: { status: 'unavailable', windows: [] } } })
  await flush()
  ring = app.render().children[0][0].props
  assert.equal(ring.requestState, 'ready')
  assert.equal(ring.provider.status, 'unavailable')
  assert.equal(ring.provider.windows.length, 0)
  app.cleanup()
})

test('an aborted obsolete request cannot overwrite the latest snapshot', async () => {
  const pending = []
  const app = await usageHarness({ call: () => new Promise(resolve => pending.push(resolve)) })
  await flush()
  app.render().children[0][0].props.onRefresh()
  await flush()
  pending[1]({ ok: true, value: { codex: { status: 'unavailable', windows: [] } } })
  await flush()
  pending[0]({ ok: true, value: { codex: { status: 'available', windows: [{ name: '5 hours', remaining: 99 }] } } })
  await flush()
  assert.equal(app.render().children[0][0].props.provider.status, 'unavailable')
  app.cleanup()
})

test('OtherQuotas renders per-platform cards with vertical bar columns and balance cards', async () => {
  const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace('    function UsageRings({ rpc }) {', '    globalThis.testOtherQuotas = OtherQuotas;\n    function UsageRings({ rpc }) {')
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: () => [true, () => {}],
    useRef: () => ({ current: { getBoundingClientRect: () => ({ left: 100, top: 600 }) } }),
    useLayoutEffect: (fn) => fn(),
    useEffect: () => {},
    createPortal: node => node,
  }
  const context = {
    window: {
      __ModuleLoader__: { load: ({ factory }) => factory(() => React) },
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {},
      removeEventListener() {},
    },
    document: { body: null, addEventListener() {}, removeEventListener() {} },
    Date,
  }
  vm.runInNewContext(source, context)
  const tree = context.testOtherQuotas({
    records: [
      {
        provider: 'workbuddy',
        kind: 'subscription',
        status: 'available',
        readAt: '2026-11-21T22:43:42+08:00',
        windows: [
          { name: 'Credits', remaining: 42, display: '291.46 / 500', resetsAt: '2026-11-30T15:59:59Z' },
          { name: 'Extra credits', remaining: 60, display: '200 / 500' },
          { name: 'Total credits', remaining: 51, display: '491.46 / 1000', resetsAt: '2026-11-30T15:59:59Z' },
        ],
      },
      {
        provider: 'aws-quick',
        kind: 'subscription',
        status: 'available',
        readAt: '2026-11-24T12:02:08+08:00',
        windows: [
          { name: 'Agent hours', used: 0.5, remaining: 99.5, resetsAt: '2026-11-30T16:00:00Z', amount: 0.05, limit: 10, unit: 'h' },
        ],
      },
      {
        provider: 'deepseek',
        kind: 'balance',
        status: 'available',
        readAt: '2026-11-21T22:43:41+08:00',
        balance: '¥119.51',
        windows: [],
      },
    ],
    requestState: 'ready',
    rpc: { call: async () => ({}) },
    onRefresh() {},
  })
  const collect = node => Array.isArray(node) ? node.flatMap(collect) : node && typeof node === 'object' ? [node, ...collect(node.children || [])] : []
  const panel = panelOf(tree)
  const nodes = collect(panel)
  const cards = nodes.filter(node => node.props?.className === 'ur-oq-card')
  assert.equal(cards.length, 3)
  const bars = nodes.filter(node => node.props?.className === 'ur-vcol-fill')
  assert.equal(bars.length, 4)
  assert.equal(bars[0].props.style['--p'], '0.42')
  assert.equal(bars[1].props.style['--p'], '0.6')
  assert.equal(bars[2].props.style['--p'], '0.51')
  assert.equal(bars[3].props.style['--p'], '0.995')
  assert.equal(nodes.filter(node => node.props?.className === 'ur-oq-reset').length, 2)
  assert.equal(nodes.filter(node => node.props?.className === 'ur-vcol-reset').length, 0)
  const text = textOf(panel)
  assert.match(text, /WorkBuddy/)
  assert.match(text, /42%/)
  assert.match(text, /剩 208\.54\/500/)
  assert.match(text, /智能体时长/)
  assert.match(text, /剩 9\.95\/10h/, 'agent-hours windows show concrete remaining amount, not just a percent')
  assert.match(text, /DeepSeek/)
  assert.match(text, /¥119\.51/)
  assert.match(text, /可用余额/)
  assert.match(text, /余额计费/)
})
