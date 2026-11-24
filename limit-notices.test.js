import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLimitNotices } from './quotas.js'

const now = Date.parse('2026-11-24T16:40:00+08:00')
const rec = (user) => ({ provider: 'agy-cli', user, kind: 'subscription', windows: [
  { name: 'Gemini · 7 days', used: 20, remaining: 80, resetsAt: '2026-12-01T01:56:12Z', pool: 'Gemini' },
  { name: 'Claude & GPT · 7 days', used: 0, remaining: 100, resetsAt: '2026-11-29T06:39:38Z', pool: 'Claude & GPT', holdsWhy: 'low' },
] })
const notice = { account: 'a@x.com', model: 'claude-opus-5-5', until: '2026-11-26T17:32:13+08:00' }

test('active notice marks matching pool exhausted with its reset', () => {
  const [r] = applyLimitNotices([rec('a@x.com')], [notice], now)
  assert.equal(r.windows[1].remaining, 0)
  assert.equal(r.windows[1].resetsAt, notice.until)
  assert.equal(r.windows[0].remaining, 80)
})

test('expired notice is ignored; low-history 0% becomes unknown', () => {
  const [r] = applyLimitNotices([rec('a@x.com')], [{ ...notice, until: '2026-11-24T08:00:00+08:00' }], now)
  assert.equal(r.windows[1].remaining, null)
  assert.equal(r.windows[1].used, null)
})

test('notice for another account does not apply', () => {
  const [r] = applyLimitNotices([rec('b@x.com')], [notice], now)
  assert.equal(r.windows[1].remaining, null)
})

test('no notices file leaves real readings untouched', () => {
  const [r] = applyLimitNotices([rec('a@x.com')], [], now)
  assert.equal(r.windows[0].remaining, 80)
})

test('provider-prefixed notice key still matches the account', () => {
  const [r] = applyLimitNotices([rec('a@x.com')], [{ ...notice, account: 'agy-cli/a@x.com' }], now)
  assert.equal(r.windows[1].remaining, 0)
})

test('provider@account notice key (Magpie format) matches', () => {
  const [r] = applyLimitNotices([rec('a@x.com')], [{ ...notice, account: 'agy-cli@a@x.com' }], now)
  assert.equal(r.windows[1].remaining, 0)
})
