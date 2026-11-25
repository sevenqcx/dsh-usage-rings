const ch = new BroadcastChannel('magpie-rings');
const pending = new Map();
const ID = 'magpie-usage-rings';
ch.onmessage = (ev) => { const m = ev.data || {}; const p = pending.get(m.reqId); if (m.kind === 'res' && p) { pending.delete(m.reqId); clearInterval(p.timer); p.resolve(m); } };
async function call(method, params, timeoutMs = 30000) {
  try { await fetch('cindy-ghost://' + ID + '/wake'); } catch (e) {}
  const reqId = method + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const send = () => ch.postMessage({ kind: 'req', reqId, method, params: params || {} });
    const timer = setInterval(send, 600); send();
    pending.set(reqId, { resolve, timer });
    setTimeout(() => { if (pending.has(reqId)) { pending.delete(reqId); clearInterval(timer); resolve({ ok: false, message: '超时' }); } }, timeoutMs);
  });
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const left = (w) => w.remaining != null ? w.remaining : (w.used != null ? 100 - w.used : null);
const color = (p) => p == null ? '#999' : p <= 10 ? '#d9534f' : p <= 30 ? '#f0ad4e' : '#3cae6b';
const NAMES = { '5 hours': '5 小时', '7 days': '7 天', 'Image generation': '生图' };
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso), ms = d - Date.now();
  if (ms <= 0) return '已重置';
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
  const rel = h >= 24 ? Math.floor(h / 24) + ' 天 ' + (h % 24) + ' 时' : h + ' 时 ' + m + ' 分';
  return rel + '后重置';
}
function ring(w) {
  const p = left(w), r = 30, c = 2 * Math.PI * r, off = p == null ? c : c * (1 - p / 100);
  return '<div class="ring"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" fill="none" stroke="var(--border-default,#e4e4e0)" stroke-width="7"/>' +
    '<circle cx="36" cy="36" r="30" fill="none" stroke="' + color(p) + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 36 36)"/>' +
    '<text x="36" y="41" text-anchor="middle" font-size="15" font-weight="600" fill="currentColor">' + (p == null ? '—' : Math.round(p) + '%') + '</text></svg>' +
    '<div class="name">' + esc(NAMES[w.name] || w.name) + '</div><div class="reset">' + esc(when(w.resetsAt)) + '</div></div>';
}
function rings(el, acctEl, data) {
  acctEl.textContent = data && data.account ? data.account : '';
  el.innerHTML = data && data.windows && data.windows.length ? data.windows.map(ring).join('') : '<span class="muted">暂无数据（Magpie 没开？）</span>';
}
function others(list) {
  if (!list || !list.length) { $('others').innerHTML = '<span class="muted">暂无</span>'; return; }
  $('others').innerHTML = list.map((o) => {
    const title = esc(o.alias || o.account || '') ;
    const head = '<div class="t"><b>' + esc(o.provider) + '</b><span class="muted">' + title + '</span></div>';
    if (o.status !== 'available') return '<div class="row">' + head + '<div class="muted">读取失败 ' + esc(o.errorText || '') + '</div></div>';
    const bal = o.balance ? '<div>余额：<b>' + esc(o.balance) + '</b></div>' : '';
    const bars = (o.windows || []).map((w) => { const p = left(w); return '<div class="b"><div class="t"><span>' + esc(w.display || w.name) + '</span><span>' + (p == null ? '—' : Math.round(p) + '%') + '</span></div><div class="track"><div class="fill" style="width:' + (p || 0) + '%;background:' + color(p) + '"></div></div><div class="muted">' + esc(when(w.resetsAt)) + '</div></div>'; }).join('');
    const notes = (o.notes || []).map((n) => '<div class="muted">' + esc(n) + '</div>').join('');
    return '<div class="row">' + head + bal + '<div class="bars">' + bars + '</div>' + notes + '</div>';
  }).join('');
}
let armed = null;
function cards(res) {
  const accts = res && res.accounts || [];
  if (!accts.length) { $('cards').innerHTML = '<span class="muted">' + (res && res.error ? '读取失败' : '没有重置卡') + '</span>'; return; }
  $('cards').innerHTML = accts.map((a) => '<div class="row"><div class="t"><b>' + esc(a.user) + '</b><span>' + a.count + ' 张</span></div>' +
    a.each.map((c) => '<div class="t" style="margin-top:4px"><span class="muted">' + new Date(c.until).toLocaleDateString('zh-CN') + ' 到期</span><button data-u="' + esc(a.user) + '" data-c="' + esc(c.id) + '">用这张</button></div>').join('') + '</div>').join('');
  $('cards').querySelectorAll('button').forEach((b) => b.onclick = async () => {
    if (armed !== b) { if (armed) { armed.textContent = '用这张'; armed.classList.remove('danger'); } armed = b; b.textContent = '再点确认'; b.classList.add('danger'); return; }
    b.disabled = true; b.textContent = '使用中…';
    const r = await call('codex_use_reset_card', { user: b.dataset.u, credit: b.dataset.c });
    b.textContent = r.ok && r.result && r.result.completed ? '已重置 ✅' : '失败';
    armed = null; setTimeout(load, 1500);
  });
}
async function load() {
  $('refresh').disabled = true;
  const [u, c] = await Promise.all([call('magpie_usage', {}), call('codex_reset_cards', {})]);
  $('refresh').disabled = false;
  if (u.ok) { rings($('codex'), $('codexAcct'), u.result.codex); rings($('agy'), $('agyAcct'), u.result.antigravity); others(u.result.others); $('stamp').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  else $('stamp').textContent = '读取失败：' + (u.message || '');
  cards(c.ok ? c.result : { error: true });
}
$('refresh').onclick = load;
$('checkin').onclick = async () => {
  $('checkin').disabled = true; $('checkinMsg').textContent = '签到中…';
  const r = await call('workbuddy_checkin', {}, 90000);
  $('checkin').disabled = false;
  $('checkinMsg').textContent = r.ok && r.result && r.result.completed ? '签到完成 ✅' : '签到失败';
};
load(); setInterval(load, 60000);
