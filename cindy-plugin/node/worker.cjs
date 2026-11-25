'use strict';
// Magpie 额度圆环 · Node 工作进程：复用 dsh-usage-rings 的 quotas / reset-cards 逻辑
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const load = (f) => import('file://' + path.join(__dirname, f));

function magpieBin() {
  if (process.env.MAGPIE_BIN) return process.env.MAGPIE_BIN;
  for (const c of ['/Applications/magpie.app/Contents/MacOS/magpie', '/Applications/Magpie.app/Contents/MacOS/magpie']) if (fs.existsSync(c)) return c;
  return 'magpie';
}
const ALIAS = { antigravity: 'agy-cli', agy: 'agy-cli', gemini: 'agy-cli' };

const METHODS = {
  async magpie_usage(p) {
    const q = await load('quotas.mjs');
    const all = await q.readMagpieQuotas();
    const want = String((p && p.provider) || '').trim().toLowerCase();
    if (!want) return all;
    const key = ALIAS[want] || want;
    const out = {};
    if (key === 'codex') out.codex = all.codex;
    if (key === 'agy-cli') out.antigravity = all.antigravity;
    out.others = all.others.filter((o) => o.provider.toLowerCase().includes(want) || o.provider.toLowerCase() === key);
    return out;
  },
  async codex_reset_cards() { return (await load('reset-cards.mjs')).readResetCards(); },
  async codex_use_reset_card(p) {
    const m = await load('reset-cards.mjs');
    await m.readResetCards(); // 先刷新授权清单（Node 进程可能刚重启）
    return m.useResetCard(p || {});
  },
  async workbuddy_checkin() {
    return new Promise((resolve) => execFile(magpieBin(), ['accounts', 'checkin'], { timeout: 60000, maxBuffer: 65536 },
      (err, stdout) => resolve({ completed: !err, error: err ? String(err.message).slice(0, 200) : null, output: String(stdout || '').slice(0, 2000) })));
  },
};

const reply = (m) => process.stdout.write(JSON.stringify(m) + '\n');
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let req; try { req = JSON.parse(line); } catch (_) { reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
  const fn = METHODS[req.method];
  if (!fn) { reply({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }); return; }
  try { reply({ jsonrpc: '2.0', id: req.id, result: await fn(req.params) }); }
  catch (e) { reply({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: String((e && e.message) || e) } }); }
});
