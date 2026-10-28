'use strict';
/**
 * ПОРЦИЯ — сервис заказов для заведений общепита.
 * Zero-dependency Node.js сервер: статика + JSON API + live-обновления через SSE.
 *
 * Запуск: node server.js  (PORT по умолчанию 3000)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./lib/seed');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ------------------------------------------------------------------ storage */

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    const fresh = seed();
    save(fresh);
    return fresh;
  }
}

function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = load();

/* миграция: если в базе остались старые пути к картинкам — чиним их при старте */
function migrateImages() {
  let changed = false;
  for (const p of db.products || []) {
    if (!p.image) continue;
    const file = path.join(PUBLIC_DIR, p.image);
    if (fs.existsSync(file)) continue;
    const asJpg = p.image.replace(/\.png$/i, '.jpg');
    if (asJpg !== p.image && fs.existsSync(path.join(PUBLIC_DIR, asJpg))) {
      p.image = asJpg;
      changed = true;
    }
  }
  if (changed) { save(db); console.log('ПОРЦИЯ: пути к изображениям обновлены'); }
}
migrateImages();

/* миграция: у базы, созданной до появления комбо, их ещё нет */
if (!Array.isArray(db.combos)) {
  db.combos = seed().combos;
  save(db);
  console.log('ПОРЦИЯ: добавлены комбо по умолчанию');
}

function publicState() {
  // то, что уходит в браузер: без служебных полей
  return {
    settings: db.settings,
    categories: db.categories,
    modGroups: db.modGroups,
    products: db.products,
    combos: db.combos || [],
    orders: db.orders,
    seq: db.seq,
    serverTime: new Date().toISOString()
  };
}

/* --------------------------------------------------------------------- sse */

const clients = new Set();

function broadcast(type, payload) {
  const chunk = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(chunk); } catch (e) { clients.delete(res); }
  }
}

function broadcastOrder(order) {
  broadcast('order', order);
  broadcast('stats', computeStats());
}

/* ------------------------------------------------------------------ helpers */

const ORDER_FLOW = ['new', 'paid', 'cooking', 'ready', 'done'];

function computeStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todays = db.orders.filter(o => (o.createdAt || '').slice(0, 10) === today && o.status !== 'cancelled');
  const paid = todays.filter(o => o.paid);
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const items = todays.reduce((s, o) => s + o.items.reduce((k, i) => k + i.qty, 0), 0);
  const byHour = {};
  for (const o of todays) {
    const h = new Date(o.createdAt).getHours();
    byHour[h] = (byHour[h] || 0) + o.total;
  }
  const topItems = {};
  for (const o of todays) {
    for (const i of o.items) topItems[i.name] = (topItems[i.name] || 0) + i.qty;
  }
  return {
    ordersToday: todays.length,
    revenueToday: revenue,
    avgCheck: paid.length ? Math.round(revenue / paid.length) : 0,
    itemsToday: items,
    inProgress: db.orders.filter(o => ['paid', 'cooking', 'ready'].includes(o.status)).length,
    newCount: db.orders.filter(o => o.status === 'new').length,
    byHour,
    topItems: Object.entries(topItems).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, qty]) => ({ name, qty }))
  };
}

function itemUnitPrice(product, mods) {
  let sum = product.price;
  for (const m of mods || []) {
    const group = db.modGroups.find(g => g.id === m.groupId);
    const opt = group && group.options.find(o => o.id === m.optionId);
    if (opt) sum += opt.price;
  }
  return sum;
}

// цена позиции: если пришла из комбо — берём цену комбо, иначе цену блюда + модификаторы
function resolveItemPrice(raw, product) {
  const base = raw.basePrice !== undefined ? Number(raw.basePrice) : undefined;
  if (base !== undefined && Number.isFinite(base) && base >= 0) {
    const mods = (raw.mods || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
    return base + mods;
  }
  return itemUnitPrice(product, raw.mods);
}

function normalizeOrderInput(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return { error: 'Корзина пуста' };
  }
  const items = [];
  for (const raw of body.items) {
    const product = db.products.find(p => p.id === raw.productId);
    if (!product) return { error: 'Блюдо не найдено: ' + raw.productId };
    if (!product.available) return { error: `«${product.name}» закончилось — уберите из заказа` };
    const qty = Math.max(1, Math.min(50, parseInt(raw.qty, 10) || 1));
    const mods = Array.isArray(raw.mods) ? raw.mods.slice(0, 20).map(m => ({
      groupId: String(m.groupId), optionId: String(m.optionId),
      name: String(m.name || ''), price: Number(m.price) || 0
    })) : [];
    const linePrice = Number(raw.price);
    items.push({
      productId: product.id,
      name: product.name,
      qty,
      price: Number.isFinite(linePrice) && linePrice > 0 ? linePrice : resolveItemPrice(raw, product),
      mods,
      image: product.image,
      comboId: raw.comboId ? String(raw.comboId) : undefined,
      comment: String(raw.comment || '').slice(0, 200)
    });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  return {
    items,
    subtotal,
    total: subtotal,
    payMethod: ['card', 'counter', 'bonus'].includes(body.payMethod) ? body.payMethod : 'counter',
    guestPhone: String(body.guestPhone || '').slice(0, 40),
    comment: String(body.comment || '').slice(0, 300),
    source: ['kiosk', 'mobile', 'staff'].includes(body.source) ? body.source : 'kiosk',
    etaMinutes: db.settings.avgCookingMinutes || 7
  };
}

function createOrder(payload) {
  db.seq += 1;
  const order = Object.assign({
    id: crypto.randomUUID(),
    number: db.seq,
    createdAt: new Date().toISOString(),
    status: 'new',
    paid: false,
    history: [{ status: 'new', at: new Date().toISOString() }]
  }, payload);
  db.orders.unshift(order);
  save(db);
  broadcastOrder(order);
  return order;
}

function setStatus(order, status, extra) {
  if (!ORDER_FLOW.includes(status)) return { error: 'Неизвестный статус' };
  order.status = status;
  if (status === 'ready') order.readyAt = new Date().toISOString();
  if (status === 'done') order.doneAt = new Date().toISOString();
  Object.assign(order, extra || {});
  order.history = order.history || [];
  order.history.push({ status, at: new Date().toISOString() });
  save(db);
  broadcastOrder(order);
  return order;
}

/* -------------------------------------------------------------- http helpers */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4'
};

function serveFile(res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // запасной вариант: тот же файл в другом формате (старые ссылки из базы)
      const alt = /\.png$/i.test(filePath) ? filePath.replace(/\.png$/i, '.jpg')
        : /\.jpg$/i.test(filePath) ? filePath.replace(/\.jpg$/i, '.png') : null;
      if (alt && fs.existsSync(alt) && fs.statSync(alt).isFile()) return serveFile(res, alt);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — не найдено');
    }
    const ext = path.extname(filePath).toLowerCase();
    // страницы, стили и скрипты не кешируем — правки видны сразу; картинки кешируем надолго
    const noCache = ['.html', '.js', '.css'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': noCache ? 'no-cache, must-revalidate' : 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------------------------------------------- routes */

const routes = {
  'GET /api/health': (req, res) => json(res, 200, { ok: true, uptime: process.uptime() }),

  'GET /api/state': (req, res) => json(res, 200, publicState()),

  'GET /api/stats': (req, res) => json(res, 200, computeStats()),

  'GET /api/events': (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ stats: computeStats() })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) { /* noop */ }
    }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  },

  // Создание заказа: гость присылает корзину, сервер сам считает цены
  'POST /api/orders': async (req, res) => {
    const body = await readBody(req);
    const payload = normalizeOrderInput(body);
    if (payload.error) return json(res, 400, { error: payload.error });

    // имитация эквайринга: карта «проходит» за 900 мс
    if (payload.payMethod === 'card') {
      await new Promise(r => setTimeout(r, 900));
      payload.paid = true;
      payload.status = 'paid';
      payload.history = [{ status: 'new', at: new Date().toISOString() }, { status: 'paid', at: new Date().toISOString() }];
      payload.cardMask = '**** 4821';
      payload.acquirer = 'demo-acquirer';
    }
    const order = createOrder(payload);
    json(res, 201, order);
  },

  'POST /api/orders/:id/status': async (req, res, params) => {
    const body = await readBody(req);
    const order = db.orders.find(o => o.id === params.id || String(o.number) === String(params.id));
    if (!order) return json(res, 404, { error: 'Заказ не найден' });
    if (body.status === 'cancelled') {
      order.status = 'cancelled';
      order.history = (order.history || []).concat([{ status: 'cancelled', at: new Date().toISOString() }]);
      save(db); broadcastOrder(order);
      return json(res, 200, order);
    }
    const updated = setStatus(order, body.status, body.extra);
    if (updated.error) return json(res, 400, updated);
    json(res, 200, updated);
  },

  'POST /api/orders/:id/pay': async (req, res, params) => {
    const body = await readBody(req);
    const order = db.orders.find(o => o.id === params.id || String(o.number) === String(params.id));
    if (!order) return json(res, 404, { error: 'Заказ не найден' });
    if (order.paid) return json(res, 400, { error: 'Заказ уже оплачен' });
    await new Promise(r => setTimeout(r, 700));
    Object.assign(order, { paid: true, status: 'paid', payMethod: body.method || 'card', cardMask: '**** 4821' });
    order.history = (order.history || []).concat([{ status: 'paid', at: new Date().toISOString() }]);
    save(db); broadcastOrder(order);
    json(res, 200, order);
  },

  // ------------------------------- админка: меню -------------------------------
  'POST /api/products': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Нужно название блюда' });
    const categoryId = db.categories.some(c => c.id === body.categoryId)
      ? body.categoryId : db.categories[0].id;
    const product = Object.assign({
      name: '', categoryId, price: 0, desc: '', image: '',
      badge: '', kcal: 0, protein: 0, fat: 0, carbs: 0, mods: [],
      available: true, popular: false
    }, body, {
      id: 'p_' + crypto.randomBytes(4).toString('hex'),
      name,
      categoryId,
      price: Number(body.price) || 0,
      mods: Array.isArray(body.mods) ? body.mods.filter(m => db.modGroups.some(g => g.id === m)) : [],
      available: body.available !== false,
      popular: !!body.popular
    });
    db.products.push(product);
    save(db); broadcast('menu', publicState());
    json(res, 201, product);
  },

  'PATCH /api/products/:id': async (req, res, params) => {
    const body = await readBody(req);
    const product = db.products.find(p => p.id === params.id);
    if (!product) return json(res, 404, { error: 'Блюдо не найдено' });
    Object.assign(product, body, { id: product.id });
    if (body.price !== undefined) product.price = Number(body.price) || 0;
    ['kcal', 'protein', 'fat', 'carbs'].forEach(k => {
      if (body[k] !== undefined) product[k] = Number(body[k]) || 0;
    });
    if (body.name !== undefined) product.name = String(body.name).trim() || product.name;
    if (body.categoryId && !db.categories.some(c => c.id === body.categoryId)) {
      product.categoryId = db.categories[0].id;
    }
    if (body.mods !== undefined) {
      product.mods = Array.isArray(body.mods)
        ? body.mods.filter(m => db.modGroups.some(g => g.id === m)) : [];
    }
    if (body.available !== undefined) product.available = !!body.available;
    if (body.popular !== undefined) product.popular = !!body.popular;
    save(db); broadcast('menu', publicState());
    json(res, 200, product);
  },

  'DELETE /api/products/:id': (req, res, params) => {
    const i = db.products.findIndex(p => p.id === params.id);
    if (i < 0) return json(res, 404, { error: 'Блюдо не найдено' });
    const [removed] = db.products.splice(i, 1);
    save(db); broadcast('menu', publicState());
    json(res, 200, removed);
  },

  'PATCH /api/categories/:id': async (req, res, params) => {
    const body = await readBody(req);
    const cat = db.categories.find(c => c.id === params.id);
    if (!cat) return json(res, 404, { error: 'Категория не найдена' });
    Object.assign(cat, body, { id: cat.id });
    save(db); broadcast('menu', publicState());
    json(res, 200, cat);
  },


  // ------------------------------ картинки: библиотека и загрузка ------------------------------
  'GET /api/images': (req, res) => {
    const list = [];
    const push = (dir, urlPrefix) => {
      try {
        for (const f of fs.readdirSync(dir)) {
          if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
          list.push({ url: urlPrefix + f, name: f.replace(/\.[a-z]+$/i, ''), custom: urlPrefix === '/uploads/' });
        }
      } catch (e) { /* каталога может не быть */ }
    };
    push(path.join(PUBLIC_DIR, 'assets'), '/assets/');
    push(UPLOAD_DIR, '/uploads/');
    json(res, 200, list);
  },

  // приём файла как data-URL (без зависимостей и без multipart)
  'POST /api/upload': async (req, res) => {
    const body = await readBody(req);
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data || '');
    if (!m) return json(res, 400, { error: 'Поддерживаются PNG, JPG и WebP' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return json(res, 413, { error: 'Файл больше 6 МБ' });
    const name = 'img_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    json(res, 201, { url: '/uploads/' + name, size: buf.length });
  },

  // ----------------------------------- категории: создание/порядок -----------------------------------
  'POST /api/categories': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Нужно название категории' });
    const base = 'c_' + name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 24) + '_' + crypto.randomBytes(2).toString('hex');
    const cat = {
      id: body.id ? String(body.id) : base,
      name,
      icon: String(body.icon || '🍽').slice(0, 4)
    };
    if (!body.position || body.position === 'end') db.categories.push(cat);
    else if (body.position === 'start') db.categories.unshift(cat);
    else {
      const i = db.categories.findIndex(c => c.id === body.position);
      if (i >= 0) db.categories.splice(i + 1, 0, cat); else db.categories.push(cat);
    }
    save(db); broadcast('menu', publicState());
    json(res, 201, cat);
  },

  'DELETE /api/categories/:id': (req, res, params) => {
    const i = db.categories.findIndex(c => c.id === params.id);
    if (i < 0) return json(res, 404, { error: 'Категория не найдена' });
    const used = db.products.filter(p => p.categoryId === params.id);
    if (used.length) {
      return json(res, 400, {
        error: `В категории ${used.length} блюд. Сначала перенесите их в другую категорию.`
      });
    }
    const [removed] = db.categories.splice(i, 1);
    save(db); broadcast('menu', publicState());
    json(res, 200, removed);
  },

  'POST /api/categories/reorder': async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body.ids)) return json(res, 400, { error: 'Нужен список ids' });
    const sorted = body.ids.map(id => db.categories.find(c => c.id === id)).filter(Boolean);
    const rest = db.categories.filter(c => !body.ids.includes(c.id));
    db.categories = sorted.concat(rest);
    save(db); broadcast('menu', publicState());
    json(res, 200, db.categories);
  },

  'POST /api/products/reorder': async (req, res) => {
    const body = await readBody(req);
    if (!Array.isArray(body.ids)) return json(res, 400, { error: 'Нужен список ids' });
    const ordered = body.ids.map(id => db.products.find(p => p.id === id)).filter(Boolean);
    const rest = db.products.filter(p => !body.ids.includes(p.id));
    db.products = ordered.concat(rest);
    save(db); broadcast('menu', publicState());
    json(res, 200, { ok: true, count: db.products.length });
  },


  // ------------------------------------------- комбо -------------------------------------------
  'POST /api/combos': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Нужно название комбо' });
    const items = (Array.isArray(body.items) ? body.items : [])
      .filter(i => db.products.some(p => p.id === i.productId))
      .map(i => ({ productId: i.productId, qty: Math.max(1, Math.min(20, parseInt(i.qty, 10) || 1)) }));
    if (!items.length) return json(res, 400, { error: 'Добавьте хотя бы одно блюдо в комбо' });
    const combo = {
      id: 'combo_' + crypto.randomBytes(3).toString('hex'),
      name,
      badge: String(body.badge || '').slice(0, 40),
      desc: String(body.desc || '').slice(0, 200),
      price: Math.max(0, Number(body.price) || 0),
      image: String(body.image || ''),
      enabled: body.enabled !== false,
      items
    };
    db.combos = db.combos || [];
    db.combos.push(combo);
    save(db); broadcast('menu', publicState());
    json(res, 201, combo);
  },

  'PATCH /api/combos/:id': async (req, res, params) => {
    const body = await readBody(req);
    const combo = (db.combos || []).find(c => c.id === params.id);
    if (!combo) return json(res, 404, { error: 'Комбо не найдено' });
    if (body.name !== undefined) combo.name = String(body.name).trim() || combo.name;
    if (body.badge !== undefined) combo.badge = String(body.badge).slice(0, 40);
    if (body.desc !== undefined) combo.desc = String(body.desc).slice(0, 200);
    if (body.price !== undefined) combo.price = Math.max(0, Number(body.price) || 0);
    if (body.image !== undefined) combo.image = String(body.image);
    if (body.enabled !== undefined) combo.enabled = !!body.enabled;
    if (body.items !== undefined) {
      const items = (Array.isArray(body.items) ? body.items : [])
        .filter(i => db.products.some(p => p.id === i.productId))
        .map(i => ({ productId: i.productId, qty: Math.max(1, Math.min(20, parseInt(i.qty, 10) || 1)) }));
      if (!items.length) return json(res, 400, { error: 'В комбо должно остаться хотя бы одно блюдо' });
      combo.items = items;
    }
    save(db); broadcast('menu', publicState());
    json(res, 200, combo);
  },

  'DELETE /api/combos/:id': (req, res, params) => {
    const before = (db.combos || []).length;
    db.combos = (db.combos || []).filter(c => c.id !== params.id);
    if (db.combos.length === before) return json(res, 404, { error: 'Комбо не найдено' });
    save(db); broadcast('menu', publicState());
    json(res, 200, { ok: true });
  },

  // --------------------------------------- модификаторы ---------------------------------------
  'POST /api/modgroups': async (req, res) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Нужно название группы' });
    const group = {
      id: 'g_' + crypto.randomBytes(3).toString('hex'),
      name,
      type: body.type === 'single' ? 'single' : 'multi',
      // required имеет смысл только для одиночного выбора
      required: body.type === 'single' ? body.required !== false : false,
      options: []
    };
    db.modGroups.push(group);
    save(db); broadcast('menu', publicState());
    json(res, 201, group);
  },

  'PATCH /api/modgroups/:id': async (req, res, params) => {
    const body = await readBody(req);
    const group = db.modGroups.find(g => g.id === params.id);
    if (!group) return json(res, 404, { error: 'Группа не найдена' });
    if (body.name !== undefined) group.name = String(body.name).trim() || group.name;
    if (body.type !== undefined) {
      group.type = body.type === 'single' ? 'single' : 'multi';
      if (group.type === 'multi') group.required = false;
    }
    if (body.required !== undefined && group.type === 'single') group.required = !!body.required;
    save(db); broadcast('menu', publicState());
    json(res, 200, group);
  },

  'DELETE /api/modgroups/:id': (req, res, params) => {
    const i = db.modGroups.findIndex(g => g.id === params.id);
    if (i < 0) return json(res, 404, { error: 'Группа не найдена' });
    const [removed] = db.modGroups.splice(i, 1);
    // убираем группу из блюд
    let touched = 0;
    for (const p of db.products) {
      if (Array.isArray(p.mods) && p.mods.includes(removed.id)) {
        p.mods = p.mods.filter(m => m !== removed.id);
        touched++;
      }
    }
    save(db); broadcast('menu', publicState());
    json(res, 200, { ok: true, detachedFrom: touched });
  },

  'POST /api/modgroups/:id/options': async (req, res, params) => {
    const body = await readBody(req);
    const group = db.modGroups.find(g => g.id === params.id);
    if (!group) return json(res, 404, { error: 'Группа не найдена' });
    const name = String(body.name || '').trim();
    if (!name) return json(res, 400, { error: 'Нужно название варианта' });
    const option = {
      id: 'o_' + crypto.randomBytes(3).toString('hex'),
      name,
      price: Math.max(0, Number(body.price) || 0)
    };
    group.options.push(option);
    save(db); broadcast('menu', publicState());
    json(res, 201, option);
  },

  'PATCH /api/modgroups/:id/options/:oid': async (req, res, params) => {
    const body = await readBody(req);
    const group = db.modGroups.find(g => g.id === params.id);
    if (!group) return json(res, 404, { error: 'Группа не найдена' });
    const option = group.options.find(o => o.id === params.oid);
    if (!option) return json(res, 404, { error: 'Вариант не найден' });
    if (body.name !== undefined) option.name = String(body.name).trim() || option.name;
    if (body.price !== undefined) option.price = Math.max(0, Number(body.price) || 0);
    save(db); broadcast('menu', publicState());
    json(res, 200, option);
  },

  'DELETE /api/modgroups/:id/options/:oid': (req, res, params) => {
    const group = db.modGroups.find(g => g.id === params.id);
    if (!group) return json(res, 404, { error: 'Группа не найдена' });
    if (group.type === 'single' && group.options.length <= 1) {
      return json(res, 400, { error: 'В группе с одиночным выбором должен остаться хотя бы один вариант' });
    }
    const before = group.options.length;
    group.options = group.options.filter(o => o.id !== params.oid);
    if (group.options.length === before) return json(res, 404, { error: 'Вариант не найден' });
    save(db); broadcast('menu', publicState());
    json(res, 200, { ok: true });
  },

  'PATCH /api/settings': async (req, res) => {
    const body = await readBody(req);
    Object.assign(db.settings, body);
    save(db); broadcast('menu', publicState());
    json(res, 200, db.settings);
  },

  'POST /api/reset': (req, res) => {
    db = seed();
    save(db);
    broadcast('menu', publicState());
    broadcast('reset', {});
    json(res, 200, { ok: true });
  }
};

/* ----------------------------------------------------------------- dispatch */

function matchRoute(method, pathname) {
  const key = `${method} ${pathname}`;
  if (routes[key]) return { handler: routes[key], params: {} };
  for (const route of Object.keys(routes)) {
    const [m, pattern] = route.split(' ');
    if (m !== method) continue;
    const pParts = pattern.split('/');
    const uParts = pathname.split('/');
    if (pParts.length !== uParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
      else if (pParts[i] !== uParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: routes[route], params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const route = matchRoute(req.method, pathname);
    if (!route) return json(res, 404, { error: 'Неизвестный метод API' });
    try {
      await route.handler(req, res, route.params);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: e.message || 'Внутренняя ошибка' });
    }
    return;
  }

  // загруженные картинки лежат отдельно от public
  if (pathname.startsWith('/uploads/')) {
    const uPath = path.join(UPLOAD_DIR, path.basename(pathname));
    return serveFile(res, uPath);
  }

  // статика
  if (pathname === '/') pathname = '/index.html';
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('403');
  }
  if (pathname.endsWith('/')) return serveFile(res, path.join(PUBLIC_DIR, pathname, 'index.html'));

  // красивые роуты: /kiosk -> kiosk.html, /kitchen -> kitchen.html и т.д.
  if (!path.extname(filePath)) {
    const asHtml = filePath + '.html';
    if (fs.existsSync(asHtml)) return serveFile(res, asHtml);
  }
  serveFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ПОРЦИЯ: сервис заказов запущен на http://0.0.0.0:${PORT}`);
  console.log(`  /kiosk     — киоск самообслуживания`);
  console.log(`  /kitchen   — экран кухни (KDS)`);
  console.log(`  /board     — табло выдачи заказов`);
  console.log(`  /admin     — панель управления`);
  console.log(`  /          — витрина сервиса`);
});
