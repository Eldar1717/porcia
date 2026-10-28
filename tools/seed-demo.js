#!/usr/bin/env node
/**
 * Наполнение демо-данными: создаёт несколько заказов в разных статусах,
 * чтобы экран кухни, табло выдачи и дашборд сразу выглядели живыми.
 *
 *   node tools/seed-demo.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';

const orders = [
  {
    items: [
      { productId: 'cheeseburger', qty: 1 },
      { productId: 'fries', qty: 2 },
      { productId: 'lemonade', qty: 2, mods: [{ groupId: 'drink-size', optionId: 'd500', name: '0,5 л', price: 40 }] }
    ],
    payMethod: 'card', next: 'cooking'
  },
  {
    items: [
      { productId: 'pepperoni', qty: 1, mods: [{ groupId: 'pizza-size', optionId: 'p30', name: '30 см', price: 200 }] },
      { productId: 'caesar', qty: 1, mods: [{ groupId: 'salad-add', optionId: 'chicken', name: 'Курица гриль', price: 99 }] }
    ],
    payMethod: 'card', next: 'ready'
  },
  {
    items: [{
      productId: 'cappuccino', qty: 2, mods: [
        { groupId: 'coffee-size', optionId: 'c400', name: '400 мл', price: 50 },
        { groupId: 'syrup', optionId: 'caramel', name: 'Карамель', price: 40 }
      ]
    }],
    payMethod: 'counter'
  },
  {
    items: [
      { productId: 'doublecheese', qty: 1, mods: [{ groupId: 'burger-add', optionId: 'bacon', name: 'Бекон', price: 79 }] },
      { productId: 'nuggets', qty: 1 },
      { productId: 'cheesecake', qty: 1 }
    ],
    payMethod: 'card', next: 'done'
  }
];

const api = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || res.status);
  return data;
};

(async () => {
  await api('POST', '/api/reset');
  for (const o of orders) {
    const created = await api('POST', '/api/orders', { items: o.items, payMethod: o.payMethod, source: 'kiosk' });
    if (o.next) await api('POST', `/api/orders/${created.id}/status`, { status: o.next });
    console.log(`#${created.number} — ${created.total} ₽ — ${o.next || created.status}`);
  }
  const stats = await api('GET', '/api/stats');
  console.log('\nИтого сегодня:', stats.ordersToday, 'заказов,', stats.revenueToday, '₽, средний чек', stats.avgCheck, '₽');
})().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
