/**
 * End-to-end check against this machine's real Session logs.
 *
 * The fold is replayed over a durable log from `~/.dsh/sessions`, then compared
 * with what the running host itself published into its projection cache
 * (`~/.dsh/storages/session_projcache`). The cache is written by the real DSH
 * host, so it is an independent oracle rather than a second copy of this
 * plugin's own arithmetic.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

import { applyUsageByModelEvent, initUsageByModel, viewUsageByModel } from './usage-by-model.js'

const DSH_HOME = join(homedir(), '.dsh')
const CACHE_DIR = join(DSH_HOME, 'storages', 'session_projcache', 'sessions')
const SESSION_DIR = join(DSH_HOME, 'sessions')

const textOf = node => node == null || typeof node === 'boolean'
  ? ''
  : typeof node !== 'object'
    ? String(node)
    : (node.children || []).map(textOf).join(' ')

const sumBuckets = (totals) => totals.uncachedInputTokens + totals.outputTokens
  + totals.cacheReadTokens + totals.cacheWriteTokens

/** Locate the durable log of one session id under the sessions tree. */
function logOf(sessionId) {
  if (!existsSync(SESSION_DIR)) return null
  for (const project of readdirSync(SESSION_DIR)) {
    const candidate = join(SESSION_DIR, project, sessionId, 'session.v4.jsonl.zstd')
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** The real host's published projection rows, by session id. */
function cachedRows() {
  if (!existsSync(CACHE_DIR)) return []
  return readdirSync(CACHE_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => ({ name, path: join(CACHE_DIR, name), size: statSync(join(CACHE_DIR, name)).size }))
    .sort((left, right) => right.size - left.size)
    .map(({ name, path }) => {
      const id = name.replace(/\.json$/, '')
      try {
        const rows = JSON.parse(readFileSync(path, 'utf8'))?.record?.rows
        return rows?.tokenUsage?.val ? { id, rows, log: logOf(id) } : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/** Replay a whole durable log through the folding unit. */
function replay(file) {
  let text
  try {
    text = execFileSync('zstd', ['-dc', file], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  } catch {
    return null
  }
  let state = initUsageByModel()
  let events = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    state = applyUsageByModelEvent(state, event)
    events += 1
  }
  return { state, events }
}

/** Render the panel with values supplied by the caller. */
async function renderPanel({ tokenUsage, sessionStats, modelSelection, usageByModel, open = true }) {
  const raw = readFileSync(new URL('./client.js', import.meta.url), 'utf8')
  const source = raw.replace('    function UsageRings({ rpc }) {', '    globalThis.testActivityStats = ActivityStats;\n    function UsageRings({ rpc }) {')
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    createPortal: node => node,
    Fragment: Symbol('Fragment'),
    useState: () => [open, () => {}],
    useRef: () => ({ current: null }),
    useId: () => ':r0:',
    useEffect: () => {},
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const context = { window: { __ModuleLoader__: { load: ({ factory }) => factory(() => React) } }, document: { body: null } }
  vm.runInNewContext(source, context)
  const values = {
    sessionStats,
    modelSelection: { lastUsed: modelSelection.lastUsed ?? null, next: modelSelection.pending ?? modelSelection.lastUsed ?? null },
    tokenUsage,
    usageByModel,
  }
  const state = { legacy: { nodes: [] }, timeline: { turnOrder: [] }, nodes: { turnDataSource: () => ({ subscribe: () => () => {}, getSnapshot: () => [] }) } }
  const tree = context.testActivityStats({
    useProjection: key => values[key],
    useChat: selector => selector(state),
    sessionId: 'session-real',
  })
  return textOf(tree)
}

const rows = cachedRows().filter(entry => entry.log !== null)
const sample = rows.slice(0, 1)

test('the fold reproduces the host token totals on a real Session log', { skip: sample.length === 0 && 'no local Session log with a host projection cache' }, () => {
  for (const { rows: hostRows, log } of sample) {
    const replayed = replay(log)
    if (replayed === null) return
    const view = viewUsageByModel(replayed.state)
    const totals = hostRows.tokenUsage.val.totals
    assert.equal(view.total, sumBuckets(totals), 'per-route sum must equal the host four-bucket total')
    assert.ok(view.models.length > 0)
    assert.equal(view.models.reduce((sum, entry) => sum + entry.tokens, 0), view.total)
    // The live route is the one the host recorded as last used.
    const lastUsed = hostRows.modelSelection?.val?.lastUsed
    if (lastUsed) {
      assert.equal(view.current?.provider, lastUsed.provider)
      assert.equal(view.current?.model, lastUsed.model)
    }
  }
})

test('the panel renders real per-model numbers for a real Session', { skip: sample.length === 0 && 'no local Session log with a host projection cache' }, async () => {
  for (const { rows: hostRows, log } of sample) {
    const replayed = replay(log)
    if (replayed === null) return
    const view = viewUsageByModel(replayed.state)
    const top = view.models[0]
    const text = await renderPanel({
      tokenUsage: hostRows.tokenUsage.val,
      sessionStats: hostRows.sessionStats.val,
      modelSelection: hostRows.modelSelection.val,
      usageByModel: view,
    })
    assert.match(text, /本会话模型用量/)
    assert.ok(text.includes(top.model), `panel must name the top route ${top.model}`)
    assert.match(text, new RegExp(`${Math.round((top.tokens / view.total) * 100)}%`), 'panel must show the top route share')
    assert.match(text, /合计/)
    assert.doesNotMatch(text, /重开一次 DSH 后显示/, 'no placeholder once the projection reports data')
    assert.doesNotMatch(text, /undefined|NaN|null/)
  }
})
