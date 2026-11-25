// Magpie 额度 · main.js：按当前任务所用模型显示对应额度；智能/免费分组显示全部
const TOOLS = { magpie_usage: 20000, codex_reset_cards: 15000, codex_use_reset_card: 20000, workbuddy_checkin: 90000 };
async function run(method, params) {
  try { return await cindy.node.request({ method: method, params: params || {}, timeoutMs: TOOLS[method] || 20000 }); }
  catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}
const left = (w) => w.remaining != null ? w.remaining : (w.used != null ? 100 - w.used : null);
const NAMES = { '5 hours': '5小时', '7 days': '周限', 'Total credits': '总额度', Credits: '积分' };

// 读任务当前模型（如 codex/gpt-6.1-terra、group/smart-split）
async function modelOf(sessionId) {
  if (!sessionId) return null;
  try {
    const r = await cindy.host.call('cindy_helper', 'get_session_runtime', { session_id: sessionId });
    const t = r && (r.structuredContent || JSON.parse(((r.content || []).find((b) => b.type === 'text') || {}).text || '{}'));
    const p = t && (t.pending && t.pending.profile || t.effective || t.baseline);
    return p && p.model || null;
  } catch (e) { return null; }
}
// 把模型对应到 Magpie 额度里的某个账号；对不上或是分组就返回 null = 显示全部
function pick(model, u) {
  if (!model || !u) return null;
  const pre = String(model).split('/')[0].toLowerCase();
  if (pre === 'group') return null;
  if (pre === 'codex') return u.codex ? { title: 'Codex', data: u.codex, key: 'codex' } : null;
  if (/^(agy|antigravity|gemini)/.test(pre)) return u.antigravity ? { title: 'Gemini · Antigravity', data: u.antigravity, key: 'antigravity' } : null;
  const o = (u.others || []).find((x) => { const p = String(x.provider || '').toLowerCase(); return p === pre || p.startsWith(pre) || pre.startsWith(p); });
  return o ? { title: o.provider, data: o, key: 'other' } : null;
}
function until(iso) {
  if (!iso) return ''; const ms = new Date(iso) - Date.now(); if (ms <= 0) return '';
  const m = Math.round(ms / 60000);
  return m < 60 ? m + '分钟' : m < 1440 ? Math.floor(m / 60) + '小时' : Math.floor(m / 1440) + '天';
}
function label(sel) {
  if (!sel) return 'Magpie 额度';
  const ws = (sel.data.windows || []).filter((w) => left(w) != null && !w.text);
  if (!ws.length) return sel.data.balance ? sel.title + ' 余额 ' + sel.data.balance : sel.title;
  return ws.slice(0, 2).map((w) => {
    const p = Math.max(0, Math.round(left(w)));
    return (NAMES[w.name] || w.name) + ' 剩余 ' + (p <= 0 && until(w.resetsAt) ? '0%（' + until(w.resetsAt) + '后）' : p + '%');
  }).join(' | ');
}

let last = null, lastAt = 0, timer = null;
const sessions = new Set();
function collect(msg) {
  const walk = (v) => { if (!v || typeof v !== 'object') return; if (typeof v.sessionId === 'string') sessions.add(v.sessionId); Object.values(v).forEach(walk); };
  walk(msg);
}
async function usage(force) {
  if (force || !last || Date.now() - lastAt > 50000) { const r = await run('magpie_usage', {}); if (r.ok) { last = r.result; lastAt = Date.now(); } }
  return last;
}
async function publish() {
  if (!cindy.ui?.hasConsumers?.('usage')) { sessions.clear(); return; }
  const u = await usage(false);
  if (!sessions.size) { await cindy.ui.updateContribution('usage', () => ({ title: 'Magpie 额度' })); return; }
  for (const sid of sessions) {
    if (!cindy.ui.hasConsumers('usage', { sessionId: sid })) { sessions.delete(sid); continue; }
    const sel = pick(await modelOf(sid), u);
    await cindy.ui.updateContribution('usage', () => ({ title: u ? label(sel) : 'Magpie 读取中' }), { sessionId: sid });
  }
}
function ensure() { if (!timer) timer = setInterval(() => { if (!cindy.ui?.hasConsumers?.('usage')) { clearInterval(timer); timer = null; return; } void publish(); }, 30000); }

cindy.onHostMessage(async function (msg) {
  if (msg.type === 'ui-consumers') { collect(msg); await publish(); ensure(); return; }
  if (msg.type !== 'tool-call') return;
  if (msg.tool === 'magpie_view') {
    const a = msg.args || {};
    const sid = a.sessionId || (a.cindy_ui && a.cindy_ui.sessionId) || (a.session_context && a.session_context.session_id) || [...sessions][0];
    const u = await usage(!!a.refresh);
    if (!u) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'USAGE_FAILED', message: 'Magpie 读取失败' }); return; }
    const model = await modelOf(sid), sel = pick(model, u);
    const res = { model: model, mode: sel ? 'one' : 'all', key: sel && sel.key, title: sel && sel.title, one: sel && sel.data, all: u };
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result: { content: [{ type: 'text', text: JSON.stringify(res) }], structuredContent: res } });
    return;
  }
  if (!TOOLS[msg.tool]) return;
  const r = await run(msg.tool, msg.args);
  if (!r.ok) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'USAGE_FAILED', message: r.message }); return; }
  if (msg.tool === 'magpie_usage' && !(msg.args && msg.args.provider)) { last = r.result; lastAt = Date.now(); void publish(); }
  await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true,
    result: { content: [{ type: 'text', text: JSON.stringify(r.result) }], structuredContent: r.result } });
});
void cindy.ping().then(() => { void publish(); ensure(); });
