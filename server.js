const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const STATUSES = ['pending', 'making', 'done', 'cancelled'];
const CALL_TYPES = { waiter: '呼叫服务员', bill: '买单结账', water: '冰水 / 纸巾' };

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 简单的 JSON 文件存储 ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

const loadMenu = () => readJSON(MENU_FILE, { categories: [] });
const saveMenu = (m) => writeJSON(MENU_FILE, m);
const loadOrders = () => readJSON(ORDERS_FILE, { seq: 0, orders: [] });
const saveOrders = (db) => writeJSON(ORDERS_FILE, db);
const loadTables = () => readJSON(TABLES_FILE, { tables: [] });
const saveTables = (db) => writeJSON(TABLES_FILE, db);

function loadSettings() {
  const s = readJSON(SETTINGS_FILE, {});
  let changed = false;
  const defaults = {
    shopName: 'The Bar',
    tagline: 'Cocktails · Craft Beer · Late Night',
    notice: '',
    adminPin: process.env.ADMIN_PIN || '8888',
  };
  for (const k of Object.keys(defaults)) {
    if (s[k] === undefined) { s[k] = defaults[k]; changed = true; }
  }
  if (!s.secret) { s.secret = crypto.randomBytes(16).toString('hex'); changed = true; }
  if (changed) writeJSON(SETTINGS_FILE, s);
  return s;
}

// 本地日期 YYYY-MM-DD
function localDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 菜单项索引：id -> { item, category }
function menuIndex(menu) {
  const map = {};
  menu.categories.forEach((c) => c.items.forEach((it) => { map[it.id] = { item: it, category: c }; }));
  return map;
}

// 顾客可见的订单视图（不含内部字段）
function publicOrder(o) {
  return {
    no: o.no, key: o.key, table: o.table, items: o.items, note: o.note, total: o.total,
    status: o.status, createdAt: o.createdAt, acceptedAt: o.acceptedAt || null,
    doneAt: o.doneAt || null, cancelledAt: o.cancelledAt || null,
  };
}

// ---------- 鉴权（PIN + Cookie） ----------
function adminToken(s) {
  return crypto.createHash('sha256').update(s.secret + ':' + s.adminPin).digest('hex');
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function requireAdmin(req, res, next) {
  const s = loadSettings();
  if (getCookie(req, 'bar_admin') === adminToken(s)) return next();
  res.status(401).json({ error: '请先登录商家后台' });
}

// ---------- 实时推送（Server-Sent Events） ----------
const adminClients = new Set();
const customerClients = new Set(); // { res, keys:Set }

function sseOpen(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function pushAdmin(event, data) {
  adminClients.forEach((res) => sseSend(res, event, data));
}

function pushOrderToCustomers(order) {
  customerClients.forEach((c) => {
    if (c.keys.has(order.key)) sseSend(c.res, 'order', publicOrder(order));
  });
}

function pushMenuToCustomers() {
  customerClients.forEach((c) => sseSend(c.res, 'menu', { at: Date.now() }));
}

setInterval(() => {
  adminClients.forEach((res) => res.write(': ping\n\n'));
  customerClients.forEach((c) => c.res.write(': ping\n\n'));
}, 25000);

app.get('/api/stream/admin', requireAdmin, (req, res) => {
  sseOpen(res);
  adminClients.add(res);
  sseSend(res, 'hello', { at: Date.now() });
  req.on('close', () => adminClients.delete(res));
});

app.get('/api/stream/customer', (req, res) => {
  const keys = new Set(String(req.query.keys || '').split(',').filter(Boolean).slice(0, 50));
  sseOpen(res);
  const client = { res, keys };
  customerClients.add(client);
  req.on('close', () => customerClients.delete(client));
});

// ================= 顾客端 API =================

app.get('/api/public/info', (req, res) => {
  const s = loadSettings();
  res.json({ shopName: s.shopName, tagline: s.tagline, notice: s.notice });
});

app.get('/api/public/tables', (req, res) => {
  res.json({ tables: loadTables().tables.map((t) => t.name) });
});

app.get('/api/menu', (req, res) => {
  res.json(loadMenu());
});

// 顾客下单
app.post('/api/orders', (req, res) => {
  const { table, items, note } = req.body || {};

  if (!table || String(table).trim() === '') {
    return res.status(400).json({ error: '请先选择桌号' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '购物车为空' });
  }

  // 以服务端菜单为准校验价格 / 规格 / 售罄，避免前端篡改
  const index = menuIndex(loadMenu());
  const cleanItems = [];
  for (const i of items.slice(0, 100)) {
    const ref = index[i && i.id];
    const qty = parseInt(i && i.qty, 10);
    if (!ref || !qty || qty <= 0 || qty > 99) continue;
    const { item, category } = ref;
    if (item.soldOut) {
      return res.status(409).json({ error: `「${item.name}」已售罄，请从购物车移除后再下单` });
    }
    const groups = item.options || category.options || [];
    const chosen = (i.options && typeof i.options === 'object') ? i.options : {};
    const opts = [];
    let price = item.price;
    for (const g of groups) {
      const label = chosen[g.name];
      const choice = g.choices.find((c) => c.label === label) || g.choices[0];
      if (!choice) continue;
      price += choice.delta || 0;
      opts.push(choice.label);
    }
    cleanItems.push({ id: item.id, name: item.name, en: item.en || '', price, qty, options: opts });
  }

  if (cleanItems.length === 0) {
    return res.status(400).json({ error: '订单内容无效' });
  }

  const total = cleanItems.reduce((s, it) => s + it.price * it.qty, 0);

  const db = loadOrders();
  db.seq += 1;
  const order = {
    id: db.seq,
    no: 'B' + String(db.seq).padStart(4, '0'),
    key: crypto.randomBytes(8).toString('hex'),
    table: String(table).trim().slice(0, 20),
    items: cleanItems,
    note: String(note || '').trim().slice(0, 200),
    total,
    status: 'pending', // pending -> making -> done | cancelled
    printed: false,
    createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  saveOrders(db);

  pushAdmin('order:new', order);
  res.json({ ok: true, order: publicOrder(order) });
});

// 顾客查询自己的订单（凭下单时返回的 key）
app.get('/api/orders/track', (req, res) => {
  const keys = new Set(String(req.query.keys || '').split(',').filter(Boolean));
  const orders = loadOrders().orders.filter((o) => o.key && keys.has(o.key));
  res.json({ orders: orders.sort((a, b) => b.id - a.id).map(publicOrder) });
});

// 呼叫服务
const calls = []; // 内存中保存，重启清空
let callSeq = 0;
app.post('/api/calls', (req, res) => {
  const table = String((req.body && req.body.table) || '').trim().slice(0, 20);
  const type = String((req.body && req.body.type) || 'waiter');
  if (!table) return res.status(400).json({ error: '请先选择桌号' });
  if (!CALL_TYPES[type]) return res.status(400).json({ error: '未知的呼叫类型' });
  const recent = calls.find((c) => c.table === table && c.type === type && !c.handled && Date.now() - c.at < 60000);
  if (recent) return res.json({ ok: true, call: recent, duplicate: true });
  const call = { id: ++callSeq, table, type, label: CALL_TYPES[type], at: Date.now(), handled: false };
  calls.push(call);
  if (calls.length > 200) calls.shift();
  pushAdmin('call', call);
  res.json({ ok: true, call });
});

// ================= 商家端 API =================

app.post('/api/admin/login', (req, res) => {
  const s = loadSettings();
  const pin = String((req.body && req.body.pin) || '');
  if (pin !== String(s.adminPin)) return res.status(401).json({ error: 'PIN 不正确' });
  res.setHeader('Set-Cookie', `bar_admin=${adminToken(s)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'bar_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const s = loadSettings();
  res.json({ ok: true, shopName: s.shopName });
});

// 订单列表
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = [...loadOrders().orders].sort((a, b) => b.id - a.id);
  res.json({ orders });
});

// 更新订单状态
app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = loadOrders();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  const { status, printed } = req.body || {};
  if (status && STATUSES.includes(status) && status !== order.status) {
    const now = new Date().toISOString();
    order.status = status;
    if (status === 'making') order.acceptedAt = now;
    if (status === 'done') { order.doneAt = now; if (!order.acceptedAt) order.acceptedAt = now; }
    if (status === 'cancelled') order.cancelledAt = now;
    if (status === 'pending') { delete order.acceptedAt; delete order.doneAt; delete order.cancelledAt; }
  }
  if (typeof printed === 'boolean') order.printed = printed;

  saveOrders(db);
  pushAdmin('order:update', order);
  pushOrderToCustomers(order);
  res.json({ ok: true, order });
});

app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = loadOrders();
  const idx = db.orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders.splice(idx, 1);
  saveOrders(db);
  pushAdmin('order:delete', { id });
  res.json({ ok: true });
});

// 导出订单 CSV
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const statusName = { pending: '待接单', making: '制作中', done: '已完成', cancelled: '已取消' };
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['订单号', '桌号', '下单时间', '状态', '品项', '备注', '金额']];
  loadOrders().orders.forEach((o) => {
    const t = new Date(o.createdAt);
    rows.push([
      o.no, o.table, `${localDate(t)} ${t.toTimeString().slice(0, 8)}`, statusName[o.status] || o.status,
      o.items.map((i) => `${i.name}${i.options && i.options.length ? '(' + i.options.join('/') + ')' : ''}×${i.qty}`).join('; '),
      o.note, o.total,
    ]);
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${localDate(new Date())}.csv"`);
  res.send('﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'));
});

// 服务呼叫
app.get('/api/calls', requireAdmin, (req, res) => {
  res.json({ calls: calls.filter((c) => !c.handled) });
});

app.patch('/api/calls/:id', requireAdmin, (req, res) => {
  const call = calls.find((c) => c.id === parseInt(req.params.id, 10));
  if (!call) return res.status(404).json({ error: '呼叫不存在' });
  call.handled = true;
  pushAdmin('call:handled', { id: call.id });
  res.json({ ok: true });
});

// 菜单管理：整体保存
app.put('/api/admin/menu', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.categories)) return res.status(400).json({ error: '菜单格式错误' });
  const ids = new Set();
  const categories = [];
  for (const c of body.categories) {
    const name = String(c.name || '').trim();
    if (!name) return res.status(400).json({ error: '分类名称不能为空' });
    const items = [];
    for (const it of Array.isArray(c.items) ? c.items : []) {
      const itemName = String(it.name || '').trim();
      const price = Number(it.price);
      if (!itemName) return res.status(400).json({ error: `「${name}」中有菜品缺少名称` });
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: `「${itemName}」价格无效` });
      let id = String(it.id || '').trim();
      if (!id || ids.has(id)) id = 'm' + crypto.randomBytes(3).toString('hex');
      ids.add(id);
      const clean = {
        id, name: itemName, en: String(it.en || '').trim(), price: Math.round(price * 100) / 100,
        desc: String(it.desc || '').trim(), glass: String(it.glass || 'rocks'), tint: String(it.tint || '#c9a46a'),
        tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
      };
      if (it.abv) clean.abv = String(it.abv);
      if (it.image) clean.image = String(it.image);
      if (it.soldOut) clean.soldOut = true;
      if (Array.isArray(it.options) && it.options.length) clean.options = it.options;
      items.push(clean);
    }
    const cat = { name, en: String(c.en || '').trim(), items };
    if (Array.isArray(c.options) && c.options.length) cat.options = c.options;
    categories.push(cat);
  }
  const menu = { categories };
  saveMenu(menu);
  pushMenuToCustomers();
  pushAdmin('menu', {});
  res.json({ ok: true, menu });
});

// 快速切换售罄
app.patch('/api/admin/menu/items/:id', requireAdmin, (req, res) => {
  const menu = loadMenu();
  const ref = menuIndex(menu)[req.params.id];
  if (!ref) return res.status(404).json({ error: '菜品不存在' });
  if (typeof req.body.soldOut === 'boolean') {
    if (req.body.soldOut) ref.item.soldOut = true; else delete ref.item.soldOut;
  }
  saveMenu(menu);
  pushMenuToCustomers();
  pushAdmin('menu', {});
  res.json({ ok: true, item: ref.item });
});

// 店铺设置
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = loadSettings();
  res.json({ shopName: s.shopName, tagline: s.tagline, notice: s.notice });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const s = loadSettings();
  const b = req.body || {};
  if (typeof b.shopName === 'string' && b.shopName.trim()) s.shopName = b.shopName.trim().slice(0, 30);
  if (typeof b.tagline === 'string') s.tagline = b.tagline.trim().slice(0, 60);
  if (typeof b.notice === 'string') s.notice = b.notice.trim().slice(0, 120);
  let relogin = false;
  if (b.newPin !== undefined && b.newPin !== '') {
    if (!/^\d{4,8}$/.test(String(b.newPin))) return res.status(400).json({ error: 'PIN 需为 4–8 位数字' });
    s.adminPin = String(b.newPin);
    relogin = true;
  }
  writeJSON(SETTINGS_FILE, s);
  if (relogin) res.setHeader('Set-Cookie', `bar_admin=${adminToken(s)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
  pushMenuToCustomers();
  res.json({ ok: true });
});

// ---------- 桌台管理 ----------
app.get('/api/tables', requireAdmin, (req, res) => {
  res.json(loadTables());
});

app.post('/api/tables', requireAdmin, (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : '').trim().slice(0, 20);
  if (!name) return res.status(400).json({ error: '请填写桌号' });
  const db = loadTables();
  if (db.tables.some((t) => t.name === name)) {
    return res.status(400).json({ error: '该桌号已存在' });
  }
  db.tables.push({ name });
  saveTables(db);
  res.json({ ok: true, tables: db.tables });
});

app.delete('/api/tables/:name', requireAdmin, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const db = loadTables();
  const before = db.tables.length;
  db.tables = db.tables.filter((t) => t.name !== name);
  if (db.tables.length === before) return res.status(404).json({ error: '桌号不存在' });
  saveTables(db);
  res.json({ ok: true, tables: db.tables });
});

// 生成二维码 PNG，编码点单链接 <base>/?table=xxx
app.get('/api/qr', async (req, res) => {
  const table = (req.query.table || '').toString();
  if (!table) return res.status(400).send('missing table');
  const base = (req.query.base || `${req.protocol}://${req.headers.host}`).toString().replace(/\/+$/, '');
  const url = `${base}/?table=${encodeURIComponent(table)}`;
  try {
    const png = await QRCode.toBuffer(url, {
      type: 'png', width: 600, margin: 2, color: { dark: '#16120d', light: '#ffffff' },
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).send('qr error');
  }
});

// ---------- 营业额统计（不含已取消订单） ----------
app.get('/api/stats', requireAdmin, (req, res) => {
  const orders = loadOrders().orders.filter((o) => o.status !== 'cancelled');
  const index = menuIndex(loadMenu());
  const now = new Date();
  const today = localDate(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = localDate(y);

  let totalRevenue = 0;
  const itemAgg = {};
  const catAgg = {};
  const byDate = {};
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, count: 0 }));
  let prepSum = 0;
  let prepN = 0;

  orders.forEach((o) => {
    const t = new Date(o.createdAt);
    const d = localDate(t);
    totalRevenue += o.total;
    if (!byDate[d]) byDate[d] = { date: d, revenue: 0, count: 0 };
    byDate[d].revenue += o.total;
    byDate[d].count += 1;
    if (d === today) {
      hourly[t.getHours()].revenue += o.total;
      hourly[t.getHours()].count += 1;
      if (o.doneAt) { prepSum += new Date(o.doneAt) - t; prepN += 1; }
    }
    o.items.forEach((it) => {
      if (!itemAgg[it.name]) itemAgg[it.name] = { name: it.name, qty: 0, revenue: 0 };
      itemAgg[it.name].qty += it.qty;
      itemAgg[it.name].revenue += it.price * it.qty;
      const cat = index[it.id] ? index[it.id].category.name : '其他';
      catAgg[cat] = (catAgg[cat] || 0) + it.price * it.qty;
    });
  });

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    last7.push(byDate[key] || { date: key, revenue: 0, count: 0 });
  }

  const td = byDate[today] || { revenue: 0, count: 0 };
  const yd = byDate[yesterday] || { revenue: 0, count: 0 };

  res.json({
    today,
    todayRevenue: td.revenue,
    todayCount: td.count,
    todayAvg: td.count ? Math.round(td.revenue / td.count) : 0,
    yesterdayRevenue: yd.revenue,
    yesterdayCount: yd.count,
    yesterdayAvg: yd.count ? Math.round(yd.revenue / yd.count) : 0,
    avgPrepMinutes: prepN ? Math.round(prepSum / prepN / 60000) : null,
    totalRevenue,
    totalCount: orders.length,
    last7,
    hourly,
    categories: Object.entries(catAgg).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue),
    topItems: Object.values(itemAgg).sort((a, b) => b.qty - a.qty).slice(0, 10),
  });
});

// 本机局域网 IPv4 地址（手机扫码用）
function lanAddresses() {
  const list = [];
  Object.values(require('os').networkInterfaces()).forEach((ifs) => (ifs || []).forEach((i) => {
    if (i.family === 'IPv4' && !i.internal) list.push(i.address);
  }));
  return list;
}

// 端口被占用时自动尝试下一个端口
function start(port, triesLeft) {
  const server = app.listen(port, () => {
    const s = loadSettings();
    console.log('========================================');
    console.log('  🍸 酒吧点单系统 v1.2 已启动');
    if (port !== Number(PORT)) console.log(`  ⚠ 端口 ${PORT} 已被其他程序占用，已改用 ${port}`);
    console.log('  顾客点单页:  http://localhost:' + port + '/');
    console.log('  商家后台:    http://localhost:' + port + '/admin.html');
    lanAddresses().forEach((ip) => console.log(`  局域网后台:  http://${ip}:${port}/admin.html  （用此地址生成二维码）`));
    console.log('  后台 PIN:    ' + (s.adminPin === '8888' ? '8888（默认，请在「店铺设置」中修改）' : '已自定义'));
    console.log('========================================');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) return start(port + 1, triesLeft - 1);
    console.error('启动失败：', err.message);
    process.exit(1);
  });
}

start(Number(PORT), 10);
