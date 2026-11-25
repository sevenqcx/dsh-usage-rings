const endpoint = 'http://127.0.0.1:3425/v1/magpie/quotas/cards'
const maxBytes = 1024 * 1024

// Only the most recently requested, successfully validated list can authorize
// a card selection. A submission invalidates the list before contacting Magpie.
let cachedAccounts = []
let generation = 0

export async function readResetCards() {
  const requestGeneration = ++generation
  cachedAccounts = []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(endpoint, { method: 'GET', redirect: 'error', credentials: 'omit', signal: controller.signal })
    if (!response.ok) throw new Error(`cards request failed (HTTP ${response.status})`)
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.byteLength
      if (size > maxBytes) throw new Error('cards response too large')
      chunks.push(chunk)
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (payload?.object !== 'list' || !Array.isArray(payload.data)) throw new Error('invalid cards list')
    const accounts = []
    const users = new Set()
    for (const record of payload.data) {
      if (record?.provider !== 'codex') continue
      const resets = record.resets
      if (typeof record.user !== 'string' || !record.user.trim() || users.has(record.user) ||
          !resets || !Number.isSafeInteger(resets.count) || resets.count < 0 ||
          !(resets.until === null || typeof resets.until === 'string') || !Array.isArray(resets.each)) {
        throw new Error('invalid codex cards record')
      }
      const ids = new Set()
      const each = resets.each.map(card => {
        if (!card || typeof card.id !== 'string' || !card.id.trim() || ids.has(card.id) ||
            !(card.until === null || typeof card.until === 'string')) throw new Error('invalid codex card')
        ids.add(card.id)
        return { id: card.id, until: card.until }
      })
      users.add(record.user)
      accounts.push({ user: record.user, count: resets.count, until: resets.until, each })
    }
    if (requestGeneration !== generation) return { accounts: [], error: 'cards request superseded' }
    // Avoid exposing the authorization cache through mutable returned objects.
    cachedAccounts = structuredClone(accounts)
    return { accounts }
  } catch (error) {
    if (requestGeneration === generation) cachedAccounts = []
    return { accounts: [], error: error instanceof Error ? error.message : 'cards request failed' }
  } finally {
    clearTimeout(timer)
  }
}

export async function useResetCard({ user, credit } = {}) {
  if (typeof user !== 'string' || typeof credit !== 'string' || !user || !credit) {
    return { ok: false, completed: false, error: 'user and credit are required' }
  }
  const account = cachedAccounts.find(item => item.user === user)
  if (!account || !account.each.some(card => card.id === credit)) {
    return { ok: false, completed: false, error: 'user or card is not in the current cards list' }
  }
  ++generation
  cachedAccounts = []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3500)
  try {
    const url = new URL('http://127.0.0.1:3425/v1/magpie/quotas/codex-reset')
    url.searchParams.set('user', user)
    url.searchParams.set('credit', credit)
    const response = await fetch(url, { method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal })
    if (!response.ok) return { ok: false, completed: false, error: `reset request failed (HTTP ${response.status})` }
    const payload = await response.json()
    if (payload?.code !== 'reset' || !Number.isFinite(payload.windows) || payload.windows < 0) {
      return { ok: false, completed: false, code: typeof payload?.code === 'string' ? payload.code : 'unknown', error: 'reset response did not confirm success' }
    }
    return { ok: true, completed: true, code: payload.code, windows: payload.windows }
  } catch (error) {
    return { ok: false, completed: false, error: error instanceof Error ? error.message : 'reset request failed' }
  } finally {
    clearTimeout(timer)
  }
}
