// Magpie 额度圆环 · main.js：AI 工具调用 + 面板请求，都转给 Node 小程序
const TOOLS = { magpie_usage: 20000, codex_reset_cards: 15000, codex_use_reset_card: 20000, workbuddy_checkin: 90000 };
async function run(method, params) {
  try { return await cindy.node.request({ method: method, params: params || {}, timeoutMs: TOOLS[method] }); }
  catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}
cindy.onHostMessage(async function (msg) {
  if (msg.type !== 'tool-call' || !TOOLS[msg.tool]) return;
  const r = await run(msg.tool, msg.args);
  if (!r.ok) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'USAGE_FAILED', message: r.message }); return; }
  await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: r.result });
});
// 面板通道：按 reqId 去重，结果缓存一会儿供面板重发时直接取
try {
  const ch = new BroadcastChannel('magpie-rings');
  const seen = new Map();
  ch.onmessage = async function (ev) {
    const m = ev.data || {};
    if (m.kind !== 'req' || !TOOLS[m.method] || !m.reqId) return;
    if (seen.has(m.reqId)) { const v = seen.get(m.reqId); if (v) ch.postMessage(v); return; }
    seen.set(m.reqId, null);
    const r = await run(m.method, m.params);
    const out = { kind: 'res', reqId: m.reqId, ok: !!r.ok, result: r.result, message: r.message };
    seen.set(m.reqId, out);
    if (seen.size > 50) seen.delete(seen.keys().next().value);
    ch.postMessage(out);
  };
} catch (e) {}
