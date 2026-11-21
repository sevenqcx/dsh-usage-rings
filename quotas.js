import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const endpoint = 'http://127.0.0.1:3425/v1/magpie/quotas'
const maxBytes = 1024 * 1024
const codexWindows = new Set(['5 hours', '7 days', 'Image generation'])
const antigravityWindows = new Set([
  'Gemini · 7 days', 'Gemini · 5 hours',
  'Claude & GPT · 7 days', 'Claude & GPT · 5 hours',
  'Gemini 4 Argon · 7 days',
])

function empty(status) {
  return { status, readAt: null, windows: [] }
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

function percentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

// Multiple logged-in accounts of the same provider each contribute a record.
// When Magpie reports which account it is serving right now, follow that account;
// otherwise merge by window name and keep the highest remaining value.
function selectProvider(records, provider, allowedNames, activeAccount) {
  const providerRecords = records.filter(record => record?.provider === provider)
  const matches = providerRecords.filter(record => !record.error)
  if (matches.length === 0) return empty('unavailable')
  const preferred = activeAccount
    ? matches.filter(record => typeof record.user === 'string' && record.user === activeAccount)
    : []
  const pool = preferred.length ? preferred : matches
  const usable = pool.filter(record => record.kind === 'subscription' && Array.isArray(record.windows))
  const partial = usable.length < providerRecords.length || usable.some(record => !record.windows.some(w => allowedNames.has(w?.name) && (percentage(w.used) !== null || percentage(w.remaining) !== null)))
  if (usable.length === 0) return empty('unknown')
  const byName = new Map()
  for (const record of usable) {
    for (const w of record.windows) {
      if (!allowedNames.has(w?.name)) continue
      const win = {
        name: w.name,
        used: percentage(w.used),
        remaining: percentage(w.remaining),
        resetsAt: timestamp(w.resetsAt),
        readAt: timestamp(record.readAt),
      }
      if (win.used === null && win.remaining === null) continue
      const prior = byName.get(w.name)
      if (!prior) {
        byName.set(w.name, win)
        continue
      }
      const priorPct = prior.remaining ?? (prior.used !== null ? 100 - prior.used : null)
      const winPct = win.remaining ?? (win.used !== null ? 100 - win.used : null)
      if (winPct !== null && (priorPct === null || winPct > priorPct)) byName.set(w.name, win)
    }
  }
  const windows = [...byName.values()]
  const available = windows.some(w => w.used !== null || w.remaining !== null)
  // The aggregate is only as fresh as its oldest selected window. If any
  // selected window has no observation time, the aggregate time is unknown.
  const readAt = windows.length && windows.every(w => w.readAt)
    ? windows.map(w => w.readAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    : null
  const account = preferred.length ? activeAccount : null
  return { status: available ? (partial ? 'partial' : 'available') : 'unknown', readAt, windows, account }
}

// Keep quota pools separate and omit account identities and arbitrary upstream text.
function otherProviders(records) {
  return records.filter(record => record && typeof record.provider === 'string' && !['codex', 'agy-cli'].includes(record.provider))
    .slice(0, 100).map(record => ({
      provider: record.provider.slice(0, 80),
      kind: record.kind === 'balance' ? 'balance' : record.kind === 'subscription' ? 'subscription' : 'unknown',
      status: record.error ? 'unavailable' : 'available',
      readAt: timestamp(record.readAt),
      balance: typeof record.balance === 'string' && /^[\d.,\s$¥€£+\-A-Za-z]{1,60}$/.test(record.balance) ? record.balance : null,
      windows: Array.isArray(record.windows) ? record.windows.filter(w => w && typeof w === 'object' && w.text !== true).slice(0, 50).map(w => ({
        name: typeof w.name === 'string' ? w.name.slice(0, 100) : '额度',
        used: percentage(w.used), remaining: percentage(w.remaining), resetsAt: timestamp(w.resetsAt),
        display: typeof w.display === 'string' ? w.display.slice(0, 100) : null,
      })) : [],
    }))
}

// Magpie appends one JSON line per served request, naming the account behind it.
// The newest line per provider is the account currently in use.
const usagePathDefault = () => process.env.MAGPIE_USAGE_PATH || join(homedir(), '.config', 'magpie', 'usage.jsonl')
const usageTailBytes = 1024 * 1024
const activeTtlMs = 15000
let activeCache = { at: 0, value: new Map() }

export async function readActiveAccounts(options = {}) {
  const path = options.path ?? usagePathDefault()
  const cached = options.path ? null : activeCache
  if (cached && Date.now() - cached.at < activeTtlMs) return cached.value
  const active = new Map()
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const length = Math.min(usageTailBytes, size)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n')
    lines.shift()
    for (const line of lines) {
      if (!line) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      const provider = typeof row?.provider === 'string' ? row.provider : ''
      const account = typeof row?.providerAccount === 'string' ? row.providerAccount.trim() : ''
      if (!provider || !account) continue
      const at = typeof row?.t === 'string' ? Date.parse(row.t) : NaN
      const prior = active.get(provider)
      if (!prior || (Number.isFinite(at) && at >= prior.at)) {
        active.set(provider, { account, at: Number.isFinite(at) ? at : 0 })
      }
    }
  } catch {
    // A missing log simply means no account could be resolved.
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
  if (!options.path) activeCache = { at: Date.now(), value: active }
  return active
}

const maskAccount = (value) => (typeof value !== 'string'
  ? null
  : value.replace(/^(.{3})[^@]*(@.*)$/, '$1…$2').slice(0, 40))

// The deadline covers response headers and the complete response body.
export async function readMagpieQuotas(options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  let status = 'unavailable'
  try {
    const response = await fetch(endpoint, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal,
    })
    if (!response.ok) throw new Error('HTTP failure')
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > maxBytes) throw new Error('Quota response too large')
      chunks.push(chunk)
    }
    status = 'unknown'
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (payload?.object !== 'list' || !Array.isArray(payload.data)) throw new Error('Unexpected format')
    let activeAccounts = new Map()
    if (options.usagePath !== false) {
      try { activeAccounts = await readActiveAccounts(options.usagePath ? { path: options.usagePath } : {}) } catch { activeAccounts = new Map() }
    }
    const codex = selectProvider(payload.data, 'codex', codexWindows, activeAccounts.get('codex')?.account ?? null)
    const antigravity = selectProvider(payload.data, 'agy-cli', antigravityWindows, activeAccounts.get('agy-cli')?.account ?? null)
    return {
      codex: { ...codex, account: maskAccount(codex.account) },
      antigravity: { ...antigravity, account: maskAccount(antigravity.account) },
      others: otherProviders(payload.data),
    }
  } catch {
    return { codex: empty(status), antigravity: empty(status) }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
