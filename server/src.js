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

async function getCategoryId(nameOrId){
  if(!nameOrId) return null;
  if(Number.isInteger(Number(nameOrId)) && Number(nameOrId)>0) return Number(nameOrId);
  const [rows] = await pool.execute('SELECT id FROM categories WHERE name=? LIMIT 1', [String(nameOrId).trim()]);
  return rows.length ? rows[0].id : null;
}

// AUTO-CREATE CARTS TABLE ON STARTUP
async function ensureCartsTable(){
  try{
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS carts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_product (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    console.log('Carts table ready');
  }catch(e){ console.error('Carts table error:', e.message); }
}
ensureCartsTable();

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

// ===== DELETE OWN ACCOUNT =====
app.delete('/api/auth/me', auth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]);
    await conn.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id=?)', [req.user.id]);
    await conn.execute('DELETE FROM orders WHERE customer_id=?', [req.user.id]);
    await conn.execute('DELETE FROM orders WHERE email=? AND customer_id IS NULL', [req.user.email]);
    const [r] = await conn.execute('DELETE FROM customers WHERE id=?', [req.user.id]);
    if(!r.affectedRows){ await conn.rollback(); return res.status(404).json({ error: 'Account not found.' }); }
    await conn.commit();
    res.json({ ok:true, message:'Account deleted' });
  }catch(e){ await conn.rollback(); next(e); } finally{ conn.release(); }
});

// ===== CARTS - PERSISTENT IN DATABASE =====
app.get('/api/cart/mine', auth, async (req, res, next) => {
  try{
    const [rows] = await pool.execute(`
      SELECT c.product_id, c.quantity, p.name, p.description, p.price, p.image_url, p.stock, cat.name AS category
      FROM carts c
      JOIN products p ON p.id=c.product_id
      LEFT JOIN categories cat ON cat.id=p.category_id
      WHERE c.user_id=?
      ORDER BY c.updated_at DESC
    `, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});

app.post('/api/cart', auth, async (req, res, next) => {
  try{
    const product_id = Number(req.body.product_id || req.body.id);
    let quantity = Number(req.body.quantity || 1);
    if(!Number.isInteger(product_id) || product_id<1) return res.status(400).json({ error: 'Invalid product.' });
    if(!Number.isInteger(quantity) || quantity<1) quantity=1;
    if(quantity>99) quantity=99;
    const [prod] = await pool.execute('SELECT id, stock FROM products WHERE id=?', [product_id]);
    if(!prod.length) return res.status(404).json({ error: 'Product not found.' });
    if(prod[0].stock < quantity) return res.status(409).json({ error: 'Not enough stock.' });
    await pool.execute(`
      INSERT INTO carts (user_id, product_id, quantity) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE quantity = LEAST(99, quantity + VALUES(quantity))
    `, [req.user.id, product_id, quantity]);
    const [rows] = await pool.execute(`
      SELECT c.product_id, c.quantity, p.name, p.price, p.image_url FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.updated_at DESC
    `, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});

app.patch('/api/cart/:productId', auth, async (req, res, next) => {
  try{
    const productId = Number(req.params.productId);
    let quantity = Number(req.body.quantity);
    if(!Number.isInteger(productId) || productId<1) return res.status(400).json({ error: 'Invalid product.' });
    if(!Number.isInteger(quantity) || quantity<0) return res.status(400).json({ error: 'Invalid quantity.' });
    if(quantity===0){
      await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=?', [req.user.id, productId]);
    }else{
      await pool.execute('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=?', [Math.min(99, quantity), req.user.id, productId]);
    }
    const [rows] = await pool.execute(`
      SELECT c.product_id, c.quantity, p.name, p.price, p.image_url FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.updated_at DESC
    `, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});

app.delete('/api/cart/:productId', auth, async (req, res, next) => {
  try{
    const productId = Number(req.params.productId);
    await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=?', [req.user.id, productId]);
    res.json({ ok:true });
  }catch(e){ next(e); }
});

app.delete('/api/cart', auth, async (req, res, next) => {
  try{
    await pool.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]);
    res.json({ ok:true });
  }catch(e){ next(e); }
});

app.post('/api/orders', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { customer_name, email, phone, address, city, province, postal_code, items, customer_id } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const [products] = await conn.query('SELECT * FROM products WHERE id IN (?)', [items.map(i => i.id)]);
    let total = 0;
    for (const item of items) {
      const p = products.find(pr => pr.id == item.id);
      if (!p) return res.status(400).json({ error: `Product ${item.id} not found` });
      total += Number(p.price) * item.quantity;
    }
    // Try to get customer_id from JWT if not provided
    let cid = customer_id || null;
    try{
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
      if(token){
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-this-secret');
        cid = decoded.id;
      }
    }catch{}
    const [orderResult] = await conn.query(
      'INSERT INTO orders (customer_id, customer_name, email, phone, address, city, province, postal_code, total, status) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [cid, customer_name, email, phone, address, city, province, postal_code, total, 'pending']
    );
    const orderId = orderResult.insertId;
    for (const item of items) {
      const p = products.find(pr => pr.id == item.id);
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)',
        [orderId, item.id, item.quantity, p.price]
      );
      await conn.query('UPDATE products SET stock=stock-? WHERE id=?', [item.quantity, item.id]);
    }
    // Clear DB cart after successful order if user logged in
    if(cid){
      await conn.query('DELETE FROM carts WHERE user_id=?', [cid]);
    }
    res.json({ orderId, total });
  } catch (err) {
    console.error('ORDER ERROR:', err);
    res.status(500).json({ error: 'Could not create your order: ' + err.message });
  } finally {
    conn.release();
  }
});

app.get('/api/orders/mine', auth, async (req, res, next) => { 
  try { 
    const [rows] = await pool.execute('SELECT id,total,status,created_at FROM orders WHERE customer_id=? OR email=? ORDER BY created_at DESC', [req.user.id, req.user.email]); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.get('/api/admin/orders', auth, adminOnly, async (_req, res, next) => { 
  try { 
    const [rows] = await pool.query('SELECT id,customer_id,customer_name,email,total,status,city,created_at FROM orders ORDER BY created_at DESC LIMIT 200'); 
    res.json(rows); 
  } catch (e) { next(e); } 
});

// ===== ADMIN PRODUCT CRUD - FULL =====
app.post('/api/admin/products', auth, adminOnly, async (req, res, next) => { 
  try { 
    let { name, description='', price, image_url='', stock=0, category, category_id } = req.body || {}; 
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) 
      return res.status(400).json({ error: 'Provide a name, valid price and non-negative whole-number stock.' }); 
    const [r] = await pool.execute('INSERT INTO products(name,description,price,image_url,stock,category_id,active) VALUES(?,?,?,?,?,?,1)', [String(name).trim(), String(description), money(price), String(image_url), Number(stock), catId]); 
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.price,p.image_url,p.stock,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [r.insertId]);
    res.status(201).json(rows[0]); 
  } catch (e) { next(e); } 
});

app.put('/api/admin/products/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    let { name, description='', price, image_url='', stock=0, category, category_id } = req.body || {};
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0) 
      return res.status(400).json({ error: 'Provide valid name and price.' });
    const [r] = await pool.execute('UPDATE products SET name=?, description=?, price=?, image_url=?, stock=?, category_id=? WHERE id=?', [String(name).trim(), String(description), money(price), String(image_url), Number(stock), catId, id]);
    if(!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.price,p.image_url,p.stock,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [id]);
    res.json(rows[0]);
  }catch(e){ next(e); }
});

app.delete('/api/admin/products/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    const [r] = await pool.execute('DELETE FROM products WHERE id=?', [id]);
    if(!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok:true, id });
  }catch(e){ next(e); }
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
    const clientUrl = (process.env.CLIENT_URL || 'https://urban-cart-ecommerce.vercel.app').replace(/\/$/, '');
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