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

test('selected windows carry source observation times; aggregate uses oldest instant', async () => {
  const result = await read([
    record('2026-11-21T09:00:00+08:00', [win('5 hours', 10), win('7 days', 50)]),
    record('2026-11-21T02:00:00Z', [win('5 hours', 30), win('7 days', 20)]),
  ])
  assert.equal(result.readAt, '2026-11-21T09:00:00+08:00')
  assert.deepEqual(result.windows.map(w => [w.remaining, w.readAt]), [[30, '2026-11-21T02:00:00Z'], [50, '2026-11-21T09:00:00+08:00']])
})

test('unknown selected window time makes aggregate time unknown', async () => {
  const result = await read([record(null, [win('5 hours', 10)]), record('2026-11-21T02:00:00Z', [win('7 days', 20)])])
  assert.equal(result.readAt, null)
  assert.equal(result.windows[0].readAt, null)
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
