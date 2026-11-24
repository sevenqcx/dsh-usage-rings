import test from 'node:test'
import assert from 'node:assert/strict'
import { readMagpieQuotas, readActiveAccounts } from './quotas.js'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function read(records) {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ object: 'list', data: records }))
  try { return (await readMagpieQuotas()).codex } finally { globalThis.fetch = oldFetch }
}
const record = (readAt, windows) => ({ provider: 'codex', kind: 'subscription', readAt, windows })
const win = (name, remaining) => ({ name, remaining, resetsAt: '2026-11-21T10:00:00Z' })

test('without an active account, windows come from one real account (never stitched)', async () => {
  const result = await read([
    { ...record('2026-11-21T09:00:00+08:00', [win('5 hours', 10), win('7 days', 50)]), user: 'aaa@example.com' },
    { ...record('2026-11-21T02:00:00Z', [win('5 hours', 30), win('7 days', 20)]), user: 'bbb@example.com' },
  ])
  // Account B's tightest window (20) beats A's (10), so all windows come from B.
  assert.equal(result.readAt, '2026-11-21T02:00:00Z')
  assert.deepEqual(result.windows.map(w => [w.remaining, w.readAt]), [[30, '2026-11-21T02:00:00Z'], [20, '2026-11-21T02:00:00Z']])
  assert.equal(result.account, 'bbb…@example.com')
})

test('the most recently served account wins over headroom', async () => {
  const result = await read([
    { ...record('2026-11-21T02:00:00Z', [win('5 hours', 5)]), user: 'aaa@example.com', lastServedAt: '2026-11-21T03:00:00Z' },
    { ...record('2026-11-21T02:00:00Z', [win('5 hours', 90)]), user: 'bbb@example.com', lastServedAt: '2026-11-21T01:00:00Z' },
  ])
  assert.equal(result.windows[0].remaining, 5)
  assert.equal(result.account, 'aaa…@example.com')
})

test('unknown selected window time makes aggregate time unknown', async () => {
  const result = await read([record(null, [win('5 hours', 10), win('7 days', 20)])])
  assert.equal(result.readAt, null)
  assert.equal(result.windows[0].readAt, null)
})

test('non-email account names are masked too', async () => {
  const { maskAccount } = await import('./quotas.js')
  assert.equal(maskAccount('大七🚏Seven7cx'), '大七…cx')
  assert.equal(maskAccount('abc'), 'a…')
  assert.equal(maskAccount(''), null)
})

test('other providers retain separate quota pools and omit account identifiers', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ object: 'list', data: [
    { provider: 'deepseek', kind: 'balance', balance: '12.5 CNY', user: 'secret@example.com' },
    { provider: 'doubao', kind: 'subscription', windows: [{ name: '每日', remaining: 37, display: '37%', account: 'private' }] },
    { provider: 'codex', kind: 'subscription', windows: [] },
  ] }))
  try {
    const { others } = await readMagpieQuotas()
    assert.equal(others.length, 2)
    assert.equal(others[0].balance, '12.5 CNY')
    assert.equal(others[1].windows[0].remaining, 37)
    assert.doesNotMatch(JSON.stringify(others), /secret@example|private/)
  } finally { globalThis.fetch = oldFetch }
})

test('non-token windows keep their concrete usage amount, limit and unit', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ object: 'list', data: [
    { provider: 'aws-quick', kind: 'subscription', windows: [
      { name: 'Agent hours', used: 0.5, remaining: 99.5, resetsAt: '2026-11-30T16:00:00Z', amount: 0.05, limit: 10, unit: 'h' },
      { name: 'Bad window', remaining: 50, amount: 'x', limit: -1, unit: 'very-long-unit-name' },
    ] },
  ] }))
  try {
    const { others } = await readMagpieQuotas()
    assert.equal(others.length, 1)
    const [hours, bad] = others[0].windows
    assert.equal(hours.amount, 0.05)
    assert.equal(hours.limit, 10)
    assert.equal(hours.unit, 'h')
    assert.equal(bad.amount, null)
    assert.equal(bad.limit, null)
    assert.equal(bad.unit, null)
  } finally { globalThis.fetch = oldFetch }
})

test('a failed or empty account is reported as partial instead of silently omitted', async () => {
  for (const missing of [{ provider: 'codex', error: 'unavailable' }, record(null, [])]) {
    const result = await read([record('2026-11-21T02:00:00Z', [win('5 hours', 10)]), missing])
    assert.equal(result.status, 'partial')
    assert.equal(result.windows[0].remaining, 10)
  }
})

test('quota windows follow the account Magpie is actually serving', async () => {
  const oldFetch = globalThis.fetch
  const accounts = join(tmpdir(), `magpie-usage-${process.pid}-${Date.now()}.jsonl`)
  writeFileSync(accounts, [
    JSON.stringify({ t: '2026-11-21T20:00:00+08:00', provider: 'agy-cli', providerAccount: 'first@example.com' }),
    JSON.stringify({ t: '2026-11-21T21:00:00+08:00', provider: 'agy-cli', providerAccount: 'second@example.com' }),
  ].join('\n') + '\n')
  globalThis.fetch = async () => new Response(JSON.stringify({
    object: 'list',
    data: [
      { provider: 'agy-cli', user: 'first@example.com', kind: 'subscription', readAt: '2026-11-21T21:00:00+08:00', windows: [{ name: 'Gemini · 5 hours', remaining: 90, resetsAt: '2026-11-21T10:00:00Z' }] },
      { provider: 'agy-cli', user: 'second@example.com', kind: 'subscription', readAt: '2026-11-21T21:00:00+08:00', windows: [{ name: 'Gemini · 5 hours', remaining: 12, resetsAt: '2026-11-21T10:00:00Z' }] },
    ],
  }))
  try {
    const result = await readMagpieQuotas({ usagePath: accounts })
    assert.equal(result.antigravity.windows[0].remaining, 12)
    assert.equal(result.antigravity.account, 'sec…@example.com')
  } finally {
    globalThis.fetch = oldFetch
    rmSync(accounts, { force: true })
  }
})

test('active account lookup keeps the newest line per provider', async () => {
  const accounts = join(tmpdir(), `magpie-usage-${process.pid}-${Date.now()}-b.jsonl`)
  writeFileSync(accounts, [
    JSON.stringify({ t: '2026-11-21T20:00:00+08:00', provider: 'codex', providerAccount: 'old@example.com' }),
    JSON.stringify({ provider: 'codex', providerAccount: 'no-time@example.com' }),
    JSON.stringify({ t: '2026-11-21T21:00:00+08:00', provider: 'codex', providerAccount: 'new@example.com' }),
    JSON.stringify({ t: '2026-11-21T21:00:00+08:00', provider: 'agy-cli', providerAccount: 'agy@example.com' }),
    'not json',
  ].join('\n') + '\n')
  try {
    const active = await readActiveAccounts({ path: accounts })
    assert.equal(active.get('codex').account, 'new@example.com')
    assert.equal(active.get('agy-cli').account, 'agy@example.com')
  } finally {
    rmSync(accounts, { force: true })
  }
})
