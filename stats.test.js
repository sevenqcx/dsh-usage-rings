import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// Exercise the same pure window fallback shipped in the browser module.
async function loadWindowStats() {
  const source = await readFile(new URL('./client.js', import.meta.url), 'utf8')
  const start = source.indexOf('    const finiteNonnegative =')
  const end = source.indexOf('    // Replaces the host\'s activity seat', start)
  assert.ok(start >= 0 && end > start, 'statistics helper exists')
  return vm.runInNewContext(`${source.slice(start, end)}\nwindowStats`)
}

test('window fallback counts turns, steps and timed usage without counting untimed output', async () => {
  const fold = await loadWindowStats()
  const stats = fold([
    { kind: 'assistant', turn: 1, timing: { stepStartTime: 1000, firstTokenTime: 1200, completedTime: 2200 }, usage: { outputTokens: 50 } },
    { kind: 'tool-result', time: 1800, callTime: 1500 },
    { kind: 'assistant', turn: 1, timing: { stepStartTime: 3000, firstTokenTime: null, completedTime: 4000 }, usage: { outputTokens: 99 } },
    { kind: 'assistant', turn: 2 },
  ])
  assert.deepEqual({ ...stats }, { turns: 2, steps: 3, llmMs: 2200, toolMs: 300, ttftMs: 200, ttftSteps: 1, decodeMs: 1000, decodeTokens: 50 })
})

test('window fallback handles missing and invalid timing without fabricating usage', async () => {
  const fold = await loadWindowStats()
  const stats = fold([
    { kind: 'assistant', turn: 1, timing: { stepStartTime: 5, firstTokenTime: 4, completedTime: 3 }, usage: { outputTokens: -1 } },
    { kind: 'tool-result', time: 5, callTime: null },
  ])
  assert.deepEqual({ ...stats }, { turns: 1, steps: 1, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 1, decodeMs: 0, decodeTokens: 0 })
})
