import test from 'node:test'
import assert from 'node:assert/strict'
import { readResetCards, useResetCard } from './reset-cards.js'

const list = () => ({ object: 'list', data: [
  { provider: 'codex', user: 'one@example.com', resets: { count: 1, until: 'tomorrow', each: [{ id: 'card & 1', until: 'tomorrow' }] } },
  { provider: 'other', user: 'ignored' },
  { provider: 'codex', user: 'two@example.com', resets: { count: 1, until: null, each: [{ id: 'card-2', until: null }] } },
] })

test('cards require an exact current account and card pair; fetch is mocked', async () => {
  const original = globalThis.fetch
  const requests = []
  let response = () => Response.json(list())
  globalThis.fetch = async (url, options) => { requests.push({ url: String(url), options }); return response() }
  try {
    assert.equal((await useResetCard({ user: 'one@example.com', credit: 'card & 1' })).ok, false)
    assert.deepEqual((await readResetCards()).accounts, [
      { user: 'one@example.com', count: 1, until: 'tomorrow', each: [{ id: 'card & 1', until: 'tomorrow' }] },
      { user: 'two@example.com', count: 1, until: null, each: [{ id: 'card-2', until: null }] },
    ])
    assert.equal((await useResetCard({ user: 'one@example.com', credit: 'card-2' })).ok, false)
    assert.equal((await useResetCard({ user: 'nobody', credit: 'card & 1' })).ok, false)
    assert.equal(requests.length, 1)
    response = () => Response.json({ code: 'reset', windows: 2 })
    assert.deepEqual(await useResetCard({ user: 'one@example.com', credit: 'card & 1' }), { ok: true, completed: true, code: 'reset', windows: 2 })
    assert.equal(requests[1].options.method, 'POST')
    const url = new URL(requests[1].url)
    assert.equal(url.pathname, '/v1/magpie/quotas/codex-reset')
    assert.equal(url.searchParams.get('user'), 'one@example.com')
    assert.equal(url.searchParams.get('credit'), 'card & 1')
    assert.equal((await useResetCard({ user: 'one@example.com', credit: 'card & 1' })).ok, false)
    assert.equal(requests.length, 2)
    response = () => Response.json(list())
    await readResetCards()
    response = () => new Response('down', { status: 503 })
    assert.match((await readResetCards()).error, /503/)
    assert.equal((await useResetCard({ user: 'one@example.com', credit: 'card & 1' })).ok, false)
    response = () => Response.json(list())
    await readResetCards()
    response = () => Response.json({ code: 'no_credit', windows: 0 })
    assert.equal((await useResetCard({ user: 'one@example.com', credit: 'card & 1' })).ok, false)
  } finally { globalThis.fetch = original }
})
