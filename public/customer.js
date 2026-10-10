// =========================================================
// 顾客点单页
// =========================================================
const { drinkArt, icon, esc, money } = window.BarUI;
const el = (id) => document.getElementById(id);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const DAY = 24 * 3600 * 1000;
const NOTE_CHIPS = ['少冰', '多冰', '不要吸管', '分开上', '先上小食', '少辣'];
const STATUS_TEXT = { pending: '待接单', making: '制作中', done: '已出品', cancelled: '已取消' };

const state = {
  info: {},
  menu: { categories: [] },
  index: {},
  table: '',
  tableLocked: false,
  cart: store.get('bar.cart', []), // [{ key, id, qty, options:{组名:选项} }]
  my: store.get('bar.orders', []).filter((o) => Date.now() - o.at < DAY), // [{ key, no, at }]
  orders: {}, // key -> 订单
  noteChips: new Set(),
  trackKey: null,
  es: null,
};

// ---------- 工具 ----------
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((n) => {
    n.innerHTML = icon(n.dataset.icon);
    n.removeAttribute('data-icon');
  });
}

let toastTimer;
function toast(msg, ic) {
  const t = el('toast');
  t.innerHTML = (ic ? icon(ic) : '') + `<span>${esc(msg)}</span>`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || '网络异常，请稍后重试'); e.status = res.status; throw e; }
  return data;
}

function artHTML(item) {
  return `<div class="art" style="--tint:${esc(item.tint || '#c9a46a')}">${
    item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : drinkArt(item.glass, item.tint)
  }</div>`;
}

// ---------- 菜单索引与价格 ----------
function buildIndex() {
  state.index = {};
  state.menu.categories.forEach((c) => c.items.forEach((it) => {
    state.index[it.id] = { item: it, groups: it.options || c.options || [] };
  }));
}

function unitPrice(id, options) {
  const ref = state.index[id];
  if (!ref) return 0;
  let p = ref.item.price;
  ref.groups.forEach((g) => {
    const c = g.choices.find((x) => x.label === (options || {})[g.name]) || g.choices[0];
    if (c) p += c.delta || 0;
  });
  return p;
}

const hasDelta = (groups) => groups.some((g) => g.choices.some((c) => c.delta));

// ---------- 购物车 ----------
function lineKey(id, options) {
  return id + '|' + Object.keys(options || {}).sort().map((k) => k + '=' + options[k]).join('&');
}

function saveCart() { store.set('bar.cart', state.cart); }

function qtyOf(id) { return state.cart.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0); }

function cartTotals() {
  let count = 0; let total = 0;
  state.cart.forEach((l) => {
    const ref = state.index[l.id];
    if (!ref || ref.item.soldOut) return;
    count += l.qty;
    total += unitPrice(l.id, l.options) * l.qty;
  });
  return { count, total };
}

function addToCart(id, options, qty, sourceEl) {
  const key = lineKey(id, options);
  const line = state.cart.find((l) => l.key === key);
  if (line) line.qty = Math.min(99, line.qty + qty);
  else state.cart.push({ key, id, qty, options: options || {} });
  saveCart();
  updateCartUI();
  if (sourceEl) flyToDock(sourceEl);
}

function changeLine(key, delta) {
  const line = state.cart.find((l) => l.key === key);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.cart = state.cart.filter((l) => l !== line);
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const { count, total } = cartTotals();
  el('dockCount').textContent = count;
  el('dockTotal').textContent = money(total);
  el('dockSub').textContent = count ? `共 ${count} 件 · 送至 ${state.table || '待选桌号'}` : '未选购商品';
  el('dock').classList.toggle('show', count > 0);
  refreshControls();
  if (el('cartSheet').classList.contains('show')) renderCart();
}

function flyToDock(src) {
  const from = src.getBoundingClientRect();
  const bag = el('dockBag');
  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = from.left + from.width / 2 - 7 + 'px';
  dot.style.top = from.top + from.height / 2 - 7 + 'px';
  document.body.appendChild(dot);
  requestAnimationFrame(() => {
    const to = bag.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    dot.style.transform = `translate(${dx}px, ${dy}px) scale(.6)`;
    dot.style.opacity = '.4';
  });
  setTimeout(() => {
    dot.remove();
    bag.classList.remove('bump'); void bag.offsetWidth; bag.classList.add('bump');
  }, 620);
  if (navigator.vibrate) navigator.vibrate(12);
}

// ---------- 渲染菜单 ----------
function priceHTML(item, groups) {
  return `<span class="price"><small>¥</small>${money(item.price)}${hasDelta(groups) ? '<span class="price-from">起</span>' : ''}</span>`;
}

function tagsHTML(item) {
  const map = { signature: ['tag-signature', '招牌'], new: ['tag-new', '新品'], hot: ['tag-hot', '人气'], na: ['tag-na', '无酒精'] };
  const tags = (item.tags || []).filter((t) => map[t]).map((t) => {
    const [cls, label] = map[t];
    return `<span class="tag ${cls}">${t === 'hot' ? icon('flame', 11) : ''}${label}</span>`;
  });
  if (item.abv) tags.push(`<span class="tag tag-abv">${esc(item.abv)} ABV</span>`);
  return tags.length ? `<div class="item-tags">${tags.join('')}</div>` : '';
}

function controlHTML(item) {
  const ref = state.index[item.id];
  if (item.soldOut) return '<span class="sold-label">已售罄</span>';
  const q = qtyOf(item.id);
  if (ref.groups.length) {
    return `<button class="spec-btn" data-act="spec" type="button">选规格${q ? `<span class="count-pip">${q}</span>` : ''}</button>`;
  }
  if (!q) return `<button class="add-btn" data-act="add" type="button" aria-label="加入购物车">${icon('plus')}</button>`;
  return `<div class="stepper">
    <button class="minus" data-act="minus" type="button" aria-label="减少">${icon('minus')}</button>
    <span class="num">${q}</span>
    <button class="plus" data-act="add" type="button" aria-label="增加">${icon('plus')}</button>
  </div>`;
}

function refreshControls() {
  document.querySelectorAll('.ctrl[data-id]').forEach((c) => {
    const ref = state.index[c.dataset.id];
    if (ref) c.innerHTML = controlHTML(ref.item);
  });
}

function renderMenu() {
  const cats = state.menu.categories.filter((c) => c.items.length);

  el('catNavInner').innerHTML = cats
    .map((c, i) => `<button class="cat-tab${i === 0 ? ' active' : ''}" data-cat="${i}" type="button">${esc(c.name)}</button>`)
    .join('');

  // 今夜推荐：招牌 / 新品
  const feats = [];
  cats.forEach((c) => c.items.forEach((it) => {
    if (!it.soldOut && (it.tags || []).some((t) => t === 'signature' || t === 'new')) feats.push(it);
  }));
  el('featured').classList.toggle('hidden', feats.length === 0);
  el('featuredTrack').innerHTML = feats.slice(0, 8).map((it) => `
    <div class="feat-card" data-open="${esc(it.id)}" role="button" tabindex="0">
      ${artHTML(it)}
      <div class="feat-name">${esc(it.name)}</div>
      <div class="feat-en">${esc(it.en || '')}&nbsp;</div>
      <div class="feat-foot">${priceHTML(it, state.index[it.id].groups)}<div class="ctrl" data-id="${esc(it.id)}">${controlHTML(it)}</div></div>
    </div>`).join('');

  el('menu').innerHTML = cats.map((c, i) => `
    <section class="cat-section" id="cat-${i}" data-cat="${i}">
      <div class="section-head">
        <h2>${esc(c.name)}</h2>${c.en ? `<span class="section-en">${esc(c.en)}</span>` : ''}
        <span class="cat-count">${c.items.length} 款</span>
      </div>
      ${c.items.map((it) => `
        <article class="item${it.soldOut ? ' sold-out' : ''}" data-open="${esc(it.id)}">
          ${artHTML(it)}
          <div class="item-main">
            <div class="item-name">${esc(it.name)}</div>
            ${it.en ? `<div class="item-en">${esc(it.en)}</div>` : ''}
            ${it.desc ? `<div class="item-desc">${esc(it.desc)}</div>` : ''}
            ${tagsHTML(it)}
            <div class="item-foot">${priceHTML(it, state.index[it.id].groups)}<div class="ctrl" data-id="${esc(it.id)}">${controlHTML(it)}</div></div>
          </div>
        </article>`).join('')}
    </section>`).join('');
}

// 分类导航：点击跳转 + 滚动高亮
let spyLock = 0;
function onCatClick(i) {
  const sec = el('cat-' + i);
  if (!sec) return;
  setActiveTab(i);
  spyLock = Date.now() + 800;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setActiveTab(i) {
  const tabs = document.querySelectorAll('.cat-tab');
  tabs.forEach((t) => t.classList.toggle('active', +t.dataset.cat === +i));
  const active = tabs[i];
  if (active) {
    const nav = el('catNavInner');
    nav.scrollTo({ left: active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
  }
}

let spyRaf = 0;
window.addEventListener('scroll', () => {
  if (spyRaf || Date.now() < spyLock) return;
  spyRaf = requestAnimationFrame(() => {
    spyRaf = 0;
    const navH = el('catNav').offsetHeight + 24;
    let cur = 0;
    document.querySelectorAll('.cat-section').forEach((s) => {
      if (s.getBoundingClientRect().top <= navH) cur = +s.dataset.cat;
    });
    const active = document.querySelector('.cat-tab.active');
    if (!active || +active.dataset.cat !== cur) setActiveTab(cur);
  });
}, { passive: true });

// ---------- Sheet 管理 ----------
let openSheetId = null;
let afterTable = null;

function openSheet(id) {
  if (openSheetId && openSheetId !== id) el(openSheetId).classList.remove('show');
  openSheetId = id;
  el(id).classList.add('show');
  el('backdrop').classList.add('show');
  document.body.classList.add('locked');
}

function closeSheet() {
  if (openSheetId) el(openSheetId).classList.remove('show');
  openSheetId = null;
  el('backdrop').classList.remove('show');
  if (!el('track').classList.contains('show')) document.body.classList.remove('locked');
}

// 下拉关闭
document.querySelectorAll('.sheet').forEach((sheet) => {
  let y0 = null; let dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    const body = sheet.querySelector('.sheet-body');
    const onGrip = e.target.closest('.sheet-handle, .sheet-header');
    if (!onGrip && body && body.scrollTop > 0) return;
    if (e.target.closest('textarea, input, .featured-track')) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 4) { sheet.style.transition = 'none'; sheet.style.transform = `translate(-50%, ${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 90) closeSheet();
    y0 = null;
  });
});

// ---------- 商品详情 ----------
function openItem(id) {
  const ref = state.index[id];
  if (!ref || ref.item.soldOut) return;
  const { item, groups } = ref;
  const sel = {};
  groups.forEach((g) => { sel[g.name] = g.choices[0] && g.choices[0].label; });
  let qty = 1;

  el('itemSheetBody').innerHTML = `
    <div class="detail-art-wrap">${artHTML(item).replace('class="art"', 'class="art detail-art"')}</div>
    <div class="detail-head">
      <div class="detail-name">${esc(item.name)}</div>
      ${item.en ? `<div class="detail-en">${esc(item.en)}</div>` : ''}
      ${tagsHTML(item)}
      ${item.desc ? `<p class="detail-desc">${esc(item.desc)}</p>` : ''}
    </div>
    ${groups.map((g, gi) => `
      <div class="opt-group">
        <div class="opt-title">${esc(g.name)}</div>
        <div class="opt-choices">
          ${g.choices.map((c, ci) => `<button class="opt-chip${ci === 0 ? ' active' : ''}" data-g="${gi}" data-c="${ci}" type="button">${esc(c.label)}${c.delta ? `<small>+¥${money(c.delta)}</small>` : ''}</button>`).join('')}
        </div>
      </div>`).join('')}`;

  const foot = el('itemSheetFoot');
  const paint = () => {
    foot.innerHTML = `<div class="detail-foot">
      <div class="stepper lg">
        <button class="minus" data-q="-1" type="button" aria-label="减少">${icon('minus')}</button>
        <span class="num">${qty}</span>
        <button class="plus" data-q="1" type="button" aria-label="增加">${icon('plus')}</button>
      </div>
      <button class="primary-btn" data-add type="button">加入购物车 · ¥${money(unitPrice(id, sel) * qty)}</button>
    </div>`;
  };
  paint();

  el('itemSheetBody').onclick = (e) => {
    const chip = e.target.closest('.opt-chip');
    if (!chip) return;
    const g = groups[+chip.dataset.g];
    sel[g.name] = g.choices[+chip.dataset.c].label;
    chip.parentElement.querySelectorAll('.opt-chip').forEach((x) => x.classList.toggle('active', x === chip));
    paint();
  };
  foot.onclick = (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { qty = Math.min(99, Math.max(1, qty + +q.dataset.q)); paint(); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      addToCart(id, groups.length ? { ...sel } : {}, qty, add);
      closeSheet();
      toast(`已加入 ${item.name} × ${qty}`, 'check');
    }
  };
  el('itemSheetBody').scrollTop = 0;
  openSheet('itemSheet');
}

// ---------- 购物车弹层 ----------
function renderCart() {
  const row = el('deliverRow');
  el('deliverTable').textContent = state.table ? '桌号 ' + state.table : '请选择桌号';
  row.classList.toggle('missing', !state.table);
  row.classList.toggle('locked', state.tableLocked);

  el('cartLines').innerHTML = state.cart.map((l) => {
    const ref = state.index[l.id];
    if (!ref) return '';
    const it = ref.item;
    const opts = ref.groups.map((g) => l.options[g.name]).filter(Boolean).join(' · ');
    return `<div class="cart-line${it.soldOut ? ' invalid' : ''}">
      ${artHTML(it)}
      <div class="cart-line-main">
        <div class="cart-line-name">${esc(it.name)}</div>
        ${opts ? `<div class="cart-line-opts">${esc(opts)}</div>` : ''}
        <div class="cart-line-price">${it.soldOut ? '<small style="color:var(--red);font-family:var(--sans);font-size:12px">已售罄，将不会下单</small>' : '¥' + money(unitPrice(l.id, l.options) * l.qty)}</div>
      </div>
      <div class="stepper">
        <button class="minus" data-line="${esc(l.key)}" data-d="-1" type="button" aria-label="减少">${icon('minus')}</button>
        <span class="num">${l.qty}</span>
        <button class="plus" data-line="${esc(l.key)}" data-d="1" type="button" aria-label="增加">${icon('plus')}</button>
      </div>
    </div>`;
  }).join('');

  el('noteChips').innerHTML = NOTE_CHIPS
    .map((c) => `<button class="note-chip${state.noteChips.has(c) ? ' active' : ''}" data-chip="${c}" type="button">${c}</button>`)
    .join('');

  const { count, total } = cartTotals();
  el('cartSum').textContent = money(total);
  el('submitOrder').disabled = count === 0;
  el('submitOrder').textContent = count ? `确认下单 · ${count} 件` : '购物车是空的';
}

function openCart() {
  renderCart();
  openSheet('cartSheet');
}

async function submitOrder() {
  if (!state.table) {
    afterTable = () => { openCart(); };
    openTable();
    return;
  }
  const lines = state.cart.filter((l) => state.index[l.id] && !state.index[l.id].item.soldOut);
  if (!lines.length) return toast('购物车是空的');

  const note = [...state.noteChips].join('，') + (el('note').value.trim() ? (state.noteChips.size ? '；' : '') + el('note').value.trim() : '');
  const btn = el('submitOrder');
  btn.disabled = true;
  btn.textContent = '正在提交…';
  try {
    const data = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: state.table, note, items: lines.map((l) => ({ id: l.id, qty: l.qty, options: l.options })) }),
    });
    const o = data.order;
    state.cart = [];
    saveCart();
    state.noteChips.clear();
    el('note').value = '';
    state.orders[o.key] = o;
    state.my.unshift({ key: o.key, no: o.no, at: Date.now() });
    store.set('bar.orders', state.my);
    updateCartUI();
    closeSheet();
    connectStream();
    openTrack(o.key);
    if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  } catch (e) {
    toast(e.message);
    if (e.status === 409) loadMenu();
  } finally {
    btn.disabled = false;
    renderCart();
  }
}

// ---------- 桌号 ----------
let publicTables = [];

function setTable(name, locked) {
  state.table = name;
  state.tableLocked = !!locked;
  store.set('bar.table', { name, at: Date.now(), locked: !!locked });
  const chip = el('tableChip');
  el('tableChipText').textContent = name ? '桌号 ' + name : '选择桌号';
  chip.classList.toggle('empty', !name);
  chip.classList.toggle('locked', !!locked);
  updateCartUI();
}

async function openTable() {
  if (state.tableLocked) { toast('已通过扫码锁定桌号 ' + state.table, 'seat'); return; }
  try { publicTables = (await api('/api/public/tables')).tables || []; } catch (e) { publicTables = []; }
  el('tableGrid').innerHTML = publicTables
    .map((t) => `<button class="table-opt${t === state.table ? ' active' : ''}" data-table="${esc(t)}" type="button">${esc(t)}</button>`)
    .join('');
  el('tableGrid').classList.toggle('hidden', publicTables.length === 0);
  el('tableInput').value = publicTables.includes(state.table) ? '' : state.table;
  openSheet('tableSheet');
}

function confirmTable() {
  const picked = document.querySelector('.table-opt.active');
  const name = (el('tableInput').value.trim() || (picked && picked.dataset.table) || '').slice(0, 20);
  if (!name) return toast('请选择或输入桌号');
  setTable(name, false);
  closeSheet();
  toast('已设置桌号 ' + name, 'seat');
  if (afterTable) { const fn = afterTable; afterTable = null; setTimeout(fn, 250); }
}

// ---------- 呼叫服务 ----------
function openCall() {
  if (!state.table) {
    afterTable = openCall;
    openTable();
    return;
  }
  el('callHint').textContent = `将通知吧台：桌号 ${state.table}`;
  openSheet('callSheet');
}

async function sendCall(type) {
  try {
    const r = await api('/api/calls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: state.table, type }),
    });
    closeSheet();
    toast(r.duplicate ? '已在通知中，服务员马上就到' : '已通知服务员，请稍候', 'bell');
  } catch (e) { toast(e.message); }
}

// ---------- 我的订单 & 追踪 ----------
async function loadMyOrders() {
  if (!state.my.length) return updateOrdersBadge();
  try {
    const { orders } = await api('/api/orders/track?keys=' + state.my.map((m) => m.key).join(','));
    orders.forEach((o) => { state.orders[o.key] = o; });
  } catch (e) {}
  updateOrdersBadge();
}

function updateOrdersBadge() {
  const active = Object.values(state.orders).some((o) => o.status === 'pending' || o.status === 'making');
  el('ordersBadge').classList.toggle('hidden', !active);
}

function renderOrdersList() {
  const list = state.my.map((m) => state.orders[m.key]).filter(Boolean);
  el('ordersList').innerHTML = list.length
    ? list.map((o) => `
      <button class="order-row" data-track="${esc(o.key)}" type="button">
        <div class="order-row-main">
          <div class="order-row-top"><span class="order-row-no">${esc(o.no)}</span><span class="status-pill st-${o.status}">${STATUS_TEXT[o.status]}</span></div>
          <div class="order-row-items">${fmtTime(o.createdAt)} · 桌号 ${esc(o.table)} · ${esc(o.items.map((i) => i.name + '×' + i.qty).join('、'))}</div>
        </div>
        <span class="order-row-total">¥${money(o.total)}</span>
      </button>`).join('')
    : `<div class="empty-state">${icon('receipt')}<p>今晚还没有下单</p></div>`;
}

function openOrders() {
  renderOrdersList();
  openSheet('ordersSheet');
  loadMyOrders().then(() => { if (openSheetId === 'ordersSheet') renderOrdersList(); });
}

const TRACK = {
  pending: { ic: 'clock', title: '订单已送达吧台', sub: '正在等待调酒师确认…' },
  making: { ic: 'shaker', title: '调酒师正在为您制作', sub: '好酒值得等待，请稍候片刻' },
  done: { ic: 'check', title: '已出品，请慢用', sub: 'Cheers! 需要加点随时下单' },
  cancelled: { ic: 'close', title: '订单已取消', sub: '如有疑问，请呼叫服务员' },
};

function renderTrack() {
  const o = state.orders[state.trackKey];
  if (!o) return;
  const t = TRACK[o.status] || TRACK.pending;
  const stage = { pending: 0, making: 1, done: 2 }[o.status];
  const steps = [['已下单', o.createdAt], ['制作中', o.acceptedAt], ['已出品', o.doneAt]];

  el('trackBody').innerHTML = `
    <div class="track-hero">
      <div class="track-emblem ${o.status}">${icon(t.ic)}</div>
      <div class="track-title">${t.title}</div>
      <div class="track-sub">${t.sub}</div>
      <div class="track-no"><span>订单号 <b>${esc(o.no)}</b></span><span>桌号 <b>${esc(o.table)}</b></span></div>
    </div>
    ${o.status === 'cancelled' ? '' : `
    <div class="steps">
      <div class="steps-fill" style="width:calc((100% - 28px) * ${stage / 2})"></div>
      ${steps.map(([label, at], i) => `
        <div class="step ${i < stage || (i === stage && stage === 2) ? 'done' : i === stage ? 'current' : ''}">
          <div class="step-dot">${i <= stage ? icon('check') : ''}</div>
          <div class="step-label">${label}</div>
          <div class="step-time">${fmtTime(at)}</div>
        </div>`).join('')}
    </div>`}
    <div class="receipt-card">
      <h4>订单明细</h4>
      ${o.items.map((i) => `
        <div class="r-line">
          <div>${esc(i.name)}<span class="q">× ${i.qty}</span>${i.options && i.options.length ? `<small>${esc(i.options.join(' · '))}</small>` : ''}</div>
          <div>¥${money(i.price * i.qty)}</div>
        </div>`).join('')}
      <div class="r-total"><span>合计</span><b>¥${money(o.total)}</b></div>
      ${o.note ? `<div class="r-note">备注：${esc(o.note)}</div>` : ''}
    </div>`;
}

async function openTrack(key) {
  state.trackKey = key;
  if (!state.orders[key]) await loadMyOrders();
  closeSheet();
  renderTrack();
  el('track').classList.add('show');
  document.body.classList.add('locked');
}

function closeTrack() {
  el('track').classList.remove('show');
  state.trackKey = null;
  document.body.classList.remove('locked');
}

// ---------- 实时推送 ----------
function connectStream() {
  if (state.es) state.es.close();
  const keys = state.my.map((m) => m.key).join(',');
  const es = new EventSource('/api/stream/customer?keys=' + encodeURIComponent(keys));
  state.es = es;
  es.addEventListener('order', (e) => {
    const o = JSON.parse(e.data);
    const prev = state.orders[o.key];
    state.orders[o.key] = o;
    updateOrdersBadge();
    if (state.trackKey === o.key) renderTrack();
    if (openSheetId === 'ordersSheet') renderOrdersList();
    if (prev && prev.status !== o.status) {
      const msg = { making: '已开始制作', done: '已出品，请慢用', cancelled: '已被取消' }[o.status];
      if (msg) {
        toast(`订单 ${o.no} ${msg}`, o.status === 'done' ? 'check' : 'shaker');
        if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
      }
    }
  });
  es.addEventListener('menu', () => { loadInfo(); loadMenu(); });
  es.addEventListener('open', () => loadMyOrders());
}

// ---------- 数据加载 ----------
async function loadInfo() {
  try {
    state.info = await api('/api/public/info');
    el('shopName').textContent = state.info.shopName || 'The Bar';
    el('tagline').textContent = state.info.tagline || '';
    document.title = '点单 · ' + (state.info.shopName || 'The Bar');
    el('noticeText').textContent = state.info.notice || '';
    el('notice').classList.toggle('hidden', !state.info.notice);
  } catch (e) {}
}

async function loadMenu() {
  try {
    state.menu = await api('/api/menu');
  } catch (e) {
    el('menu').innerHTML = `<div class="empty-state">${icon('glass')}<p>菜单加载失败，请下拉刷新</p></div>`;
    return;
  }
  buildIndex();
  state.cart = state.cart.filter((l) => state.index[l.id]);
  saveCart();
  renderMenu();
  updateCartUI();
}

function initTable() {
  const t = new URLSearchParams(location.search).get('table');
  if (t) return setTable(t.trim().slice(0, 20), true);
  const saved = store.get('bar.table', null);
  if (saved && saved.name && Date.now() - saved.at < 12 * 3600 * 1000) setTable(saved.name, false);
  else setTable('', false);
}

function initGreeting() {
  const h = new Date().getHours();
  el('greeting').textContent = h < 5 ? 'Late Night' : h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
}

// ---------- 事件 ----------
document.addEventListener('click', (e) => {
  const actBtn = e.target.closest('.ctrl [data-act]');
  if (actBtn) {
    e.stopPropagation();
    const id = actBtn.closest('.ctrl').dataset.id;
    const act = actBtn.dataset.act;
    if (act === 'spec') openItem(id);
    else if (act === 'add') addToCart(id, {}, 1, actBtn);
    else if (act === 'minus') {
      const line = state.cart.find((l) => l.id === id);
      if (line) changeLine(line.key, -1);
    }
    return;
  }
  const opener = e.target.closest('[data-open]');
  if (opener) return openItem(opener.dataset.open);

  const cat = e.target.closest('.cat-tab');
  if (cat) return onCatClick(+cat.dataset.cat);

  const lineBtn = e.target.closest('[data-line]');
  if (lineBtn) return changeLine(lineBtn.dataset.line, +lineBtn.dataset.d);

  const chip = e.target.closest('[data-chip]');
  if (chip) {
    const c = chip.dataset.chip;
    if (state.noteChips.has(c)) state.noteChips.delete(c); else state.noteChips.add(c);
    chip.classList.toggle('active');
    return;
  }
  const tableOpt = e.target.closest('.table-opt');
  if (tableOpt) {
    document.querySelectorAll('.table-opt').forEach((x) => x.classList.toggle('active', x === tableOpt));
    el('tableInput').value = '';
    return;
  }
  const call = e.target.closest('[data-call]');
  if (call) return sendCall(call.dataset.call);

  const tr = e.target.closest('[data-track]');
  if (tr) return openTrack(tr.dataset.track);

  if (e.target.closest('[data-close]')) closeSheet();
});

el('backdrop').addEventListener('click', () => { afterTable = null; closeSheet(); });
el('dockBag').addEventListener('click', openCart);
el('dockInfo').addEventListener('click', openCart);
el('dockGo').addEventListener('click', openCart);
el('submitOrder').addEventListener('click', submitOrder);
el('clearCart').addEventListener('click', () => {
  if (!state.cart.length) return;
  state.cart = [];
  saveCart();
  updateCartUI();
  closeSheet();
});
el('deliverRow').addEventListener('click', () => { afterTable = openCart; openTable(); });
el('tableChip').addEventListener('click', openTable);
el('tableConfirm').addEventListener('click', confirmTable);
el('tableInput').addEventListener('input', () => document.querySelectorAll('.table-opt').forEach((x) => x.classList.remove('active')));
el('tableInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmTable(); });
el('callBtn').addEventListener('click', openCall);
el('ordersBtn').addEventListener('click', openOrders);
el('trackClose').addEventListener('click', closeTrack);
el('trackMore').addEventListener('click', closeTrack);
el('trackCall').addEventListener('click', () => { closeTrack(); openCall(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (openSheetId) closeSheet(); else if (state.trackKey) closeTrack();
});

// ---------- 启动 ----------
store.set('bar.orders', state.my);
hydrateIcons();
initGreeting();
initTable();
loadInfo();
loadMenu();
loadMyOrders();
connectStream();
