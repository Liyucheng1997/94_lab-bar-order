// =========================================================
// 商家后台
// =========================================================
const { drinkArt, icon, esc, money, GLASS_NAMES } = window.BarUI;
const el = (id) => document.getElementById(id);

const STATUS_NAME = { pending: '待接单', making: '制作中', done: '已完成', cancelled: '已取消' };
const TAGS = { signature: '招牌', new: '新品', hot: '人气', na: '无酒精' };
const TINTS = ['#8cc49a', '#e2cf74', '#c2412b', '#c47a2c', '#e6bb5c', '#5a3b28', '#d9952f', '#7d9ad0', '#a9cbe0', '#f2a33c', '#b48ad6', '#e57fa0'];
const SHARE_COLORS = ['#d4ab62', '#74a9e6', '#6fbf8e', '#e2685a', '#b48ad6', '#5cc3c0', '#e9a23b', '#a5998a'];
const VIEW_TITLES = { orders: '实时订单', history: '历史订单', menu: '菜单管理', tables: '桌台二维码', stats: '营业统计', settings: '店铺设置' };

const state = {
  shopName: 'The Bar',
  orders: [],
  known: new Set(),
  fresh: new Set(),
  calls: [],
  menu: { categories: [] },
  tables: [],
  view: 'orders',
  es: null,
  started: false,
};

// ---------- 偏好（本机） ----------
const prefs = (() => {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('bar.admin.prefs') || '{}'); } catch (e) {}
  return { sound: p.sound !== false, remind: p.remind !== false, autoPrint: !!p.autoPrint };
})();
function savePrefs() { try { localStorage.setItem('bar.admin.prefs', JSON.stringify(prefs)); } catch (e) {} }

// ---------- 工具 ----------
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((n) => {
    if (n.tagName === 'SPAN') n.outerHTML = icon(n.dataset.icon);
    else { n.innerHTML = icon(n.dataset.icon); n.removeAttribute('data-icon'); }
  });
}

async function api(url, opts = {}) {
  const o = { ...opts };
  if (o.body && typeof o.body !== 'string') {
    o.body = JSON.stringify(o.body);
    o.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, o);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.includes('/login')) {
    showLogin();
    throw new Error(data.error || '登录已过期');
  }
  if (!res.ok) throw new Error(data.error || '操作失败');
  return data;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fullTime = (iso) => { const d = new Date(iso); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm(iso)}`; };
function since(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分前';
}
const isToday = (iso) => localDate(new Date(iso)) === localDate(new Date());

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast simple' + (kind === 'error' ? ' error' : '');
  t.innerHTML = icon(kind === 'error' ? 'close' : 'check') + `<span>${esc(msg)}</span>`;
  el('toasts').appendChild(t);
  setTimeout(() => dismissToast(t), 2600);
}
function dismissToast(t) {
  if (!t.isConnected) return;
  t.classList.add('out');
  setTimeout(() => t.remove(), 300);
}

function artHTML(item, cls) {
  return `<div class="art ${cls || ''}" style="--tint:${esc(item.tint || '#c9a46a')}">${
    item.image ? `<img src="${esc(item.image)}" alt="">` : drinkArt(item.glass, item.tint)
  }</div>`;
}

// ---------- 弹窗 ----------
function openModal(html, cls) {
  const card = el('modalCard');
  card.className = 'modal-card ' + (cls || '');
  card.innerHTML = html;
  el('modal').classList.remove('hidden');
  hydrateIcons(card);
  const first = card.querySelector('input:not([type=checkbox]):not([type=color]), textarea');
  if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() { el('modal').classList.add('hidden'); el('modalCard').innerHTML = ''; }
el('modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('modal').classList.contains('hidden')) closeModal(); });

function confirmBox(title, text, okLabel, danger) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><p>${esc(text)}</p></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-r="0" type="button">取消</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-r="1" type="button">${esc(okLabel || '确定')}</button>
      </div>`, 'sm');
    el('modalCard').onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      el('modalCard').onclick = null;
      closeModal();
      resolve(b.dataset.r === '1');
    };
  });
}

// ---------- 声音 ----------
let actx = null;
function audio() {
  if (!actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (C) actx = new C();
  }
  return actx;
}
function tone(freq, start, dur, type, vol) {
  const ctx = audio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}
function chime(kind, force) {
  if (!prefs.sound && !force) return;
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (kind === 'call') {
    [0, 0.45].forEach((s) => { tone(988, s, 0.22, 'square', 0.07); tone(784, s + 0.16, 0.3, 'square', 0.07); });
  } else {
    [[659.25, 0], [830.6, 0.13], [987.8, 0.26], [1318.5, 0.39]].forEach(([f, s]) => {
      tone(f, s, 1.0, 'sine', 0.24);
      tone(f * 2, s, 0.5, 'triangle', 0.035);
    });
  }
}
function checkAudio() {
  const ctx = audio();
  el('audioBanner').classList.toggle('hidden', !prefs.sound || !ctx || ctx.state === 'running');
}
document.addEventListener('pointerdown', () => {
  const ctx = audio();
  if (ctx && ctx.state !== 'running') ctx.resume().then(checkAudio);
}, true);
el('audioBanner').addEventListener('click', () => { const c = audio(); if (c) c.resume().then(() => { checkAudio(); chime('order', true); }); });

// ---------- 登录 ----------
async function showLogin() {
  if (state.es) { state.es.close(); state.es = null; }
  el('shell').classList.add('hidden');
  el('login').classList.remove('hidden');
  try {
    const info = await (await fetch('/api/public/info')).json();
    el('loginShop').textContent = info.shopName || 'The Bar';
  } catch (e) {}
  setTimeout(() => el('pin').focus(), 50);
}

el('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('loginErr').textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { pin: el('pin').value } });
    el('pin').value = '';
    startApp();
  } catch (err) {
    el('loginErr').textContent = err.message;
    const card = document.querySelector('.login-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    el('pin').select();
  }
});

el('logout').addEventListener('click', async () => {
  if (!(await confirmBox('退出登录', '退出后将不再接收新订单提醒，确定退出吗？', '退出', true))) return;
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

async function startApp() {
  el('login').classList.add('hidden');
  el('shell').classList.remove('hidden');
  try {
    const me = await api('/api/admin/me');
    setShopName(me.shopName);
  } catch (e) { return; }
  await Promise.all([loadOrders(), loadCalls()]);
  connect();
  checkAudio();
  if (!state.started) {
    state.started = true;
    setInterval(tickClock, 1000);
    setInterval(() => { if (state.view === 'orders') renderBoard(); }, 20000);
    setInterval(remindTick, 30000);
    setInterval(() => loadOrders(), 60000);
  }
  tickClock();
  switchView(state.view);
}

function setShopName(name) {
  state.shopName = name || 'The Bar';
  el('brandName').textContent = state.shopName;
  el('loginShop').textContent = state.shopName;
}

// ---------- 实时连接 ----------
function setConn(s) {
  const c = el('conn');
  c.className = 'conn ' + s;
  c.querySelector('span').textContent = s === 'on' ? '实时接单中' : s === 'off' ? '连接断开，重连中…' : '连接中…';
}

function connect() {
  if (state.es) state.es.close();
  setConn('');
  const es = new EventSource('/api/stream/admin');
  state.es = es;
  es.addEventListener('hello', () => { setConn('on'); loadOrders(); loadCalls(); });
  es.onerror = () => {
    setConn('off');
    if (es.readyState === 2) {
      // 连接被拒（可能登录过期），稍后检查后重连
      setTimeout(async () => {
        try { await api('/api/admin/me'); if (state.es === es) connect(); } catch (e) {}
      }, 4000);
    }
  };
  es.addEventListener('order:new', (e) => onNewOrder(JSON.parse(e.data)));
  es.addEventListener('order:update', (e) => { upsertOrder(JSON.parse(e.data)); refreshOrders(); });
  es.addEventListener('order:delete', (e) => {
    const { id } = JSON.parse(e.data);
    state.orders = state.orders.filter((o) => o.id !== id);
    refreshOrders();
  });
  es.addEventListener('call', (e) => onCall(JSON.parse(e.data)));
  es.addEventListener('call:handled', (e) => {
    const { id } = JSON.parse(e.data);
    state.calls = state.calls.filter((c) => c.id !== id);
    renderCalls();
  });
  es.addEventListener('menu', () => { if (state.view === 'menu') loadMenu(); });
}

// ---------- 订单数据 ----------
async function loadOrders() {
  try {
    const { orders } = await api('/api/orders');
    state.orders = orders;
    orders.forEach((o) => state.known.add(o.id));
    refreshOrders();
  } catch (e) {}
}

function upsertOrder(o) {
  const i = state.orders.findIndex((x) => x.id === o.id);
  if (i >= 0) state.orders[i] = o; else state.orders.unshift(o);
  state.orders.sort((a, b) => b.id - a.id);
}

function onNewOrder(o) {
  const isNew = !state.known.has(o.id);
  state.known.add(o.id);
  upsertOrder(o);
  if (isNew) {
    state.fresh.add(o.id);
    setTimeout(() => state.fresh.delete(o.id), 1500);
    chime('order');
    orderToast(o);
    systemNotify(`新订单 · 桌号 ${o.table}`, o.items.map((i) => `${i.name}×${i.qty}`).join('，') + ` ¥${money(o.total)}`, 'order-' + o.id);
    if (prefs.autoPrint) queuePrint(o);
  }
  refreshOrders();
}

function refreshOrders() {
  // 已被处理的订单，收起其新单弹窗
  document.querySelectorAll('.toast.order[data-order]').forEach((t) => {
    const o = state.orders.find((x) => x.id === +t.dataset.order);
    if (!o || o.status !== 'pending') dismissToast(t);
  });
  renderKpis();
  if (state.view === 'orders') renderBoard();
  if (state.view === 'history') renderHistory();
}

function renderKpis() {
  const today = state.orders.filter((o) => o.status !== 'cancelled' && isToday(o.createdAt));
  el('kpiRevenue').textContent = '¥' + money(today.reduce((s, o) => s + o.total, 0));
  el('kpiCount').textContent = today.length;
  const pending = state.orders.filter((o) => o.status === 'pending').length;
  const making = state.orders.filter((o) => o.status === 'making').length;
  el('kpiActive').textContent = pending + making;
  const badge = el('navPending');
  if (badge.textContent !== String(pending)) {
    badge.textContent = pending;
    badge.classList.toggle('hidden', pending === 0);
    if (pending) { badge.style.animation = 'none'; void badge.offsetWidth; badge.style.animation = ''; }
  }
}

// ---------- 看板 ----------
function orderCard(o) {
  const mins = (Date.now() - new Date(o.createdAt)) / 60000;
  const late = (o.status === 'pending' && mins >= 5) || (o.status === 'making' && mins >= 15);
  const veryLate = (o.status === 'pending' && mins >= 10) || (o.status === 'making' && mins >= 25);
  const items = o.items.map((it) => `
    <li><span class="q">${it.qty}×</span><span class="n">${esc(it.name)}${it.options && it.options.length ? `<small>${esc(it.options.join(' · '))}</small>` : ''}</span><span class="p">¥${money(it.price * it.qty)}</span></li>`).join('');

  let main = '';
  if (o.status === 'pending') main = `<button class="btn btn-gold btn-main" data-act="making" data-id="${o.id}" type="button">${icon('check', 16)}接单</button>`;
  else if (o.status === 'making') main = `<button class="btn btn-green btn-main" data-act="done" data-id="${o.id}" type="button">${icon('glass', 16)}出品完成</button>`;
  else if (o.status === 'done') main = `<button class="btn btn-ghost btn-sm" data-act="making" data-id="${o.id}" type="button">撤回</button>`;

  const sinceText = o.status === 'done' && o.doneAt ? `${hm(o.doneAt)} 出品` : since(o.createdAt);
  return `
  <div class="ocard st-${o.status}${state.fresh.has(o.id) ? ' fresh' : ''}${late ? ' late' : ''}${veryLate ? ' very-late' : ''}">
    <div class="ocard-head">
      <div class="otable"><small>桌号</small><b>${esc(o.table)}</b></div>
      <div class="ometa">
        <div class="ono">${esc(o.no)}</div>
        <div class="otime">${icon('clock', 13)}<span>${hm(o.createdAt)} · ${sinceText}</span></div>
      </div>
    </div>
    <ul class="oitems">${items}</ul>
    ${o.note ? `<div class="onote">${icon('note', 15)}<span>${esc(o.note)}</span></div>` : ''}
    <div class="ofoot">
      <span class="ototal">¥${money(o.total)}</span>
      ${o.printed ? '<span class="printed">已打印</span>' : ''}
      <button class="icon-btn" data-act="print" data-id="${o.id}" title="打印小票" type="button">${icon('printer')}</button>
      ${o.status !== 'done' ? `<button class="icon-btn danger" data-act="cancel" data-id="${o.id}" title="取消订单" type="button">${icon('close')}</button>` : ''}
      ${main}
    </div>
  </div>`;
}

function renderBoard() {
  const pending = state.orders.filter((o) => o.status === 'pending').sort((a, b) => a.id - b.id);
  const making = state.orders.filter((o) => o.status === 'making').sort((a, b) => a.id - b.id);
  const done = state.orders.filter((o) => o.status === 'done' && isToday(o.doneAt || o.createdAt)).slice(0, 40);
  el('cntPending').textContent = pending.length;
  el('cntMaking').textContent = making.length;
  el('cntDone').textContent = done.length;
  const empty = (ic, t) => `<div class="col-empty">${icon(ic)}<p>${t}</p></div>`;
  el('colPending').innerHTML = pending.map(orderCard).join('') || empty('bell', '暂无新订单，新单到达会响铃提醒');
  el('colMaking').innerHTML = making.map(orderCard).join('') || empty('shaker', '接单后的订单会出现在这里');
  el('colDone').innerHTML = done.map(orderCard).join('') || empty('glass', '今日还没有出品记录');
}

async function setStatus(id, status) {
  try {
    const { order } = await api('/api/orders/' + id, { method: 'PATCH', body: { status } });
    upsertOrder(order);
    refreshOrders();
  } catch (e) { toast(e.message, 'error'); }
}

async function handleOrderAction(act, id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  if (act === 'print') return queuePrint(o);
  if (act === 'making' || act === 'done') return setStatus(id, act);
  if (act === 'cancel') {
    if (await confirmBox('取消订单', `确定取消 ${o.no}（桌号 ${o.table}）吗？顾客端会同步显示「已取消」，且不计入营业额。`, '取消订单', true)) setStatus(id, 'cancelled');
    return;
  }
  if (act === 'restore') return setStatus(id, 'pending');
  if (act === 'delete') {
    if (!(await confirmBox('删除订单', `删除后无法恢复，也不再计入统计。确定删除 ${o.no} 吗？`, '删除', true))) return;
    try {
      await api('/api/orders/' + id, { method: 'DELETE' });
      state.orders = state.orders.filter((x) => x.id !== id);
      refreshOrders();
    } catch (e) { toast(e.message, 'error'); }
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act][data-id]');
  if (b) handleOrderAction(b.dataset.act, +b.dataset.id);
});

// ---------- 新订单提醒 ----------
function orderToast(o) {
  const t = document.createElement('div');
  t.className = 'toast order';
  t.dataset.order = o.id;
  t.innerHTML = `
    <div class="toast-head">
      <div class="toast-ic">${icon('bell')}</div>
      <div><div class="toast-title">新订单 · 桌号 ${esc(o.table)}</div><div class="toast-sub">${esc(o.no)} · ${hm(o.createdAt)} · ¥${money(o.total)}</div></div>
      <button class="icon-btn toast-close" type="button">${icon('close')}</button>
    </div>
    <div class="toast-body">${esc(o.items.map((i) => `${i.name}×${i.qty}`).join('，'))}${o.note ? `<br><span style="color:#f0c27e">备注：${esc(o.note)}</span>` : ''}</div>
    <div class="toast-actions">
      <button class="btn btn-ghost btn-sm" data-t="print" type="button">${icon('printer', 15)}打印</button>
      <button class="btn btn-gold btn-sm" data-t="accept" type="button">${icon('check', 15)}接单</button>
    </div>`;
  t.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.t === 'accept') setStatus(o.id, 'making');
    if (b.dataset.t === 'print') queuePrint(state.orders.find((x) => x.id === o.id) || o);
    dismissToast(t);
  });
  el('toasts').prepend(t);
  setTimeout(() => dismissToast(t), 20000);
}

function systemNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

function remindTick() {
  if (!prefs.remind) return;
  const waiting = state.orders.some((o) => o.status === 'pending' && Date.now() - new Date(o.createdAt) > 30000);
  if (waiting || state.calls.length) chime(waiting ? 'order' : 'call');
}

// 标签页标题闪烁
let flash = false;
function updateTitle() {
  const n = state.orders.filter((o) => o.status === 'pending').length + state.calls.length;
  const base = `商家后台 · ${state.shopName}`;
  if (n && document.hidden) { flash = !flash; document.title = flash ? `【${n} 条待处理】` : base; }
  else document.title = n ? `(${n}) ${base}` : base;
}

// ---------- 服务呼叫 ----------
async function loadCalls() {
  try { state.calls = (await api('/api/calls')).calls; renderCalls(); } catch (e) {}
}

function onCall(c) {
  if (state.calls.some((x) => x.id === c.id)) return;
  state.calls.push(c);
  renderCalls();
  chime('call');
  systemNotify(`桌号 ${c.table} · ${c.label}`, '顾客正在呼叫', 'call-' + c.id);
  const t = document.createElement('div');
  t.className = 'toast call';
  t.dataset.call = c.id;
  t.innerHTML = `
    <div class="toast-head">
      <div class="toast-ic">${icon(c.type === 'bill' ? 'card' : c.type === 'water' ? 'water' : 'bell')}</div>
      <div><div class="toast-title">桌号 ${esc(c.table)} · ${esc(c.label)}</div><div class="toast-sub">${hm(new Date(c.at).toISOString())} 顾客呼叫</div></div>
      <button class="icon-btn toast-close" type="button">${icon('close')}</button>
    </div>
    <div class="toast-actions"><button class="btn btn-gold btn-sm" data-c="1" type="button">${icon('check', 15)}已处理</button></div>`;
  t.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.c) handleCall(c.id);
    dismissToast(t);
  });
  el('toasts').prepend(t);
  setTimeout(() => dismissToast(t), 30000);
}

function renderCalls() {
  document.querySelectorAll('.toast.call[data-call]').forEach((t) => {
    if (!state.calls.some((c) => c.id === +t.dataset.call)) dismissToast(t);
  });
  const box = el('calls');
  box.classList.toggle('hidden', state.calls.length === 0);
  box.innerHTML = state.calls.map((c) => `
    <div class="call">
      ${icon(c.type === 'bill' ? 'card' : c.type === 'water' ? 'water' : 'bell')}
      <div><b>桌号 ${esc(c.table)}</b><small>${esc(c.label)} · ${since(new Date(c.at).toISOString())}</small></div>
      <button class="btn btn-ghost btn-sm" data-call="${c.id}" type="button">已处理</button>
    </div>`).join('');
}

async function handleCall(id) {
  state.calls = state.calls.filter((c) => c.id !== id);
  renderCalls();
  try { await api('/api/calls/' + id, { method: 'PATCH' }); } catch (e) {}
}
el('calls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-call]');
  if (b) handleCall(+b.dataset.call);
});

// ---------- 打印 ----------
const printQueue = [];
let printing = false;
function queuePrint(o) {
  printQueue.push(o);
  if (!printing) nextPrint();
}
function nextPrint() {
  const o = printQueue.shift();
  if (!o) { printing = false; return; }
  printing = true;
  const rows = o.items.map((it) => `
    <tr><td>${esc(it.name)}${it.options && it.options.length ? `<small>${esc(it.options.join(' / '))}</small>` : ''}</td>
    <td class="c">${it.qty}</td><td class="r">¥${money(it.price * it.qty)}</td></tr>`).join('');
  el('printArea').innerHTML = `
    <div class="receipt">
      <h2>${esc(state.shopName)}</h2>
      <div class="r-sub">点单小票 · ${esc(o.no)}</div>
      <div class="r-seat">桌号 ${esc(o.table)}</div>
      <div class="r-row"><span>下单时间</span><span>${fullTime(o.createdAt)}</span></div>
      <div class="r-row"><span>打印时间</span><span>${fullTime(new Date().toISOString())}</span></div>
      <hr/>
      <table><thead><tr><th>品项</th><th class="c">数量</th><th class="r">小计</th></tr></thead><tbody>${rows}</tbody></table>
      <hr/>
      <div class="r-row r-total"><span>合计</span><span>¥${money(o.total)}</span></div>
      ${o.note ? `<div class="r-note">备注：${esc(o.note)}</div>` : ''}
      <div class="r-foot">感谢光临 · Cheers!</div>
    </div>`;
  if (!o.printed) api('/api/orders/' + o.id, { method: 'PATCH', body: { printed: true } }).catch(() => {});
  setTimeout(() => {
    window.print();
    setTimeout(nextPrint, 400);
  }, 50);
}

// ---------- 历史订单 ----------
function renderHistory() {
  const date = el('hDate').value;
  const st = el('hStatus').value;
  const q = el('hSearch').value.trim().toLowerCase();
  const list = state.orders.filter((o) => {
    if (date && localDate(new Date(o.createdAt)) !== date) return false;
    if (st && o.status !== st) return false;
    if (q) {
      const hay = (o.no + ' ' + o.table + ' ' + o.items.map((i) => i.name).join(' ') + ' ' + o.note).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const valid = list.filter((o) => o.status !== 'cancelled');
  el('hSummary').textContent = `${list.length} 单 · 有效营业额 ¥${money(valid.reduce((s, o) => s + o.total, 0))}`;
  el('hBody').innerHTML = list.length ? list.map((o) => `
    <tr>
      <td class="no">${esc(o.no)}</td>
      <td class="tbl">${esc(o.table)}</td>
      <td>${fullTime(o.createdAt)}</td>
      <td class="items-cell">${esc(o.items.map((i) => `${i.name}${i.options && i.options.length ? '(' + i.options.join('/') + ')' : ''}×${i.qty}`).join('，'))}${o.note ? `<br><small style="color:#f0c27e">备注：${esc(o.note)}</small>` : ''}</td>
      <td class="r money">¥${money(o.total)}</td>
      <td><span class="pill pill-${o.status}">${STATUS_NAME[o.status] || o.status}</span></td>
      <td><div class="acts">
        <button class="icon-btn" data-act="print" data-id="${o.id}" title="打印" type="button">${icon('printer')}</button>
        ${o.status === 'cancelled' ? `<button class="icon-btn" data-act="restore" data-id="${o.id}" title="恢复为待接单" type="button">${icon('history')}</button>` : ''}
        <button class="icon-btn danger" data-act="delete" data-id="${o.id}" title="删除" type="button">${icon('trash')}</button>
      </div></td>
    </tr>`).join('') : `<tr><td colspan="7"><div class="empty">没有符合条件的订单</div></td></tr>`;
}
['hDate', 'hStatus'].forEach((id) => el(id).addEventListener('change', renderHistory));
el('hSearch').addEventListener('input', renderHistory);

// ---------- 菜单管理 ----------
async function loadMenu() {
  try { state.menu = await api('/api/menu'); renderMenuEditor(); } catch (e) {}
}

function fmtOptions(groups) {
  return (groups || []).map((g) => g.name + '：' + g.choices.map((c) => c.label + (c.delta ? '+' + c.delta : '')).join('，')).join('\n');
}
function parseOptions(text) {
  const groups = [];
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const i = line.search(/[:：]/);
    if (i < 1) throw new Error(`规格格式有误：「${line}」，应为「组名：选项1，选项2」`);
    const name = line.slice(0, i).trim();
    const choices = line.slice(i + 1).split(/[,，、]/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(/^(.+?)\s*[+＋]\s*¥?\s*(\d+(?:\.\d+)?)$/);
      return m ? { label: m[1].trim(), delta: Number(m[2]) } : { label: s };
    });
    if (!choices.length) throw new Error(`规格「${name}」至少需要一个选项`);
    groups.push({ name, choices });
  });
  return groups;
}

function renderMenuEditor() {
  const cats = state.menu.categories;
  el('menuEditor').innerHTML = cats.length ? cats.map((c, ci) => `
    <div class="panel mcat">
      <div class="mcat-head">
        <h3>${esc(c.name)}</h3>${c.en ? `<span class="en">${esc(c.en)}</span>` : ''}
        <span class="cnt">${c.items.length} 款</span>
        ${c.options && c.options.length ? `<span class="opts">默认规格：${esc(c.options.map((g) => g.name).join(' / '))}</span>` : ''}
        <div class="acts">
          <button class="icon-btn" data-m="cat-add-item" data-c="${ci}" title="在此分类新增商品" type="button">${icon('plus')}</button>
          <button class="icon-btn" data-m="cat-up" data-c="${ci}" title="上移" type="button" ${ci === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button class="icon-btn" data-m="cat-down" data-c="${ci}" title="下移" type="button" ${ci === cats.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          <button class="icon-btn" data-m="cat-edit" data-c="${ci}" title="编辑分类" type="button">${icon('edit')}</button>
          <button class="icon-btn danger" data-m="cat-del" data-c="${ci}" title="删除分类" type="button">${icon('trash')}</button>
        </div>
      </div>
      ${c.items.map((it, ii) => `
        <div class="mrow${it.soldOut ? ' is-sold' : ''}">
          ${artHTML(it)}
          <div class="mname"><b>${esc(it.name)}</b>${it.en ? `<span class="en">${esc(it.en)}</span>` : ''}<p>${esc(it.desc || '—')}</p></div>
          <div class="mtags">${(it.tags || []).map((t) => TAGS[t] ? `<span class="mtag ${t}">${TAGS[t]}</span>` : '').join('')}${it.options ? '<span class="mtag">独立规格</span>' : ''}</div>
          <div class="mprice">¥${money(it.price)}</div>
          <label class="switch msold" title="售罄后顾客端无法下单"><input type="checkbox" data-sold="${esc(it.id)}" ${it.soldOut ? 'checked' : ''}/><i></i><span>售罄</span></label>
          <div class="acts">
            <button class="icon-btn" data-m="item-up" data-c="${ci}" data-i="${ii}" title="上移" type="button">${icon('up')}</button>
            <button class="icon-btn" data-m="item-down" data-c="${ci}" data-i="${ii}" title="下移" type="button">${icon('down')}</button>
            <button class="icon-btn" data-m="item-edit" data-c="${ci}" data-i="${ii}" title="编辑" type="button">${icon('edit')}</button>
            <button class="icon-btn danger" data-m="item-del" data-c="${ci}" data-i="${ii}" title="删除" type="button">${icon('trash')}</button>
          </div>
        </div>`).join('') || '<div class="empty" style="padding:30px 0">该分类下还没有商品</div>'}
    </div>`).join('') : '<div class="panel empty">还没有分类，点击上方「新增分类」开始</div>';
}

async function saveMenu(msg) {
  try {
    const { menu } = await api('/api/admin/menu', { method: 'PUT', body: state.menu });
    state.menu = menu;
    renderMenuEditor();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast(e.message, 'error');
    loadMenu();
    return false;
  }
}

function swap(arr, i, j) {
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

el('menuEditor').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  const ci = +b.dataset.c;
  const ii = +b.dataset.i;
  const cats = state.menu.categories;
  switch (b.dataset.m) {
    case 'cat-up': if (swap(cats, ci, ci - 1)) saveMenu(); break;
    case 'cat-down': if (swap(cats, ci, ci + 1)) saveMenu(); break;
    case 'cat-edit': catModal(ci); break;
    case 'cat-add-item': itemModal(ci, null); break;
    case 'cat-del':
      if (await confirmBox('删除分类', `将同时删除「${cats[ci].name}」下的 ${cats[ci].items.length} 个商品，确定吗？`, '删除', true)) {
        cats.splice(ci, 1); saveMenu('分类已删除');
      }
      break;
    case 'item-up': if (swap(cats[ci].items, ii, ii - 1)) saveMenu(); break;
    case 'item-down': if (swap(cats[ci].items, ii, ii + 1)) saveMenu(); break;
    case 'item-edit': itemModal(ci, ii); break;
    case 'item-del':
      if (await confirmBox('删除商品', `确定删除「${cats[ci].items[ii].name}」吗？`, '删除', true)) {
        cats[ci].items.splice(ii, 1); saveMenu('商品已删除');
      }
      break;
  }
});

el('menuEditor').addEventListener('change', async (e) => {
  const cb = e.target.closest('[data-sold]');
  if (!cb) return;
  try {
    await api('/api/admin/menu/items/' + encodeURIComponent(cb.dataset.sold), { method: 'PATCH', body: { soldOut: cb.checked } });
    state.menu.categories.forEach((c) => c.items.forEach((it) => { if (it.id === cb.dataset.sold) it.soldOut = cb.checked; }));
    renderMenuEditor();
    toast(cb.checked ? '已设为售罄' : '已恢复供应');
  } catch (err) { toast(err.message, 'error'); cb.checked = !cb.checked; }
});

el('addItem').addEventListener('click', () => {
  if (!state.menu.categories.length) return toast('请先新增一个分类', 'error');
  itemModal(0, null);
});
el('addCat').addEventListener('click', () => catModal(null));

function catModal(ci) {
  const c = ci == null ? { name: '', en: '', options: [] } : state.menu.categories[ci];
  openModal(`
    <div class="modal-head"><h3>${ci == null ? '新增分类' : '编辑分类'}</h3><button class="icon-btn" data-x type="button">${icon('close')}</button></div>
    <form class="modal-body form-grid" id="catForm">
      <label class="fld"><span>分类名称 *</span><input class="input" name="name" value="${esc(c.name)}" maxlength="20" required /></label>
      <label class="fld"><span>英文名</span><input class="input" name="en" value="${esc(c.en || '')}" maxlength="40" placeholder="Signature Cocktails" /></label>
      <label class="fld full"><span>分类默认规格</span>
        <textarea class="input" name="options" rows="3" placeholder="冰量：正常冰，少冰，去冰&#10;甜度：标准，少甜">${esc(fmtOptions(c.options))}</textarea>
        <small>每行一组，格式「组名：选项1，选项2」；加价写成「1L+40」。商品未单独设置规格时使用此处规格。</small>
      </label>
    </form>
    <div class="modal-foot"><button class="btn btn-ghost" data-x type="button">取消</button><button class="btn btn-gold" id="catSave" type="button">保存</button></div>`);
  const card = el('modalCard');
  card.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', closeModal));
  el('catSave').addEventListener('click', async () => {
    const f = el('catForm');
    const name = f.name.value.trim();
    if (!name) return toast('请填写分类名称', 'error');
    let options;
    try { options = parseOptions(f.options.value); } catch (err) { return toast(err.message, 'error'); }
    const data = { name, en: f.en.value.trim(), options };
    if (ci == null) state.menu.categories.push({ ...data, items: [] });
    else Object.assign(state.menu.categories[ci], data);
    if (await saveMenu(ci == null ? '分类已新增' : '分类已更新')) closeModal();
  });
}

function itemModal(ci, ii) {
  const cats = state.menu.categories;
  const isNew = ii == null;
  const it = isNew ? { name: '', en: '', price: '', desc: '', glass: 'rocks', tint: TINTS[0], tags: [], abv: '' } : cats[ci].items[ii];
  const draft = { glass: it.glass || 'rocks', tint: it.tint || TINTS[0] };

  openModal(`
    <div class="modal-head"><h3>${isNew ? '新增商品' : '编辑商品'}</h3><button class="icon-btn" data-x type="button">${icon('close')}</button></div>
    <form class="modal-body form-grid" id="itemForm" onsubmit="return false">
      <div class="full preview-row">
        <div id="artPreview"></div>
        <div style="flex:1" class="form-grid">
          <label class="fld"><span>名称 *</span><input class="input" name="name" value="${esc(it.name)}" maxlength="30" /></label>
          <label class="fld"><span>英文名</span><input class="input" name="en" value="${esc(it.en || '')}" maxlength="40" /></label>
        </div>
      </div>
      <label class="fld"><span>价格（元）*</span><input class="input" name="price" type="number" min="0" step="1" value="${esc(it.price)}" /></label>
      <label class="fld"><span>所属分类</span><select class="input" name="cat">${cats.map((c, i) => `<option value="${i}" ${i === ci ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="fld full"><span>描述</span><input class="input" name="desc" value="${esc(it.desc || '')}" maxlength="80" placeholder="基酒 · 风味 · 一句话卖点" /></label>
      <label class="fld"><span>酒精度</span><input class="input" name="abv" value="${esc(it.abv || '')}" maxlength="8" placeholder="如 12%" /></label>
      <label class="fld"><span>图片地址（可选）</span><input class="input" name="image" value="${esc(it.image || '')}" placeholder="留空则使用插画" /></label>
      <div class="fld full"><span>器皿插画</span>
        <div class="glass-pick" id="glassPick">${Object.keys(GLASS_NAMES).map((g) => `
          <button class="glass-opt${g === draft.glass ? ' active' : ''}" data-glass="${g}" type="button"><div class="art">${drinkArt(g, draft.tint)}</div>${GLASS_NAMES[g]}</button>`).join('')}
        </div>
      </div>
      <div class="fld full"><span>主色调</span>
        <div class="color-row" id="tintPick">${TINTS.map((t) => `<button class="swatch${t === draft.tint ? ' active' : ''}" data-tint="${t}" style="background:${t}" type="button"></button>`).join('')}
          <input type="color" id="tintCustom" value="${esc(draft.tint)}" title="自定义颜色" />
        </div>
      </div>
      <div class="fld full"><span>标签</span>
        <div class="check-row">${Object.entries(TAGS).map(([k, v]) => `<label class="check"><input type="checkbox" name="tag" value="${k}" ${(it.tags || []).includes(k) ? 'checked' : ''}/>${v}</label>`).join('')}
          <label class="check"><input type="checkbox" name="soldOut" ${it.soldOut ? 'checked' : ''}/>售罄</label>
        </div>
      </div>
      <label class="fld full"><span>独立规格（可选）</span>
        <textarea class="input" name="options" rows="2" placeholder="留空则使用分类默认规格&#10;如：规格：500ml，1L+40">${esc(fmtOptions(it.options))}</textarea>
        <small>每行一组，格式「组名：选项1，选项2」，加价写成「选项+金额」。</small>
      </label>
    </form>
    <div class="modal-foot"><button class="btn btn-ghost" data-x type="button">取消</button><button class="btn btn-gold" id="itemSave" type="button">保存</button></div>`);

  const card = el('modalCard');
  const paintPreview = () => {
    const img = el('itemForm').image.value.trim();
    el('artPreview').innerHTML = artHTML({ glass: draft.glass, tint: draft.tint, image: img });
    card.querySelectorAll('.glass-opt').forEach((b) => {
      b.classList.toggle('active', b.dataset.glass === draft.glass);
      b.querySelector('.art').innerHTML = drinkArt(b.dataset.glass, draft.tint);
    });
    card.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s.dataset.tint === draft.tint));
  };
  paintPreview();
  card.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', closeModal));
  el('glassPick').addEventListener('click', (e) => { const b = e.target.closest('[data-glass]'); if (b) { draft.glass = b.dataset.glass; paintPreview(); } });
  el('tintPick').addEventListener('click', (e) => { const b = e.target.closest('[data-tint]'); if (b) { draft.tint = b.dataset.tint; el('tintCustom').value = draft.tint; paintPreview(); } });
  el('tintCustom').addEventListener('input', (e) => { draft.tint = e.target.value; paintPreview(); });
  el('itemForm').image.addEventListener('change', paintPreview);

  el('itemSave').addEventListener('click', async () => {
    const f = el('itemForm');
    const name = f.name.value.trim();
    const price = Number(f.price.value);
    if (!name) return toast('请填写商品名称', 'error');
    if (f.price.value === '' || !Number.isFinite(price) || price < 0) return toast('请填写正确的价格', 'error');
    let options;
    try { options = parseOptions(f.options.value); } catch (err) { return toast(err.message, 'error'); }
    const data = {
      ...(isNew ? {} : it),
      name, en: f.en.value.trim(), price, desc: f.desc.value.trim(), abv: f.abv.value.trim(),
      image: f.image.value.trim(), glass: draft.glass, tint: draft.tint,
      tags: [...f.querySelectorAll('input[name=tag]:checked')].map((x) => x.value),
      soldOut: f.soldOut.checked,
    };
    if (options.length) data.options = options; else delete data.options;
    if (!data.abv) delete data.abv;
    if (!data.image) delete data.image;
    const target = +f.cat.value;
    if (!isNew) cats[ci].items.splice(ii, 1);
    if (!isNew && target === ci) cats[ci].items.splice(ii, 0, data);
    else cats[target].items.push(data);
    if (await saveMenu(isNew ? '商品已新增' : '商品已更新')) closeModal();
  });
}

// ---------- 桌台二维码 ----------
const qrUrl = (name) => '/api/qr?table=' + encodeURIComponent(name) + '&base=' + encodeURIComponent(location.origin);
const orderUrl = (name) => location.origin + '/?table=' + encodeURIComponent(name);

async function loadTables() {
  try { state.tables = (await api('/api/tables')).tables || []; renderTables(); } catch (e) {}
}

function renderTables() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  el('qrTip').innerHTML = local
    ? '<b style="color:#e9a23b">⚠ 当前通过 localhost 访问，生成的二维码手机无法打开。</b>请用门店电脑的局域网 IP（如 http://192.168.x.x:3000/admin.html）访问后台后再打印。'
    : `顾客扫码后自动进入点单页并锁定桌号。二维码指向 <b>${esc(location.origin)}</b>`;
  el('qrGrid').innerHTML = state.tables.length ? state.tables.map((t) => `
    <div class="qr-card">
      <div class="qr-tent">
        <div class="shop">${esc(state.shopName)}</div>
        <img src="${qrUrl(t.name)}" alt="桌号 ${esc(t.name)} 二维码" loading="lazy" />
        <div class="t">${esc(t.name)}</div>
        <div class="hint">扫码点单 · SCAN TO ORDER</div>
      </div>
      <div class="qr-actions">
        <a class="btn btn-ghost btn-sm" href="${qrUrl(t.name)}" download="桌台-${esc(t.name)}.png">${icon('download', 15)}下载</a>
        <button class="btn btn-ghost btn-sm" data-copy="${esc(t.name)}" type="button">复制链接</button>
        <button class="icon-btn danger" data-deltable="${esc(t.name)}" title="删除" type="button">${icon('trash')}</button>
      </div>
    </div>`).join('') : '<div class="panel empty" style="grid-column:1/-1">还没有桌台，先在上方添加一个吧</div>';
}

async function addTables(names) {
  let ok = 0;
  for (const name of names) {
    try { await api('/api/tables', { method: 'POST', body: { name } }); ok++; } catch (e) { if (names.length === 1) toast(e.message, 'error'); }
  }
  if (ok) toast(`已添加 ${ok} 个桌台`);
  loadTables();
}

el('addTable').addEventListener('click', () => {
  const name = el('newTable').value.trim();
  if (!name) return;
  el('newTable').value = '';
  addTables([name]);
});
el('newTable').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('addTable').click(); });

el('batchTable').addEventListener('click', () => {
  openModal(`
    <div class="modal-head"><h3>批量添加桌台</h3><button class="icon-btn" data-x type="button">${icon('close')}</button></div>
    <div class="modal-body form-grid">
      <label class="fld full"><span>前缀</span><input class="input" id="bPrefix" placeholder="如 A、吧台、卡座" maxlength="10" /></label>
      <label class="fld"><span>起始编号</span><input class="input" id="bFrom" type="number" value="1" min="0" /></label>
      <label class="fld"><span>结束编号</span><input class="input" id="bTo" type="number" value="10" min="0" /></label>
      <p class="full muted" id="bPreview" style="font-size:12.5px"></p>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-x type="button">取消</button><button class="btn btn-gold" id="bGo" type="button">添加</button></div>`, 'sm');
  const names = () => {
    const p = el('bPrefix').value.trim();
    const a = parseInt(el('bFrom').value, 10);
    const b = parseInt(el('bTo').value, 10);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 99) return [];
    return Array.from({ length: b - a + 1 }, (_, i) => p + (a + i));
  };
  const preview = () => { const n = names(); el('bPreview').textContent = n.length ? `将添加 ${n.length} 个：${n.slice(0, 6).join('、')}${n.length > 6 ? ' …' : ''}` : '请填写有效的编号范围（最多 100 个）'; };
  ['bPrefix', 'bFrom', 'bTo'].forEach((id) => el(id).addEventListener('input', preview));
  preview();
  el('modalCard').querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', closeModal));
  el('bGo').addEventListener('click', () => { const n = names(); if (!n.length) return; closeModal(); addTables(n); });
});

el('qrGrid').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-deltable]');
  if (del) {
    if (!(await confirmBox('删除桌台', `删除桌台「${del.dataset.deltable}」？已打印的二维码仍可点单，但不会出现在桌号列表中。`, '删除', true))) return;
    await api('/api/tables/' + encodeURIComponent(del.dataset.deltable), { method: 'DELETE' }).catch((err) => toast(err.message, 'error'));
    return loadTables();
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) copyText(orderUrl(cp.dataset.copy));
});

function copyText(text) {
  const done = () => toast('链接已复制');
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done);
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制：' + text, 'error'); }
  ta.remove();
}

el('printAllQr').addEventListener('click', () => {
  if (!state.tables.length) return toast('还没有桌台', 'error');
  el('printArea').innerHTML = '<div class="qr-print">' + state.tables.map((t) => `
    <div class="qr-print-card">
      <div class="shop">${esc(state.shopName)}</div>
      <img src="${qrUrl(t.name)}" />
      <div class="tn">${esc(t.name)}</div>
      <div class="tip">扫码点单 · SCAN TO ORDER</div>
    </div>`).join('') + '</div>';
  const imgs = [...el('printArea').querySelectorAll('img')];
  Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))).then(() => window.print());
});

// ---------- 营业统计 ----------
function deltaHTML(cur, prev, unit) {
  if (!prev) return `<div class="delta">昨日 ${unit || ''}${prev}</div>`;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `<div class="delta ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% 较昨日（${unit || ''}${money(prev)}）</div>`;
}

function bars(data, opts) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return `<div class="bars${opts && opts.dense ? ' dense' : ''}">${data.map((d) => `
    <div class="bcol" title="${esc(d.title || '')}">
      ${opts && opts.dense ? '' : `<div class="bval">${d.value ? '¥' + money(d.value) : ''}</div>`}
      <div class="bbar${d.hl ? ' hl' : ''}" style="height:${(d.value / max) * 100}%"></div>
      <div class="blabel">${esc(d.label)}</div>
    </div>`).join('')}</div>`;
}

async function loadStats() {
  let s;
  try { s = await api('/api/stats'); } catch (e) { return; }
  el('statCards').innerHTML = `
    <div class="scard hero"><small>今日营业额</small><div class="v">¥${money(s.todayRevenue)}</div>${deltaHTML(s.todayRevenue, s.yesterdayRevenue, '¥')}</div>
    <div class="scard"><small>今日订单</small><div class="v">${s.todayCount}</div>${deltaHTML(s.todayCount, s.yesterdayCount)}</div>
    <div class="scard"><small>客单价</small><div class="v">¥${money(s.todayAvg)}</div>${deltaHTML(s.todayAvg, s.yesterdayAvg, '¥')}</div>
    <div class="scard"><small>平均出品用时</small><div class="v">${s.avgPrepMinutes == null ? '—' : s.avgPrepMinutes + '<span style="font-size:16px"> 分钟</span>'}</div><div class="delta">今日 · 下单到出品</div></div>`;

  const wk = ['日', '一', '二', '三', '四', '五', '六'];
  el('st7Sum').textContent = `7 日合计 ¥${money(s.last7.reduce((a, d) => a + d.revenue, 0))} · 累计 ¥${money(s.totalRevenue)} / ${s.totalCount} 单`;
  el('chart7').innerHTML = bars(s.last7.map((d, i) => ({
    value: d.revenue, hl: i === 6,
    label: i === 6 ? '今天' : d.date.slice(5).replace('-', '/') + ' 周' + wk[new Date(d.date + 'T00:00').getDay()],
    title: `${d.date}：¥${money(d.revenue)}，${d.count} 单`,
  })));
  const nowH = new Date().getHours();
  el('chartHour').innerHTML = bars(s.hourly.map((h) => ({
    value: h.revenue, hl: h.hour === nowH,
    label: h.hour % 3 === 0 ? String(h.hour) : '',
    title: `${pad(h.hour)}:00–${pad(h.hour)}:59　¥${money(h.revenue)} · ${h.count} 单`,
  })), { dense: true });

  const maxQty = Math.max(1, ...s.topItems.map((i) => i.qty));
  el('topItems').innerHTML = s.topItems.length ? s.topItems.map((it, i) => `
    <div class="trow">
      <span class="rank${i < 3 ? ' top' : ''}">${i + 1}</span>
      <span class="tname">${esc(it.name)}</span>
      <div class="tbar"><i style="width:${(it.qty / maxQty) * 100}%"></i></div>
      <span class="tqty">${it.qty} 份</span>
      <span class="trev">¥${money(it.revenue)}</span>
    </div>`).join('') : '<div class="empty">暂无销售数据</div>';

  const total = s.categories.reduce((a, c) => a + c.revenue, 0) || 1;
  el('catShare').innerHTML = s.categories.length ? `
    <div class="share-bar">${s.categories.map((c, i) => `<i style="width:${(c.revenue / total) * 100}%;background:${SHARE_COLORS[i % SHARE_COLORS.length]}" title="${esc(c.name)}"></i>`).join('')}</div>
    ${s.categories.map((c, i) => `
      <div class="share-row">
        <span class="sw" style="background:${SHARE_COLORS[i % SHARE_COLORS.length]}"></span>
        <span class="nm">${esc(c.name)}</span>
        <span class="pc">${Math.round((c.revenue / total) * 100)}%</span>
        <span class="rv">¥${money(c.revenue)}</span>
      </div>`).join('')}` : '<div class="empty">暂无销售数据</div>';
}

// ---------- 店铺设置 ----------
async function loadSettings() {
  try {
    const s = await api('/api/admin/settings');
    el('sName').value = s.shopName || '';
    el('sTagline').value = s.tagline || '';
    el('sNotice').value = s.notice || '';
  } catch (e) {}
  el('custLink').textContent = location.origin + '/';
  updateNotifState();
}

el('shopForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/settings', { method: 'PUT', body: { shopName: el('sName').value, tagline: el('sTagline').value, notice: el('sNotice').value } });
    setShopName(el('sName').value.trim() || state.shopName);
    toast('店铺信息已保存，顾客端已同步');
  } catch (err) { toast(err.message, 'error'); }
});

el('pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pin = el('sPin').value.trim();
  if (!/^\d{4,8}$/.test(pin)) return toast('PIN 需为 4–8 位数字', 'error');
  try {
    await api('/api/admin/settings', { method: 'PUT', body: { newPin: pin } });
    el('sPin').value = '';
    toast('PIN 已更新，其他设备需重新登录');
  } catch (err) { toast(err.message, 'error'); }
});

el('testOrderSound').addEventListener('click', () => chime('order', true));
el('testCallSound').addEventListener('click', () => chime('call', true));

function updateNotifState() {
  const btn = el('notifBtn');
  if (!('Notification' in window)) { el('notifState').textContent = '当前浏览器不支持系统通知'; btn.disabled = true; return; }
  const p = Notification.permission;
  el('notifState').textContent = p === 'granted' ? '已开启：切到其他窗口时也会弹出提醒' : p === 'denied' ? '已被浏览器拒绝，请在地址栏左侧的网站设置中允许通知' : '切到其他窗口时也能弹出提醒';
  btn.textContent = p === 'granted' ? '已开启' : '开启系统通知';
  btn.disabled = p !== 'default';
}
el('notifBtn').addEventListener('click', () => Notification.requestPermission().then(updateNotifState));

// ---------- 视图切换 ----------
function switchView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('hidden', s.id !== 'view-' + v));
  el('pageTitle').textContent = VIEW_TITLES[v];
  if (v === 'orders') renderBoard();
  if (v === 'history') { if (!el('hDate').value) el('hDate').value = localDate(new Date()); renderHistory(); }
  if (v === 'menu') loadMenu();
  if (v === 'tables') loadTables();
  if (v === 'stats') loadStats();
  if (v === 'settings') loadSettings();
}
el('nav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) switchView(b.dataset.view);
});

// ---------- 时钟 / 定时 ----------
let statTick = 0;
function tickClock() {
  const d = new Date();
  el('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  el('pageSub').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${'日一二三四五六'[d.getDay()]}`;
  updateTitle();
  if (state.view === 'stats' && ++statTick % 30 === 0) loadStats();
}

// ---------- 开关 ----------
[['optSound', 'sound'], ['optRemind', 'remind'], ['optPrint', 'autoPrint']].forEach(([id, key]) => {
  el(id).checked = prefs[key];
  el(id).addEventListener('change', () => {
    prefs[key] = el(id).checked;
    savePrefs();
    if (key === 'sound') checkAudio();
    if (key === 'sound' && prefs.sound) chime('order');
  });
});

// ---------- 启动 ----------
hydrateIcons();
api('/api/admin/me').then(startApp).catch(() => showLogin());
