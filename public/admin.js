const el = (id) => document.getElementById(id);

let orders = [];
let currentFilter = 'pending';
let knownIds = new Set(); // 已经见过的订单，用于检测新订单
let firstLoad = true;

// ---------- 工具 ----------
function fmtTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 拉取订单 ----------
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    orders = data.orders || [];

    // 检测新订单（首次加载不触发）
    const newOnes = orders.filter((o) => !knownIds.has(o.id));
    orders.forEach((o) => knownIds.add(o.id));

    if (!firstLoad && newOnes.length > 0) {
      onNewOrders(newOnes);
    }
    firstLoad = false;

    render();
    el('lastUpdate').textContent = '更新于 ' + new Date().toLocaleTimeString();
    blinkDot();
  } catch (e) {
    el('lastUpdate').textContent = '连接失败，重试中...';
  }
}

function onNewOrders(newOnes) {
  // 提示音
  if (el('sound').checked) {
    const ding = el('ding');
    try { ding.currentTime = 0; ding.play().catch(() => beep()); } catch (e) { beep(); }
  }
  // 自动打印
  if (el('autoPrint').checked) {
    // 按下单顺序逐个打印
    newOnes.sort((a, b) => a.id - b.id).forEach((o) => printOrder(o.id, true));
  }
}

// 后备提示音（WebAudio），避免空音频不响
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function blinkDot() {
  const dot = el('liveDot');
  dot.classList.add('blink');
  setTimeout(() => dot.classList.remove('blink'), 300);
}

// ---------- 渲染 ----------
function render() {
  const pending = orders.filter((o) => o.status === 'pending');
  const done = orders.filter((o) => o.status === 'done');
  el('cntPending').textContent = pending.length;
  el('cntDone').textContent = done.length;

  let list = orders;
  if (currentFilter === 'pending') list = pending;
  else if (currentFilter === 'done') list = done;

  const box = el('orders');
  box.innerHTML = '';
  if (list.length === 0) {
    box.innerHTML = '<p class="empty">暂无订单</p>';
    return;
  }

  list.forEach((o) => {
    const card = document.createElement('div');
    card.className = 'order-card ' + o.status;
    const itemsHtml = o.items
      .map((it) => `<div class="o-item"><span>${it.name} ×${it.qty}</span><span>¥${it.price * it.qty}</span></div>`)
      .join('');
    card.innerHTML = `
      <div class="o-head">
        <div>
          <span class="o-seat">座位 ${o.table}</span>
          <span class="o-no">${o.no}</span>
        </div>
        <span class="o-time">${fmtTime(o.createdAt)}</span>
      </div>
      <div class="o-items">${itemsHtml}</div>
      ${o.note ? `<div class="o-note">📝 ${o.note}</div>` : ''}
      <div class="o-foot">
        <span class="o-total">合计 ¥${o.total}</span>
        <div class="o-actions">
          <button class="btn-ghost" data-act="print" data-id="${o.id}">🖨 打印</button>
          ${o.status === 'pending'
            ? `<button class="btn-primary" data-act="done" data-id="${o.id}">✓ 完成</button>`
            : `<button class="btn-ghost" data-act="reopen" data-id="${o.id}">↩ 重开</button>`}
          <button class="btn-danger" data-act="del" data-id="${o.id}">删除</button>
        </div>
      </div>
      ${o.printed ? '<span class="printed-flag">已打印</span>' : ''}`;
    box.appendChild(card);
  });

  box.querySelectorAll('button[data-act]').forEach((btn) => {
    const id = parseInt(btn.dataset.id, 10);
    const act = btn.dataset.act;
    btn.addEventListener('click', () => handleAction(act, id));
  });
}

async function handleAction(act, id) {
  if (act === 'print') return printOrder(id, false);
  if (act === 'done') return updateOrder(id, { status: 'done' });
  if (act === 'reopen') return updateOrder(id, { status: 'pending' });
  if (act === 'del') {
    if (!confirm('确定删除该订单？')) return;
    await fetch('/api/orders/' + id, { method: 'DELETE' });
    knownIds.delete(id);
    fetchOrders();
  }
}

async function updateOrder(id, patch) {
  await fetch('/api/orders/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  fetchOrders();
}

// ---------- 打印小票 ----------
function printOrder(id, silentMark) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;

  const itemsHtml = o.items
    .map(
      (it) => `<tr>
        <td>${it.name}</td>
        <td class="c">${it.qty}</td>
        <td class="r">¥${it.price * it.qty}</td>
      </tr>`
    )
    .join('');

  el('printArea').innerHTML = `
    <div class="receipt">
      <h2>🍸 The Bar</h2>
      <div class="r-sub">点单小票</div>
      <hr/>
      <div class="r-row big"><span>座位号</span><strong>${o.table}</strong></div>
      <div class="r-row"><span>订单号</span><span>${o.no}</span></div>
      <div class="r-row"><span>下单时间</span><span>${fmtTime(o.createdAt)}</span></div>
      <hr/>
      <table class="r-table">
        <thead><tr><th>品项</th><th class="c">数量</th><th class="r">小计</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <hr/>
      <div class="r-row total"><span>合计</span><strong>¥${o.total}</strong></div>
      ${o.note ? `<div class="r-note">备注：${o.note}</div>` : ''}
      <div class="r-foot">感谢惠顾，请慢用 🍻</div>
    </div>`;

  // 标记已打印
  updateOrder(id, { printed: true });

  // 触发打印
  window.print();
}

// ---------- Tab 切换 ----------
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    currentFilter = t.dataset.filter;
    render();
  });
});

// ========== 视图切换 ==========
let currentView = 'orders';
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    el('view-' + currentView).classList.remove('hidden');
    if (currentView === 'tables') loadTables();
    if (currentView === 'stats') loadStats();
  });
});

// ========== 桌台二维码 ==========
let tables = [];

async function loadTables() {
  const res = await fetch('/api/tables');
  const data = await res.json();
  tables = data.tables || [];
  renderTables();
}

function qrUrl(name) {
  return '/api/qr?table=' + encodeURIComponent(name) + '&base=' + encodeURIComponent(window.location.origin);
}

function renderTables() {
  const grid = el('qrGrid');
  grid.innerHTML = '';
  if (tables.length === 0) {
    grid.innerHTML = '<p class="empty">还没有桌台，先在上方添加一个吧</p>';
    return;
  }
  tables.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.innerHTML = `
      <div class="qr-name">${t.name}</div>
      <img class="qr-img" src="${qrUrl(t.name)}" alt="二维码 ${t.name}" />
      <div class="qr-actions">
        <a class="btn-ghost" href="${qrUrl(t.name)}" download="QR-${t.name}.png">下载</a>
        <button class="btn-danger" data-del="${t.name}">删除</button>
      </div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('button[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('删除桌台 ' + b.dataset.del + '？')) return;
      await fetch('/api/tables/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
      loadTables();
    });
  });
}

async function addTable() {
  const name = el('newTable').value.trim();
  if (!name) return;
  const res = await fetch('/api/tables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || '添加失败');
  el('newTable').value = '';
  loadTables();
}

el('addTable').addEventListener('click', addTable);
el('newTable').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTable(); });

el('printAllQr').addEventListener('click', () => {
  if (tables.length === 0) return alert('还没有桌台');
  el('printArea').innerHTML =
    '<div class="qr-print">' +
    tables
      .map(
        (t) => `<div class="qr-print-card">
          <div class="qr-print-name">${t.name}</div>
          <img src="${qrUrl(t.name)}" />
          <div class="qr-print-tip">扫码点单 · The Bar</div>
        </div>`
      )
      .join('') +
    '</div>';
  el('printArea').dataset.mode = 'qr';
  setTimeout(() => window.print(), 300); // 等二维码图片加载
});

// ========== 营业额统计 ==========
async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  el('stToday').textContent = '¥' + s.todayRevenue;
  el('stTodayCount').textContent = s.todayCount;
  el('stAvg').textContent = '¥' + s.todayAvg;
  el('stTotal').textContent = '¥' + s.totalRevenue;
  el('stTotalCount').textContent = s.totalCount;

  // 近 7 天柱状图
  const max = Math.max(1, ...s.last7.map((d) => d.revenue));
  el('chart7').innerHTML = s.last7
    .map((d) => {
      const h = Math.round((d.revenue / max) * 100);
      const mmdd = d.date.slice(5);
      return `<div class="bar-col">
        <div class="bar-val">¥${d.revenue}</div>
        <div class="bar" style="height:${h}%"></div>
        <div class="bar-label">${mmdd}</div>
      </div>`;
    })
    .join('');

  // 热销榜
  const box = el('topItems');
  if (s.topItems.length === 0) {
    box.innerHTML = '<p class="empty">暂无销售数据</p>';
  } else {
    const maxQty = Math.max(1, ...s.topItems.map((i) => i.qty));
    box.innerHTML = s.topItems
      .map((it, i) => {
        const w = Math.round((it.qty / maxQty) * 100);
        return `<div class="top-row">
          <span class="rank ${i < 3 ? 'top3' : ''}">${i + 1}</span>
          <span class="top-name">${it.name}</span>
          <div class="top-bar-wrap"><div class="top-bar" style="width:${w}%"></div></div>
          <span class="top-qty">×${it.qty}</span>
          <span class="top-rev">¥${it.revenue}</span>
        </div>`;
      })
      .join('');
  }
}

// ---------- 启动轮询 ----------
fetchOrders();
setInterval(() => {
  if (currentView === 'orders') fetchOrders();
  else if (currentView === 'stats') loadStats();
}, 3000);
