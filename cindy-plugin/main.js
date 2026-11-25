// Magpie 额度圆环 · main.js：把 AI 的工具调用转给 Node 小程序
const TOOLS = { magpie_usage: 20000, codex_reset_cards: 15000, codex_use_reset_card: 20000, workbuddy_checkin: 90000 };
cindy.onHostMessage(async function (msg) {
  if (msg.type !== 'tool-call' || !TOOLS[msg.tool]) return;
  let r;
  try { r = await cindy.node.request({ method: msg.tool, params: msg.args || {}, timeoutMs: TOOLS[msg.tool] }); }
  catch (e) { r = { ok: false, message: String((e && e.message) || e) }; }
  if (!r.ok) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'USAGE_FAILED', message: r.message }); return; }
  await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: r.result });
});
