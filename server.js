const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');

app.use(express.json());
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

function loadOrders() {
  return readJSON(ORDERS_FILE, { seq: 0, orders: [] });
}

function saveOrders(db) {
  writeJSON(ORDERS_FILE, db);
}

function loadTables() {
  return readJSON(TABLES_FILE, { tables: [] });
}

function saveTables(db) {
  writeJSON(TABLES_FILE, db);
}

// 本地日期 YYYY-MM-DD
function localDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- API ----------

// 获取菜单
app.get('/api/menu', (req, res) => {
  const menu = readJSON(MENU_FILE, { categories: [] });
  res.json(menu);
});

// 顾客下单
app.post('/api/orders', (req, res) => {
  const { table, items, note } = req.body || {};

  if (!table || String(table).trim() === '') {
    return res.status(400).json({ error: '请填写座位号 / 桌号' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '购物车为空' });
  }

  // 用服务端菜单校验价格，避免前端篡改
  const menu = readJSON(MENU_FILE, { categories: [] });
  const priceMap = {};
  menu.categories.forEach((c) =>
    c.items.forEach((it) => {
      priceMap[it.id] = it;
    })
  );

  const cleanItems = [];
  for (const i of items) {
    const ref = priceMap[i.id];
    const qty = parseInt(i.qty, 10);
    if (!ref || !qty || qty <= 0) continue;
    cleanItems.push({ id: ref.id, name: ref.name, price: ref.price, qty });
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
    table: String(table).trim(),
    items: cleanItems,
    note: (note || '').trim(),
    total,
    status: 'pending', // pending -> done
    printed: false,
    createdAt: new Date().toISOString(),
  };
  db.orders.push(order);
  saveOrders(db);

  res.json({ ok: true, order });
});

// 商家获取订单列表
app.get('/api/orders', (req, res) => {
  const db = loadOrders();
  // 最新的在前
  const orders = [...db.orders].sort((a, b) => b.id - a.id);
  res.json({ orders });
});

// 更新订单状态 (完成 / 标记已打印)
app.patch('/api/orders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = loadOrders();
  const order = db.orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ error: '订单不存在' });

  const { status, printed } = req.body || {};
  if (status && ['pending', 'done'].includes(status)) order.status = status;
  if (typeof printed === 'boolean') order.printed = printed;

  saveOrders(db);
  res.json({ ok: true, order });
});

// 删除订单
app.delete('/api/orders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = loadOrders();
  const idx = db.orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders.splice(idx, 1);
  saveOrders(db);
  res.json({ ok: true });
});

// ---------- 桌台管理 ----------

// 桌台列表
app.get('/api/tables', (req, res) => {
  res.json(loadTables());
});

// 新增桌台
app.post('/api/tables', (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : '').trim();
  if (!name) return res.status(400).json({ error: '请填写桌号' });
  const db = loadTables();
  if (db.tables.some((t) => t.name === name)) {
    return res.status(400).json({ error: '该桌号已存在' });
  }
  db.tables.push({ name });
  saveTables(db);
  res.json({ ok: true, tables: db.tables });
});

// 删除桌台
app.delete('/api/tables/:name', (req, res) => {
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
    const png = await QRCode.toBuffer(url, { type: 'png', width: 600, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    res.status(500).send('qr error');
  }
});

// ---------- 营业额统计 ----------
app.get('/api/stats', (req, res) => {
  const db = loadOrders();
  const orders = db.orders;
  const today = localDate(new Date());

  let todayRevenue = 0;
  let todayCount = 0;
  let totalRevenue = 0;
  const itemAgg = {}; // name -> { name, qty, revenue }
  const byDate = {}; // date -> { date, revenue, count }

  orders.forEach((o) => {
    const d = localDate(new Date(o.createdAt));
    totalRevenue += o.total;
    if (d === today) {
      todayRevenue += o.total;
      todayCount += 1;
    }
    if (!byDate[d]) byDate[d] = { date: d, revenue: 0, count: 0 };
    byDate[d].revenue += o.total;
    byDate[d].count += 1;

    o.items.forEach((it) => {
      if (!itemAgg[it.name]) itemAgg[it.name] = { name: it.name, qty: 0, revenue: 0 };
      itemAgg[it.name].qty += it.qty;
      itemAgg[it.name].revenue += it.price * it.qty;
    });
  });

  // 最近 7 天（含今天），缺失的日期补 0
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    last7.push(byDate[key] || { date: key, revenue: 0, count: 0 });
  }

  const topItems = Object.values(itemAgg).sort((a, b) => b.qty - a.qty).slice(0, 10);

  res.json({
    today,
    todayRevenue,
    todayCount,
    todayAvg: todayCount ? Math.round(todayRevenue / todayCount) : 0,
    totalRevenue,
    totalCount: orders.length,
    last7,
    topItems,
  });
});

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  🍸 酒吧点单系统 v1.0 已启动');
  console.log('  顾客点单页:  http://localhost:' + PORT + '/');
  console.log('  商家后台:    http://localhost:' + PORT + '/admin.html');
  console.log('========================================');
});
