import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({ 
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://urban-cart-ecommerce.vercel.app',
    'https://urban-cart-ecommerce-gontsewamodise02-7329.vercel.app',
    /.*\.vercel\.app$/
  ], 
  credentials: true 
}));

app.use(express.json({ limit: '100kb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'urban_cart',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  ssl: { rejectUnauthorized: false },
  enableKeepAlive: true
});

const money = n => Math.round(Number(n) * 100) / 100;
const signToken = user => jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-only-change-this-secret', { expiresIn: '2h' });

function auth(req, res, next) { 
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); 
  try { 
    if (!token) throw new Error('missing'); 
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-this-secret'); 
    next(); 
  } catch { 
    res.status(401).json({ error: 'Please sign in again.' }); 
  } 
}

function adminOnly(req, res, next) { 
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' }); 
  next(); 
}

app.get('/', (req, res) => {
  res.send('urban-cart API is running - use /api/products');
});

app.get('/api', (req, res) => {
  res.json({ message: 'API working', status: 'ok' });
});

app.get('/api/health', async (_req, res) => { 
  try { 
    await pool.query('SELECT 1'); 
    res.json({ ok: true, database: 'connected' }); 
  } catch { 
    res.status(503).json({ ok: false, database: 'unavailable' }); 
  } 
});

app.get('/api/products', async (req, res, next) => { 
  try { 
    const q = String(req.query.q || '').slice(0, 100); 
    const category = Number(req.query.category || 0); 
    const [rows] = await pool.query(
      `SELECT p.id,p.name,p.description,p.price,p.image_url,p.stock,c.name AS category 
       FROM products p 
       LEFT JOIN categories c ON c.id=p.category_id 
       WHERE (p.active IS NULL OR p.active=1) 
       AND (?=0 OR p.category_id=?) 
       AND (p.name LIKE ? OR p.description LIKE ?) 
       ORDER BY p.id DESC`, 
      [category, category, `%${q}%`, `%${q}%`]
    ); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.get('/api/categories', async (_req, res, next) => { 
  try { 
    const [rows] = await pool.query('SELECT id,name FROM categories ORDER BY name'); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.post('/api/auth/register', async (req, res, next) => { 
  try { 
    const name = String(req.body.name || '').trim(); 
    const email = String(req.body.email || '').trim().toLowerCase(); 
    const password = String(req.body.password || ''); 
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) 
      return res.status(400).json({ error: 'Enter a name, valid email and password of at least 8 characters.' }); 
    const hash = await bcrypt.hash(password, 12); 
    const [result] = await pool.execute('INSERT INTO customers(name,email,password_hash) VALUES(?,?,?)', [name, email, hash]); 
    const user = { id: result.insertId, name, email, role: 'customer' }; 
    res.status(201).json({ token: signToken(user), user }); 
  } catch (e) { 
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists.' }); 
    next(e); 
  } 
});

app.post('/api/auth/login', async (req, res, next) => { 
  try { 
    const email = String(req.body.email || '').trim().toLowerCase(); 
    const password = String(req.body.password || ''); 
    const [rows] = await pool.execute('SELECT id,name,email,password_hash,role FROM customers WHERE email=?', [email]); 
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) 
      return res.status(401).json({ error: 'Email or password is incorrect.' }); 
    const { password_hash, ...user } = rows[0]; 
    res.json({ token: signToken(user), user }); 
  } catch (e) { next(e); } 
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.post('/api/orders', async (req, res, next) => {
  const { customer_name, email, phone, address, city, province, postal_code, items } = req.body || {};
  if (![customer_name,email,phone,address,city,province,postal_code].every(v => typeof v === 'string' && v.trim()) || !Array.isArray(items) || items.length < 1 || items.length > 50) 
    return res.status(400).json({ error: 'Complete all delivery details and add at least one item.' });
  
  const quantities = new Map(); 
  for (const item of items) { 
    const id = Number(item.id), qty = Number(item.quantity); 
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1 || qty > 99) 
      return res.status(400).json({ error: 'One or more cart items are invalid.' }); 
    quantities.set(id, (quantities.get(id) || 0) + qty); 
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction(); 
    const normalizedItems = []; 
    let total = 0;
    for (const [id, quantity] of quantities) { 
      const [rows] = await conn.execute('SELECT id,name,price,stock FROM products WHERE id=? FOR UPDATE', [id]); 
      if (!rows.length) throw Object.assign(new Error('A product is no longer available.'), { status: 400 }); 
      const p = rows[0]; 
      if (p.stock < quantity) throw Object.assign(new Error(`Not enough stock for ${p.name}.`), { status: 409 }); 
      total += Number(p.price) * quantity; 
      normalizedItems.push({ ...p, quantity }); 
    }
    total = money(total); 
    const [order] = await conn.execute(
      'INSERT INTO orders(customer_id,customer_name,email,phone,address,city,province,postal_code,total,status) VALUES(?,?,?,?,?,?,?,?,?,"pending")', 
      [req.user?.id || null, customer_name.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(), city.trim(), province.trim(), postal_code.trim(), total]
    );
    for (const p of normalizedItems) { 
      await conn.execute('INSERT INTO order_items(order_id,product_id,quantity,price) VALUES(?,?,?,?)', [order.insertId, p.id, p.quantity, p.price]); 
      await conn.execute('UPDATE products SET stock=stock-? WHERE id=?', [p.quantity, p.id]); 
    }
    await conn.commit(); 
    res.status(201).json({ orderId: order.insertId, total, currency: 'ZAR', message: 'Order created. Continue to PayFast to complete payment.' });
  } catch (e) { 
    await conn.rollback(); 
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not create your order.' }); 
  } finally { conn.release(); }
});

app.get('/api/orders/mine', auth, async (req, res, next) => { 
  try { 
    const [rows] = await pool.execute('SELECT id,total,status,created_at FROM orders WHERE customer_id=? OR email=? ORDER BY created_at DESC', [req.user.id, req.user.email]); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.get('/api/admin/orders', auth, adminOnly, async (_req, res, next) => { 
  try { 
    const [rows] = await pool.query('SELECT id,customer_name,email,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 200'); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.post('/api/admin/products', auth, adminOnly, async (req, res, next) => { 
  try { 
    const { name, description='', price, image_url='', stock=0, category_id=null } = req.body || {}; 
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) 
      return res.status(400).json({ error: 'Provide a name, valid price and non-negative whole-number stock.' }); 
    const [r] = await pool.execute('INSERT INTO products(name,description,price,image_url,stock,category_id) VALUES(?,?,?,?,?,?)', [String(name).trim(), String(description), money(price), String(image_url), Number(stock), category_id ? Number(category_id) : null]); 
    res.status(201).json({ id: r.insertId }); 
  } catch (e) { next(e); } 
});

app.patch('/api/admin/orders/:id/status', auth, adminOnly, async (req, res, next) => { 
  try { 
    const allowed = ['pending','paid','processing','shipped','cancelled']; 
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' }); 
    const [r] = await pool.execute('UPDATE orders SET status=? WHERE id=?', [req.body.status, Number(req.params.id)]); 
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' }); 
    res.json({ ok: true }); 
  } catch (e) { next(e); } 
});

// ---- PAYFAST FIXED ----
function generateSignature(data, passphrase) {
  let pfOutput = '';
  for (let key in data) {
    if (data.hasOwnProperty(key) && data[key] !== '' && data[key] !== null && data[key] !== undefined) {
      pfOutput += `${key}=${encodeURIComponent(String(data[key]).trim()).replace(/%20/g, '+')}&`;
    }
  }
  let getString = pfOutput.slice(0, -1);
  if (passphrase && String(passphrase).trim() !== '') {
    getString += `&passphrase=${encodeURIComponent(String(passphrase).trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(getString).digest('hex');
}

app.post('/api/payfast/checkout', async (req, res, next) => { 
  try {
    const orderId = Number(req.body.orderId); 
    if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'Invalid order.' });
    
    const [rows] = await pool.execute('SELECT id,email,customer_name,total,status FROM orders WHERE id=?', [orderId]); 
    if (!rows.length) return res.status(404).json({ error: 'Order not found.' });
    
    const order = rows[0]; 
    if (order.status !== 'pending') return res.status(409).json({ error: 'This order is no longer pending.' });

    const merchantId = process.env.PAYFAST_MERCHANT_ID; 
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    if (!merchantId || !merchantKey) return res.status(503).json({ error: 'PayFast is not configured yet.' });

    const clientUrl = (process.env.CLIENT_URL || process.env.STORE_URL || 'https://urban-cart-ecommerce.vercel.app').replace(/\/$/, '');
    const apiUrl = (process.env.API_URL || 'https://urban-cart-ecommerce.onrender.com').replace(/\/$/, '');

    const pfData = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${clientUrl}/?payment=return&order=${order.id}`,
      cancel_url: `${clientUrl}/?payment=cancel&order=${order.id}`,
      notify_url: `${apiUrl}/api/payfast/notify`,
      name_first: String(order.customer_name).split(' ')[0].slice(0,100) || 'Customer',
      name_last: String(order.customer_name).split(' ').slice(1).join(' ').slice(0,100) || 'Customer',
      email_address: order.email,
      m_payment_id: String(order.id),
      amount: Number(order.total).toFixed(2),
      item_name: `Urban Cart Order #${order.id}`.slice(0,100)
    };

    pfData.signature = generateSignature(pfData, process.env.PAYFAST_PASSPHRASE);

    res.json({ 
      action: process.env.PAYFAST_SANDBOX === 'true' ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process', 
      fields: pfData 
    });
  } catch (e) { next(e); } 
});

app.post('/api/payfast/notify', express.urlencoded({ extended: false }), async (_req, res) => {
  res.status(501).send('ITN verification must be implemented before live payments.');
});

app.use((err, _req, res, _next) => { 
  console.error(err); 
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ECONNREFUSED') 
    return res.status(503).json({ error: 'Database unavailable. Check MySQL is running and server/.env is correct.' }); 
  res.status(500).json({ error: 'Unexpected server error.' }); 
});

const port = Number(process.env.PORT || 4000); 
app.listen(port, () => console.log(`Urban Cart API listening on http://localhost:${port}`));