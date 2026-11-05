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
app.use(express.json({ limit: '500kb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'urban_cart',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  ssl: process.env.DB_HOST?.includes('clever-cloud.com') ? { rejectUnauthorized: false } : undefined,
  enableKeepAlive: true
});

const money = n => Math.round(Number(n) * 100) / 100;
const signToken = user => jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev-only-change-this-secret', { expiresIn: '7d' });

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
function isValidSAnumber(phone){
  const cleaned = String(phone||'').replace(/\s/g,'');
  return /^(?:\+27|27|0)[6-8][0-9]{8}$/.test(cleaned);
}

async function ensureSchema(){
  try{
    // Base tables if missing
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

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_email (email),
        KEY token_idx (token)
      )
    `);

    // PRODUCTS new cols for sale / out of stock
    const prodAlters = [
      "ADD COLUMN sale_price DECIMAL(10,2) NULL",
      "ADD COLUMN on_sale TINYINT(1) DEFAULT 0",
      "ADD COLUMN active TINYINT(1) DEFAULT 1",
      "ADD COLUMN is_active TINYINT(1) DEFAULT 1"
    ];
    for(const c of prodAlters){ try{ await pool.query(`ALTER TABLE products ${c}`);}catch{} }

    // CUSTOMERS new cols
    const custAlters = [
      "ADD COLUMN role VARCHAR(20) DEFAULT 'customer'",
      "ADD COLUMN is_blocked TINYINT(1) DEFAULT 0",
      "ADD COLUMN phone VARCHAR(30) NULL",
      "ADD COLUMN total_spent DECIMAL(10,2) DEFAULT 0",
      "ADD COLUMN blocked_reason TEXT NULL"
    ];
    for(const c of custAlters){ try{ await pool.query(`ALTER TABLE customers ${c}`);}catch{} }

    // ORDERS - FIX ENUM TRUNCATION ROOT CAUSE
    // This is the critical fix for "Data truncated for column 'status' at row 1"
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN status ENUM('pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed') NOT NULL DEFAULT 'pending'`);
      console.log('✅ Fixed orders.status ENUM');
    }catch(e){ console.log('status enum fix note:', e.message); }

    // Make delivery_status flexible VARCHAR to accept human labels like "Order Placed"
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN delivery_status VARCHAR(80) DEFAULT 'Order Placed'`);
    }catch{}

    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN payment_status VARCHAR(30) DEFAULT 'pending'`);
    }catch{}
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN current_location VARCHAR(120) DEFAULT 'Warehouse - Johannesburg'`);
    }catch{}
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN eta VARCHAR(80) DEFAULT '2-3 business days'`);
    }catch{}
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN cancel_reason VARCHAR(500) NULL`);
    }catch{}
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN refund_reason TEXT NULL`);
    }catch{}

    // Add other order cols if missing
    const orderAlters = [
      "ADD COLUMN address_search VARCHAR(255) NULL",
      "ADD COLUMN delivery_address VARCHAR(255) NULL",
      "ADD COLUMN tracking_history JSON NULL",
      "ADD COLUMN full_name VARCHAR(255) NULL",
      "ADD COLUMN refunded_at TIMESTAMP NULL",
      "ADD COLUMN payment_method VARCHAR(50) NULL",
      "ADD COLUMN payfast_id VARCHAR(100) NULL"
    ];
    for(const c of orderAlters){ try{ await pool.query(`ALTER TABLE orders ${c}`);}catch{} }

    console.log('✅ Schema migration done - status ENUM fixed');
  }catch(e){ console.error('Migration error:', e.message); }
}
ensureSchema();

// ===== BASIC =====
app.get('/', (req, res) => { res.send('urban-cart API v4 - full admin + forgot + enum fix'); });
app.get('/api', (req, res) => { res.json({ message: 'API working v4', status: 'ok' }); });
app.get('/api/health', async (_req, res) => { 
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } 
  catch { res.status(503).json({ ok: false }); } 
});

// ===== PRODUCTS PUBLIC =====
app.get('/api/products', async (req, res, next) => { 
  try { 
    const q = String(req.query.q || '').slice(0, 100); 
    const category = Number(req.query.category || 0); 
    const [rows] = await pool.query(
      `SELECT p.id,p.name,p.description,p.price,p.sale_price,p.on_sale,p.stock,p.image_url,p.active,p.is_active,c.name AS category 
       FROM products p 
       LEFT JOIN categories c ON c.id=p.category_id 
       WHERE (p.active=1 OR p.active IS NULL) 
       AND (?=0 OR p.category_id=?) 
       AND (p.name LIKE ? OR p.description LIKE ?) 
       ORDER BY p.id DESC`, 
      [category, category, `%${q}%`, `%${q}%`]
    ); 
    res.json(rows); 
  } catch (e) { next(e); } 
});
app.get('/api/categories', async (_req, res, next) => { 
  try { const [rows] = await pool.query('SELECT id,name FROM categories ORDER BY name'); res.json(rows); } 
  catch (e) { next(e); } 
});

// ===== AUTH + FORGOT PASSWORD =====
app.post('/api/auth/register', async (req, res, next) => { 
  try { 
    const name = String(req.body.name || '').trim(); 
    const email = String(req.body.email || '').trim().toLowerCase(); 
    const password = String(req.body.password || ''); 
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) 
      return res.status(400).json({ error: 'Enter a name, valid email and password of at least 8 characters.' }); 
    const [exists] = await pool.execute('SELECT id FROM customers WHERE email=?',[email]);
    if(exists.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 12); 
    const [result] = await pool.execute('INSERT INTO customers(name,email,password_hash,role) VALUES(?,?,?,?)', [name, email, hash, 'customer']); 
    const user = { id: result.insertId, name, email, role: 'customer' }; 
    res.status(201).json({ token: signToken(user), user }); 
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists.' }); next(e); } 
});
app.post('/api/auth/login', async (req, res, next) => { 
  try { 
    const email = String(req.body.email || '').trim().toLowerCase(); 
    const password = String(req.body.password || ''); 
    const [rows] = await pool.execute('SELECT id,name,email,password_hash,role,is_blocked FROM customers WHERE email=?', [email]); 
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) 
      return res.status(401).json({ error: 'Email or password is incorrect.' }); 
    if(rows[0].is_blocked) return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
    const { password_hash, is_blocked, ...user } = rows[0]; 
    res.json({ token: signToken(user), user }); 
  } catch (e) { next(e); } 
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
app.delete('/api/auth/me', auth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]);
    await conn.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id=?)', [req.user.id]);
    await conn.execute('DELETE FROM orders WHERE customer_id=?', [req.user.id]);
    const [r] = await conn.execute('DELETE FROM customers WHERE id=?', [req.user.id]);
    if(!r.affectedRows){ await conn.rollback(); return res.status(404).json({ error: 'Account not found.' }); }
    await conn.commit();
    res.json({ ok:true });
  }catch(e){ await conn.rollback(); next(e); } finally{ conn.release(); }
});

// FORGOT PASSWORD - NEW
app.post('/api/auth/forgot-password', async (req, res, next) => {
  try{
    const email = String(req.body.email || '').trim().toLowerCase();
    if(!email) return res.status(400).json({ error: 'Email required' });
    const [users] = await pool.execute('SELECT id,email,name FROM customers WHERE email=?', [email]);
    // Always return success to avoid email enumeration, but log token
    if(!users.length){
      console.log(`[FORGOT] No account for ${email} - returning generic success`);
      return res.json({ message: 'If an account exists, a reset link has been sent to your email.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    await pool.execute('INSERT INTO password_resets (email, token, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token=?, expires_at=?', [email, token, expires, token, expires]);
    console.log(`\n===== FORGOT PASSWORD =====\nEmail: ${email}\nToken: ${token}\nReset Link: ${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}\nExpires: ${expires}\n===========================\n`);
    // TODO: plug nodemailer here to actually send email
    res.json({ message: 'Reset link sent to your email (check server logs).', token_hint: process.env.NODE_ENV!=='production' ? token : undefined });
  }catch(e){ next(e); }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try{
    const { token, newPassword } = req.body;
    if(!token || !newPassword || String(newPassword).length < 8) return res.status(400).json({ error: 'Token and password (min 8 chars) required' });
    const [rows] = await pool.execute('SELECT email, expires_at FROM password_resets WHERE token=?', [token]);
    if(!rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
    if(new Date(rows[0].expires_at) < new Date()) return res.status(400).json({ error: 'Token expired, request a new link' });
    const hash = await bcrypt.hash(String(newPassword), 12);
    await pool.execute('UPDATE customers SET password_hash=? WHERE email=?', [hash, rows[0].email]);
    await pool.execute('DELETE FROM password_resets WHERE email=?', [rows[0].email]);
    res.json({ message: 'Password reset successful, you can now sign in.' });
  }catch(e){ next(e); }
});

// ===== CART =====
app.get('/api/cart/mine', auth, async (req, res, next) => {
  try{
    const [rows] = await pool.execute(`
      SELECT c.product_id, c.quantity, p.name, p.description, p.price, p.sale_price, p.on_sale, p.image_url, p.stock, p.is_active, cat.name AS category
      FROM carts c JOIN products p ON p.id=c.product_id LEFT JOIN categories cat ON cat.id=p.category_id
      WHERE c.user_id=? ORDER BY c.updated_at DESC
    `, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});
app.post('/api/cart', auth, async (req, res, next) => {
  try{
    const product_id = Number(req.body.product_id || req.body.id);
    let quantity = Number(req.body.quantity || 1);
    if(!Number.isInteger(product_id) || product_id<1) return res.status(400).json({ error: 'Invalid product.' });
    if(!Number.isInteger(quantity) || quantity<1) quantity=1; if(quantity>99) quantity=99;
    const [prod] = await pool.execute('SELECT id, stock, is_active, active FROM products WHERE id=?', [product_id]);
    if(!prod.length) return res.status(404).json({ error: 'Product not found.' });
    if(prod[0].stock < quantity || prod[0].is_active==0 || prod[0].active==0) return res.status(409).json({ error: 'Out of stock.' });
    await pool.execute(`INSERT INTO carts (user_id, product_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity = LEAST(99, quantity + VALUES(quantity))`, [req.user.id, product_id, quantity]);
    const [rows] = await pool.execute(`SELECT c.product_id, c.quantity, p.name, p.price, p.sale_price, p.on_sale, p.image_url FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.updated_at DESC`, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});
app.patch('/api/cart/:productId', auth, async (req, res, next) => {
  try{
    const productId = Number(req.params.productId); let quantity = Number(req.body.quantity);
    if(!Number.isInteger(productId) || productId<1) return res.status(400).json({ error: 'Invalid product.' });
    if(!Number.isInteger(quantity) || quantity<0) return res.status(400).json({ error: 'Invalid quantity.' });
    if(quantity===0){ await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=?', [req.user.id, productId]); }
    else{ await pool.execute('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=?', [Math.min(99, quantity), req.user.id, productId]); }
    const [rows] = await pool.execute(`SELECT c.product_id, c.quantity, p.name, p.price, p.image_url FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.updated_at DESC`, [req.user.id]);
    res.json(rows);
  }catch(e){ next(e); }
});
app.delete('/api/cart/:productId', auth, async (req, res, next) => {
  try{ await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=?', [req.user.id, Number(req.params.productId)]); res.json({ ok:true }); }catch(e){ next(e); }
});
app.delete('/api/cart', auth, async (req, res, next) => {
  try{ await pool.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]); res.json({ ok:true }); }catch(e){ next(e); }
});

// ===== ORDERS =====
app.post('/api/orders', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { full_name, customer_name, email, phone, address_search, delivery_address, address, city, province, postal_code, items, customer_id } = req.body;
    const finalFullName = (full_name || customer_name || '').trim();
    const finalEmail = (email || '').trim().toLowerCase();
    const finalPhone = (phone || '').trim();
    const finalDeliveryAddress = (delivery_address || address || '').trim();
    const finalAddressSearch = (address_search || '').trim();
    const finalProvince = (province || '').trim().toUpperCase();
    const finalPostalCode = (postal_code || '').trim();
    const finalCity = (city || '').trim() || finalDeliveryAddress;
    if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });
    if (!finalFullName || !finalEmail || !finalPhone || !finalDeliveryAddress || !finalProvince || !finalPostalCode) {
      return res.status(400).json({ error: 'Full Name, Email, SA Phone, Delivery Address, Province, Postal Code required.' });
    }
    if(!isValidSAnumber(finalPhone)) return res.status(400).json({ error: 'Invalid SA phone' });
    if(!/^[0-9]{4}$/.test(finalPostalCode)) return res.status(400).json({ error: 'Postal code 4 digits' });
    const [products] = await conn.query('SELECT * FROM products WHERE id IN (?)', [items.map(i => i.id || i.product_id)]);
    let total = 0;
    for (const item of items) {
      const p = products.find(pr => pr.id == (item.id || item.product_id));
      if (!p) return res.status(400).json({ error: `Product ${item.id || item.product_id} not found` });
      const effectivePrice = (p.on_sale && p.sale_price) ? Number(p.sale_price) : Number(p.price);
      total += effectivePrice * item.quantity;
    }
    let cid = customer_id || null;
    try{
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
      if(token){
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-this-secret');
        cid = decoded.id;
      }
    }catch{}
    if(!cid) return res.status(401).json({ error: 'You must be signed in to place an order.' });
    const initialHistory = JSON.stringify([{
      status: 'Order Placed',
      location: 'Warehouse - Johannesburg',
      time: new Date().toISOString(),
      note: `Order confirmed for ${finalFullName}. Address: ${finalDeliveryAddress}, ${finalProvince} ${finalPostalCode}`
    }]);
    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, customer_name, full_name, email, phone, address, city, province, postal_code, address_search, delivery_address, total, status, payment_status, delivery_status, current_location, eta, tracking_history) 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cid, finalFullName, finalFullName, finalEmail, finalPhone, finalDeliveryAddress, finalCity, finalProvince, finalPostalCode, finalAddressSearch, finalDeliveryAddress, total, 'pending', 'pending', 'Order Placed', 'Warehouse - Johannesburg', '2-3 business days', initialHistory]
    );
    const orderId = orderResult.insertId;
    for (const item of items) {
      const p = products.find(pr => pr.id == (item.id || item.product_id));
      const priceToUse = (p.on_sale && p.sale_price) ? Number(p.sale_price) : Number(p.price);
      await conn.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)', [orderId, item.id || item.product_id, item.quantity, priceToUse]);
      await conn.query('UPDATE products SET stock=stock-? WHERE id=?', [item.quantity, p.id]);
    }
    if(cid){ await conn.query('DELETE FROM carts WHERE user_id=?', [cid]); await conn.query('UPDATE customers SET total_spent = total_spent + ? WHERE id=?',[total, cid]); }
    console.log(`\n===== NEW ORDER #${orderId} - ${finalFullName} - R${total} =====\n`);
    res.json({ orderId, total });
  } catch (err) {
    console.error('ORDER ERROR:', err);
    res.status(500).json({ error: 'Could not create your order: ' + err.message });
  } finally { conn.release(); }
});

app.get('/api/orders/mine', auth, async (req, res, next) => { 
  try { 
    const [rows] = await pool.execute('SELECT id,total,status,payment_status,delivery_status,current_location,eta,tracking_history,delivery_address,province,postal_code,cancel_reason,created_at FROM orders WHERE customer_id=? OR email=? ORDER BY created_at DESC', [req.user.id, req.user.email]); 
    for(const r of rows){
      const [items] = await pool.execute('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [r.id]);
      r.items = items;
      try{ r.tracking_history = typeof r.tracking_history==='string' ? JSON.parse(r.tracking_history) : (r.tracking_history||[]); }catch{ r.tracking_history=[]; }
    }
    res.json(rows); 
  } catch (e) { next(e); } 
});
app.get('/api/orders/my-orders', auth, async (req, res, next) => {
  try{
    const [rows] = await pool.execute('SELECT o.*, oi.quantity, oi.price, p.name, p.image_url, oi.product_id as oi_pid FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id WHERE o.customer_id=? OR o.email=? ORDER BY o.created_at DESC', [req.user.id, req.user.email]);
    const map = {};
    rows.forEach(r=>{
      if(!map[r.id]) map[r.id] = { id:r.id, total:r.total, status:r.status, payment_status:r.payment_status, delivery_status:r.delivery_status, current_location:r.current_location, eta:r.eta, tracking_history:r.tracking_history, delivery_address:r.delivery_address, province:r.province, postal_code:r.postal_code, cancel_reason:r.cancel_reason, created_at:r.created_at, items:[] };
      if(r.quantity) map[r.id].items.push({ product_id:r.oi_pid, name:r.name, image_url:r.image_url, quantity:r.quantity, price:r.price });
    });
    const result = Object.values(map).map(o=>{
      try{ o.tracking_history = typeof o.tracking_history==='string' ? JSON.parse(o.tracking_history) : (o.tracking_history||[]); }catch{ o.tracking_history=[]; }
      return o;
    });
    res.json(result);
  }catch(e){ next(e); }
});

// ===== ADMIN STATS =====
app.get('/api/admin/stats', auth, adminOnly, async (req, res, next)=>{
  try{
    const [todayRows] = await pool.query(`SELECT COALESCE(SUM(total),0) as rev, COUNT(*) as cnt FROM orders WHERE DATE(created_at)=CURDATE() AND status NOT IN ('cancelled','refunded') AND payment_status!='failed'`);
    const [monthRows] = await pool.query(`SELECT COALESCE(SUM(total),0) as rev, COUNT(*) as cnt FROM orders WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND status NOT IN ('cancelled','refunded') AND payment_status!='failed'`);
    const [totalRows] = await pool.query(`SELECT COALESCE(SUM(total),0) as rev, COUNT(*) as cnt FROM orders WHERE status NOT IN ('cancelled','refunded') AND payment_status!='failed'`);
    const [pendingRows] = await pool.query(`SELECT COUNT(*) as cnt FROM orders WHERE status='pending'`);
    const [failedRows] = await pool.query(`SELECT COUNT(*) as cnt FROM orders WHERE payment_status='failed'`);
    const [best] = await pool.query(`
      SELECT p.id, p.name, SUM(oi.quantity) as qty, SUM(oi.quantity*oi.price) as total
      FROM order_items oi JOIN products p ON p.id=oi.product_id
      JOIN orders o ON o.id=oi.order_id
      WHERE o.status NOT IN ('cancelled','refunded')
      GROUP BY p.id, p.name ORDER BY qty DESC LIMIT 10
    `);
    const [recent] = await pool.query(`SELECT id, customer_name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 8`);
    res.json({ today: todayRows[0], month: monthRows[0], total: totalRows[0], pending: pendingRows[0].cnt, failed: failedRows[0].cnt, best, recent });
  }catch(e){ next(e); }
});

app.get('/api/admin/orders', auth, adminOnly, async (_req, res, next) => { 
  try { 
    const [rows] = await pool.query(`SELECT o.*, c.name as customer_name_db, c.is_blocked FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 300`); 
    for(const r of rows){
      const [items] = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [r.id]);
      r.items = items;
      try{ r.tracking_history = typeof r.tracking_history==='string' ? JSON.parse(r.tracking_history) : (r.tracking_history||[]); }catch{ r.tracking_history=[]; }
    }
    res.json(rows); 
  } catch (e) { next(e); } 
});

app.get('/api/admin/users', auth, adminOnly, async (req, res, next)=>{
  try{
    const [rows] = await pool.query(`SELECT id, name, email, phone, role, is_blocked, total_spent, created_at, (SELECT COUNT(*) FROM orders WHERE customer_id=customers.id) as order_count FROM customers ORDER BY created_at DESC LIMIT 500`);
    res.json(rows);
  }catch(e){ next(e); }
});

app.patch('/api/admin/users/:id/block', auth, adminOnly, async (req, res, next)=>{
  try{
    const id = Number(req.params.id);
    const [u] = await pool.query('SELECT is_blocked FROM customers WHERE id=?',[id]);
    if(!u.length) return res.status(404).json({ error: 'User not found' });
    const newVal = u[0].is_blocked ? 0 : 1;
    await pool.execute('UPDATE customers SET is_blocked=? WHERE id=?',[newVal, id]);
    res.json({ ok:true, is_blocked: !!newVal });
  }catch(e){ next(e); }
});
app.patch('/api/admin/users/:id/unblock', auth, adminOnly, async (req, res, next)=>{
  try{
    await pool.execute('UPDATE customers SET is_blocked=0 WHERE id=?',[Number(req.params.id)]);
    res.json({ ok:true });
  }catch(e){ next(e); }
});
app.patch('/api/admin/users/:id/role', auth, adminOnly, async (req, res, next)=>{
  try{
    const { role } = req.body;
    if(!['admin','customer','staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if(Number(req.params.id)===req.user.id && role!=='admin') return res.status(400).json({ error: 'You cannot demote yourself' });
    await pool.execute('UPDATE customers SET role=? WHERE id=?',[role, Number(req.params.id)]);
    res.json({ ok:true, role });
  }catch(e){ next(e); }
});
app.post('/api/admin/users/:id/message', auth, adminOnly, async (req, res, next)=>{
  try{
    console.log(`ADMIN MESSAGE to user ${req.params.id}: ${req.body.message}`);
    res.json({ ok:true });
  }catch(e){ next(e); }
});

// Products admin
app.post('/api/admin/products', auth, adminOnly, async (req, res, next) => { 
  try { 
    let { name, description='', price, sale_price=null, on_sale=false, stock=0, category, category_id, is_active=true, active=1, image_url='' } = req.body || {}; 
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) 
      return res.status(400).json({ error: 'Provide valid name price stock.' }); 
    const [r] = await pool.execute('INSERT INTO products(name,description,price,sale_price,on_sale,stock,category_id,active,is_active,image_url) VALUES(?,?,?,?,?,?,?,?,?,?)', [String(name).trim(), String(description), money(price), sale_price?money(sale_price):null, on_sale?1:0, Number(stock), catId, active?1:0, is_active?1:0, String(image_url)]); 
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.price,p.sale_price,p.on_sale,p.stock,p.image_url,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [r.insertId]);
    res.status(201).json(rows[0]); 
  } catch (e) { next(e); } 
});
app.put('/api/admin/products/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    let { name, description='', price, sale_price=null, on_sale=false, image_url='', stock=0, category, category_id, is_active=true, active } = req.body || {};
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if(active===undefined) active = is_active?1:0;
    const [r] = await pool.execute('UPDATE products SET name=?, description=?, price=?, sale_price=?, on_sale=?, image_url=?, stock=?, category_id=?, active=?, is_active=? WHERE id=?', [String(name).trim(), String(description), money(price), sale_price?money(sale_price):null, on_sale?1:0, String(image_url), Number(stock), catId, active?1:0, is_active?1:0, id]);
    if(!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.price,p.sale_price,p.on_sale,p.image_url,p.stock,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [id]);
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

// FIXED STATUS UPDATE - SAFE ENUM HANDLING
app.patch('/api/admin/orders/:id/status', auth, adminOnly, async (req, res, next) => { 
  try { 
    const allowed = ['pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed']; 
    let status = String(req.body.status || '').toLowerCase().trim();
    if (!allowed.includes(status)) return res.status(400).json({ error: `Invalid status ${status}. Allowed: ${allowed.join(', ')}` }); 
    const id = Number(req.params.id);
    const cancel_reason = req.body.cancel_reason || null;
    const refund_reason = req.body.refund_reason || null;

    const deliveryMap = { pending:'Order Placed', paid:'Paid - Processing', processing:'Processing', shipped:'Shipped', delivered:'Delivered', cancelled:'Cancelled', refunded:'Refunded', refund_pending:'Refund Pending', failed:'Payment Failed' };
    const delivery_status = deliveryMap[status] || status;

    let query = 'UPDATE orders SET status=?, delivery_status=?, payment_status=?';
    const params = [status, delivery_status, status==='failed' ? 'failed' : status==='paid' ? 'paid' : status==='cancelled' ? 'cancelled' : status==='refunded' ? 'refunded' : 'pending'];

    if(status==='cancelled'){
      query += ', cancel_reason=?';
      params.push(cancel_reason);
    }
    if(status==='refunded' || status==='refund_pending'){
      query += ', refund_reason=?, refunded_at=NOW()';
      params.push(refund_reason || req.body.reason || 'Admin refund');
    }
    query += ' WHERE id=?';
    params.push(id);

    // Append to tracking_history
    try{
      const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
      let hist = [];
      try{ hist = typeof existing[0]?.tracking_history==='string' ? JSON.parse(existing[0].tracking_history) : (existing[0]?.tracking_history||[]); }catch{ hist=[]; }
      if(!Array.isArray(hist)) hist=[];
      hist.push({ status: delivery_status, location: 'Admin Panel', time: new Date().toISOString(), note: cancel_reason || refund_reason || `Status changed to ${delivery_status}` });
      // Update tracking separately to avoid JSON issues in main query
      await pool.execute('UPDATE orders SET tracking_history=? WHERE id=?', [JSON.stringify(hist), id]);
    }catch{}

    const [r] = await pool.execute(query, params); 
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' }); 
    res.json({ ok: true, status, delivery_status }); 
  } catch (e) { next(e); } 
});

app.post('/api/admin/orders/:id/refund', auth, adminOnly, async (req, res, next)=>{
  try{
    const id = Number(req.params.id);
    const reason = req.body.reason || req.body.refund_reason || 'Admin issued refund';
    const [order] = await pool.query('SELECT * FROM orders WHERE id=?',[id]);
    if(!order.length) return res.status(404).json({ error: 'Order not found' });
    await pool.execute("UPDATE orders SET status='refunded', payment_status='refunded', delivery_status='Refunded', refund_reason=?, refunded_at=NOW() WHERE id=?",[reason, id]);
    const [items] = await pool.query('SELECT product_id, quantity FROM order_items WHERE order_id=?',[id]);
    for(const it of items){ await pool.execute('UPDATE products SET stock=stock+? WHERE id=?',[it.quantity, it.product_id]); }
    console.log(`REFUND ORDER #${id} - ${reason}`);
    res.json({ ok:true, message:'Refunded and restocked' });
  }catch(e){ next(e); }
});

// FIXED TRACKING UPDATE - NEVER WRITE HUMAN LABEL TO status ENUM
app.put('/api/admin/orders/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    const { delivery_status, current_location, eta, tracking_note, delivery_status_code } = req.body;
    // delivery_status_code is optional safe enum value, if provided use it to update status
    const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
    if(!existing.length) return res.status(404).json({ error: 'Order not found.' });
    let hist = [];
    try{ hist = typeof existing[0].tracking_history==='string' ? JSON.parse(existing[0].tracking_history) : (existing[0].tracking_history||[]); }catch{ hist=[]; }
    if(!Array.isArray(hist)) hist=[];
    const entry = { status: delivery_status || 'Updated', location: current_location || '', eta: eta || '', note: tracking_note || '', time: new Date().toISOString() };
    hist.push(entry);

    // Only update delivery_status and tracking fields, NOT status unless delivery_status_code is provided and valid
    if(delivery_status_code){
      const allowed = ['pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed'];
      if(allowed.includes(String(delivery_status_code).toLowerCase())){
        await pool.execute('UPDATE orders SET delivery_status=?, current_location=?, eta=?, tracking_history=?, status=? WHERE id=?', [delivery_status, current_location, eta, JSON.stringify(hist), String(delivery_status_code).toLowerCase(), id]);
        return res.json({ ok:true, history:hist });
      }
    }
    await pool.execute('UPDATE orders SET delivery_status=?, current_location=?, eta=?, tracking_history=? WHERE id=?', [delivery_status, current_location, eta, JSON.stringify(hist), id]);
    res.json({ ok:true, history:hist });
  }catch(e){ next(e); }
});

// Extra safe tracking-only endpoint for frontend fallback
app.put('/api/admin/orders/:id/tracking', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    const { delivery_status, current_location, eta, tracking_note, status } = req.body;
    const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
    if(!existing.length) return res.status(404).json({ error: 'Order not found.' });
    let hist = [];
    try{ hist = typeof existing[0].tracking_history==='string' ? JSON.parse(existing[0].tracking_history) : (existing[0].tracking_history||[]); }catch{ hist=[]; }
    if(!Array.isArray(hist)) hist=[];
    hist.push({ status: delivery_status || 'Updated', location: current_location || '', eta: eta || '', note: tracking_note || '', time: new Date().toISOString() });
    let sql = 'UPDATE orders SET delivery_status=?, current_location=?, eta=?, tracking_history=?';
    const params = [delivery_status||'Order Placed', current_location||'Warehouse - Johannesburg', eta||'2-3 business days', JSON.stringify(hist)];
    if(status){
      const allowed = ['pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed'];
      if(allowed.includes(String(status).toLowerCase())){
        sql += ', status=?';
        params.push(String(status).toLowerCase());
      }
    }
    sql += ' WHERE id=?';
    params.push(id);
    await pool.execute(sql, params);
    res.json({ ok:true });
  }catch(e){ next(e); }
});

app.get('/api/admin/orders/:id/invoice', auth, adminOnly, async (req, res, next)=>{
  try{
    const id = Number(req.params.id);
    const [orders] = await pool.query('SELECT * FROM orders WHERE id=?',[id]);
    if(!orders.length) return res.status(404).json({ error:'Not found' });
    const [items] = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[id]);
    res.json({ order: orders[0], items });
  }catch(e){ next(e); }
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
    const [rows] = await pool.execute('SELECT id,email,customer_name,full_name,total,status,delivery_address,province FROM orders WHERE id=?', [orderId]); 
    if (!rows.length) return res.status(404).json({ error: 'Order not found.' });
    const order = rows[0]; 
    if (order.status !== 'pending') return res.status(409).json({ error: 'This order is no longer pending.' });
    const merchantId = process.env.PAYFAST_MERCHANT_ID; 
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    if (!merchantId || !merchantKey) return res.status(503).json({ error: 'PayFast is not configured yet.' });
    const clientUrl = (process.env.CLIENT_URL || 'https://urban-cart-ecommerce.vercel.app').replace(/\/$/, '');
    const apiUrl = (process.env.API_URL || 'https://urban-cart-ecommerce.onrender.com').replace(/\/$/, '');
    const fullName = order.full_name || order.customer_name || 'Customer';
    const pfData = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${clientUrl}/?payment=return&order=${order.id}`,
      cancel_url: `${clientUrl}/?payment=cancel&order=${order.id}`,
      notify_url: `${apiUrl}/api/payfast/notify`,
      name_first: String(fullName).split(' ')[0].slice(0,100) || 'Customer',
      name_last: String(fullName).split(' ').slice(1).join(' ').slice(1,100) || 'Customer',
      email_address: order.email,
      m_payment_id: String(order.id),
      amount: Number(order.total).toFixed(2),
      item_name: `Urban Cart Order #${order.id}`.slice(0,100),
      item_description: `Delivery to ${order.delivery_address || ''}, ${order.province || ''}`.slice(0,255)
    };
    pfData.signature = generateSignature(pfData, process.env.PAYFAST_PASSPHRASE);
    res.json({ 
      action: process.env.PAYFAST_SANDBOX === 'true' ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process', 
      fields: pfData 
    });
  } catch (e) { next(e); } 
});

app.post('/api/payfast/notify', express.urlencoded({ extended: false }), async (req, res) => {
  try{
    const data = req.body;
    console.log('PayFast ITN:', data);
    const orderId = Number(data.m_payment_id || data.m_payment_id);
    if(!orderId) return res.status(200).send('No order');
    const status = (data.payment_status||'').toLowerCase();
    if(status==='complete'){
      await pool.execute("UPDATE orders SET payment_status='paid', status='paid', delivery_status='Paid - Processing' WHERE id=?",[orderId]);
    }else if(status==='failed'){
      await pool.execute("UPDATE orders SET payment_status='failed' WHERE id=?",[orderId]);
    }else if(status==='cancelled'){
      await pool.execute("UPDATE orders SET payment_status='cancelled' WHERE id=?",[orderId]);
    }
    res.status(200).send('OK');
  }catch(e){
    console.error('ITN error', e);
    res.status(200).send('Error but OK');
  }
});

app.use((err, _req, res, _next) => { 
  console.error(err); 
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ECONNREFUSED') 
    return res.status(503).json({ error: 'Database unavailable.' }); 
  res.status(500).json({ error: 'Unexpected server error: ' + err.message }); 
});

const port = Number(process.env.PORT || 4000); 
app.listen(port, () => console.log(`Urban Cart API v4 FIXED listening on http://localhost:${port}`));