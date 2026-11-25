// Magpie 额度圆环 · main.js：AI 工具调用、弹出面板调用、底栏状态按钮
const TOOLS = { magpie_usage: 20000, codex_reset_cards: 15000, codex_use_reset_card: 20000, workbuddy_checkin: 90000 };
async function run(method, params) {
  try { return await cindy.node.request({ method: method, params: params || {}, timeoutMs: TOOLS[method] }); }
  catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

// —— 底栏：用圆环字符模拟 dsh 的小圆环 ——
const GLYPH = (p) => p == null ? '◌' : p <= 5 ? '○' : p < 38 ? '◔' : p < 63 ? '◑' : p < 95 ? '◕' : '●';
const left = (w) => w.remaining != null ? w.remaining : (w.used != null ? 100 - w.used : null);
function until(iso) {
  if (!iso) return '';
  const ms = new Date(iso) - Date.now(); if (ms <= 0) return '';
  const m = Math.round(ms / 60000);
  return m < 60 ? m + '分钟' : m < 1440 ? Math.floor(m / 60) + '小时' : Math.floor(m / 1440) + '天';
}
function label(name, data) {
  const ws = (data && data.windows || []).filter((w) => left(w) != null);
  if (!ws.length) return '◌ — ' + name;
  const w = ws.reduce((a, b) => left(a) <= left(b) ? a : b); // 最紧的那个窗口
  const p = Math.max(0, Math.round(left(w)));
  if (p <= 0 && until(w.resetsAt)) return '○ ' + until(w.resetsAt) + ' ' + name;
  return GLYPH(p) + ' ' + p + '% ' + name;
}
let last = null, timer = null;
function anyone() { return ['codex', 'gemini', 'others'].some((id) => cindy.ui?.hasConsumers?.(id)); }
async function refresh() {
  if (!anyone()) { clearInterval(timer); timer = null; return; }
  const r = await run('magpie_usage', {});
  if (r.ok) last = r.result;
  publish();
}
function publish() {
  const u = last || {};
  cindy.ui?.updateContribution('codex', () => ({ title: last ? label('Codex', u.codex) : '◌ 读取中 Codex' }));
  cindy.ui?.updateContribution('gemini', () => ({ title: last ? label('Gemini', u.antigravity) : '◌ 读取中 Gemini' }));
}
function ensure() { if (!timer && anyone()) { timer = setInterval(refresh, 60000); void refresh(); } }

cindy.onHostMessage(async function (msg) {
  if (msg.type === 'ui-consumers') { publish(); ensure(); return; }
  if (msg.type !== 'tool-call' || !TOOLS[msg.tool]) return;
  const r = await run(msg.tool, msg.args);
  if (!r.ok) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'USAGE_FAILED', message: r.message }); return; }
  if (msg.tool === 'magpie_usage' && !(msg.args && msg.args.provider)) { last = r.result; publish(); }
  await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true,
    result: { content: [{ type: 'text', text: JSON.stringify(r.result) }], structuredContent: r.result } });
});
void cindy.ping().then(() => { publish(); ensure(); });
