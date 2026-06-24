// ---------- 状态 ----------
const cart = {}; // { id: { item, qty } }
let menuData = { categories: [] };

const el = (id) => document.getElementById(id);

// ---------- 加载菜单 ----------
async function loadMenu() {
  const res = await fetch('/api/menu');
  menuData = await res.json();
  renderMenu();
}

function renderMenu() {
  const menu = el('menu');
  menu.innerHTML = '';
  menuData.categories.forEach((cat) => {
    const section = document.createElement('section');
    section.className = 'cat';
    section.innerHTML = `<h2 class="cat-title">${cat.name}</h2>`;
    cat.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          ${item.desc ? `<div class="item-desc">${item.desc}</div>` : ''}
          <div class="item-price">¥${item.price}</div>
        </div>
        <div class="qty-ctrl" data-id="${item.id}">
          <button class="qty-btn minus">−</button>
          <span class="qty-num">0</span>
          <button class="qty-btn plus">+</button>
        </div>`;
      menu.appendChild(row);

      const ctrl = row.querySelector('.qty-ctrl');
      ctrl.querySelector('.plus').addEventListener('click', () => changeQty(item, 1, ctrl));
      ctrl.querySelector('.minus').addEventListener('click', () => changeQty(item, -1, ctrl));
    });
    menu.appendChild(section);
  });
}

function changeQty(item, delta, ctrl) {
  const cur = cart[item.id] ? cart[item.id].qty : 0;
  const next = Math.max(0, cur + delta);
  if (next === 0) {
    delete cart[item.id];
  } else {
    cart[item.id] = { item, qty: next };
  }
  if (ctrl) ctrl.querySelector('.qty-num').textContent = next;
  updateCartBar();
}

function cartList() {
  return Object.values(cart);
}

function cartTotals() {
  let count = 0;
  let total = 0;
  cartList().forEach(({ item, qty }) => {
    count += qty;
    total += item.price * qty;
  });
  return { count, total };
}

function updateCartBar() {
  const { count, total } = cartTotals();
  el('cartCount').textContent = count;
  el('cartTotal').textContent = total;
  el('cartBar').classList.toggle('hidden', count === 0);
}

// ---------- 购物车弹层 ----------
function openCart() {
  renderCartItems();
  el('cartModal').classList.remove('hidden');
}
function closeCart() {
  el('cartModal').classList.add('hidden');
}

function renderCartItems() {
  const box = el('cartItems');
  box.innerHTML = '';
  const list = cartList();
  if (list.length === 0) {
    box.innerHTML = '<p class="muted">购物车是空的</p>';
  }
  list.forEach(({ item, qty }) => {
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div class="cart-row-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">¥${item.price}</div>
      </div>
      <div class="qty-ctrl small">
        <button class="qty-btn minus">−</button>
        <span class="qty-num">${qty}</span>
        <button class="qty-btn plus">+</button>
      </div>`;
    box.appendChild(row);
    const ctrl = row.querySelector('.qty-ctrl');
    ctrl.querySelector('.plus').addEventListener('click', () => {
      changeQty(item, 1);
      renderCartItems();
      syncMenuQty(item.id);
    });
    ctrl.querySelector('.minus').addEventListener('click', () => {
      changeQty(item, -1);
      renderCartItems();
      syncMenuQty(item.id);
    });
  });
  el('modalTotal').textContent = cartTotals().total;
}

// 弹层内改数量后，同步菜单上的数字
function syncMenuQty(id) {
  const ctrl = document.querySelector(`.menu .qty-ctrl[data-id="${id}"]`);
  if (ctrl) ctrl.querySelector('.qty-num').textContent = cart[id] ? cart[id].qty : 0;
}

// ---------- 提交订单 ----------
async function submitOrder() {
  const table = el('table').value.trim();
  if (!table) {
    alert('请先填写座位号 / 桌号');
    el('table').focus();
    return;
  }
  const list = cartList();
  if (list.length === 0) {
    alert('购物车是空的');
    return;
  }

  const btn = el('submitOrder');
  btn.disabled = true;
  btn.textContent = '提交中...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table,
        note: el('note').value,
        items: list.map(({ item, qty }) => ({ id: item.id, qty })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '下单失败');

    // 清空
    Object.keys(cart).forEach((k) => delete cart[k]);
    el('note').value = '';
    updateCartBar();
    closeCart();
    document.querySelectorAll('.menu .qty-num').forEach((n) => (n.textContent = '0'));

    el('successNo').textContent = '订单号 ' + data.order.no + ' · 座位 ' + data.order.table;
    el('successModal').classList.remove('hidden');
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '提交订单';
  }
}

// ---------- 事件绑定 ----------
el('openCart').addEventListener('click', openCart);
el('closeCart').addEventListener('click', closeCart);
el('submitOrder').addEventListener('click', submitOrder);
el('newOrder').addEventListener('click', () => el('successModal').classList.add('hidden'));
el('cartModal').addEventListener('click', (e) => {
  if (e.target.id === 'cartModal') closeCart();
});

// 扫码进入：URL 带 ?table=xxx 则自动带入桌号并锁定
function applyTableParam() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('table');
  if (t) {
    const input = el('table');
    input.value = t;
    input.readOnly = true;
    el('seatBar').classList.add('locked');
    el('seatHint').textContent = '（已锁定）';
  }
}

applyTableParam();
loadMenu();
