import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ 
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://urban-cart-ecommerce.vercel.app',
    'https://urban-cart-ecommerce-one.vercel.app', 
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
  connectionLimit: 2,
  decimalNumbers: true,
  ssl: process.env.DB_HOST?.includes('clever-cloud.com') ? { rejectUnauthorized: false } : undefined,
  enableKeepAlive: true
});

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://urban-cart-ecommerce.vercel.app').replace(/\/$/, '');
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM_EMAIL = process.env.FROM_EMAIL || 'Urban Cart <onboarding@resend.dev>';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'gontsewamodise01@gmail.com').trim();

const money = n => Math.round(Number(n) * 100) / 100;

function formatUnitLabel(it){
  if(!it || !it.unit || it.unit === 'none') return '';
  if(it.unit === 'size') return ` (Size: ${it.selected_size || it.size || ''})`.trim() === '(Size:)' ? '' : ` (Size: ${it.selected_size || it.size})`;
  const val = Number(it.unit_value || 0);
  if(!val) return ` (${it.unit})`;
  return ` (${it.unit_value}${it.unit} each - Total: ${it.quantity * val}${it.unit})`;
}

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

function isValidSAnumber(phone) {
    const cleaned = String(phone || '').replace(/\s/g, '');

    return /^(?:\+27|27|0)[6-8][0-9]{8}$/.test(cleaned);
}

// ===== PHONE OTP =====
function generateOTP(){ return Math.floor(100000 + Math.random()*900000).toString(); }

app.post('/api/auth/send-phone-otp', async (req, res, next)=>{
  try{
    let phone = String(req.body.phone || '').replace(/\s/g,'').trim();
    if(!isValidSAnumber(phone)) return res.status(400).json({ error: 'Invalid SA phone number. Use 0821234567 or +27821234567' });
    
    // Normalize to 0 format
    if(phone.startsWith('+27')) phone = '0' + phone.slice(3);
    if(phone.startsWith('27')) phone = '0' + phone.slice(2);
    
    const otp = generateOTP();
    const expires = new Date(Date.now() + 5*60*1000); // 5 min
    
    await pool.execute('DELETE FROM phone_otps WHERE phone=?', [phone]);
    await pool.execute('INSERT INTO phone_otps (phone, otp, expires_at) VALUES (?,?,?)', [phone, otp, expires]);
    
    console.log(`📱 OTP FOR ${phone}: ${otp} (expires 5min)`);
    
    // === FOR NOW - FREE METHOD (log + return for testing) ===
    // TODO: Replace with real SMS via Africa's Talking / Twilio
    // Example with Africa's Talking:
    // await sendSMSviaAfricaTalking(phone, `Your Urban Cart OTP is ${otp}. Valid for 5 minutes.`);
    
    // For development: send OTP via email to admin so you see it
    try{
      await sendViaResend({
        to: ADMIN_EMAIL,
        subject: `📱 OTP ${otp} for ${phone}`,
        html: `<h2>OTP ${otp}</h2><p>Phone ${phone} requested OTP at checkout. Expires in 5 min.</p><p>Order flow: customer must enter this OTP to confirm phone.</p>`
      });
    }catch{}
    
    // In production, DON'T return OTP. For testing, return it so you can test without SMS
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({ 
      message: 'OTP sent to your phone (check SMS)',
      // Remove this in production when you have real SMS:
      ...(isDev ? { debug_otp: otp, note: 'Remove debug_otp in production' } : {})
    });
  }catch(e){ next(e); }
});

app.post('/api/auth/verify-phone-otp', async (req, res, next)=>{
  try{
    let phone = String(req.body.phone || '').replace(/\s/g,'').trim();
    const otp = String(req.body.otp || '').trim();
    if(phone.startsWith('+27')) phone = '0' + phone.slice(3);
    if(phone.startsWith('27')) phone = '0' + phone.slice(2);
    
    if(!otp || otp.length!==6) return res.status(400).json({ error: 'Enter 6-digit OTP' });
    
    const [rows] = await pool.execute('SELECT * FROM phone_otps WHERE phone=? AND otp=? ORDER BY created_at DESC LIMIT 1', [phone, otp]);
    if(!rows.length) return res.status(400).json({ error: 'Invalid OTP' });
    
    const record = rows[0];
    if(new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired, request new one' });
    
    await pool.execute('UPDATE phone_otps SET verified=1 WHERE id=?', [record.id]);
    
    // Create a verified token valid for 30 min
    const verifiedToken = jwt.sign({ phone, verified: true }, process.env.JWT_SECRET || 'dev-only', { expiresIn: '30m' });
    
    res.json({ ok:true, message:'Phone verified', phoneVerifiedToken: verifiedToken });
  }catch(e){ next(e); }
});

// ================= EMAIL DELIVERY NOTE =================
async function generateDeliveryPdfBuffer(order, items){
  return new Promise((resolve, reject)=>{
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', c=>chunks.push(c));
    doc.on('end', ()=> resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).font('Helvetica-Bold').text('URBAN CART');
    doc.fontSize(8).font('Helvetica').text('Ellisras - Lephalale - SA\nPayFast Secure');
    const headerRight = `DELIVERY\n#${order.id}\n${new Date().toISOString().slice(0,10)}\n${(order.delivery_status||'').toUpperCase()} / ${(order.payment_status||order.status||'').toUpperCase()}`;
    doc.fontSize(8).text(headerRight, 400, 40, { align: 'right', width: 155 });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);
    const topY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').text('BILL TO:', 40, topY);
    doc.font('Helvetica').fontSize(9).text(
      `${order.customer_name || order.full_name || 'Customer'}\n${order.email||''}\n${order.phone||''}\n${order.delivery_address || order.address || ''}\n${order.province||''}, ${order.postal_code||''}`,
      40, topY+12, { width: 240 }
    );
    doc.font('Helvetica-Bold').text('DELIVERY:', 320, topY);
    doc.font('Helvetica').fontSize(9).text(
      `${order.delivery_address || order.address || ''}, ${order.province||''}\nCourier: ${order.current_location || 'Warehouse - Lephalale'}\nETA: ${order.eta || '1-2 business days'}`,
      320, topY+12, { width: 235 }
    );
    doc.y = Math.max(doc.y, topY+70);
    doc.moveDown(1);
    const tableTop = doc.y;
    const cols = { item: 40, qty: 320, unit: 380, total: 470 };
    doc.rect(40, tableTop, 515, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', 45, tableTop+6, { width: 270 });
    doc.text('Qty', cols.qty, tableTop+6, { width: 50, align: 'center' });
    doc.text('Unit', cols.unit, tableTop+6, { width: 80, align: 'right' });
    doc.text('Total', cols.total, tableTop+6, { width: 80, align: 'right' });
    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    for(const it of items){
      const name = (it.name || `Product #${it.product_id}`) + formatUnitLabel(it);
      const lineH = 20;
      if(y+lineH> 750){ doc.addPage(); y=40; }
      doc.rect(40, y, 515, lineH).stroke();
      doc.text(name.slice(0,60), 45, y+6, { width: 270 });
      doc.text(String(it.quantity), cols.qty, y+6, { width: 50, align: 'center' });
      doc.text(`R ${Number(it.price).toFixed(2)}`, cols.unit, y+6, { width: 80, align: 'right' });
      doc.text(`R ${(Number(it.price)*Number(it.quantity)).toFixed(2)}`, cols.total, y+6, { width: 80, align: 'right' });
      y+=lineH;
    }
    doc.rect(40, y, 515, 20).stroke();
    doc.font('Helvetica-Bold').text('TOTAL', cols.unit, y+6, { width: 80, align: 'right' });
    doc.text(`R ${Number(order.total).toFixed(2)}`, cols.total, y+6, { width: 80, align: 'right' });
    y+=50;
    doc.rect(40, y, 515, 45).dash(4, { space: 4 }).stroke();
    doc.undash();
    doc.font('Helvetica-Bold').fontSize(9).text('DELIVERY NOTE:', 50, y+8);
    doc.font('Helvetica').fontSize(9).text(`Order #${order.id} - Handle with care. Customer phone: ${order.phone}. Signature required.`, 50, y+20, { width: 495 });
    y+=70;
    doc.fontSize(7).font('Helvetica').text(`Generated by Urban Cart Admin - ${new Date().toLocaleString()}`, 40, y);
    doc.end();
  });
}

async function sendViaResend({ to, subject, text, html, pdfBuffer, pdfName }){
  if(!RESEND_API_KEY) return null;
  try{
    const payload = { from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, html: html || text || '', text: text || '' };
    if(pdfBuffer){ payload.attachments = [{ filename: pdfName || 'delivery-note.pdf', content: pdfBuffer.toString('base64') }]; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if(!r.ok) throw new Error(JSON.stringify(data));
    return { ok: true, id: data.id };
  }catch(e){ return { ok: false, error: e.message }; }
}
async function sendEmailResend({ to, subject, html }){
  return sendViaResend({ to, subject, html });
}

function getTransporter(){
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if(!user || !pass) return null;
  return nodemailer.createTransport({
    host, port,
    secure: port===465,
    auth: { user, pass }
  });
  }

async function sendDeliveryNoteEmail(order, items){
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
  if(!adminEmail){
    console.log('Email not configured - set ADMIN_EMAIL');
    return { ok:false, reason:'not_configured' };
  }
  try{
    const buffer = await generateDeliveryPdfBuffer(order, items);
    // Text version (fallback)
    const itemListText = items.map(i => `• ${i.name || 'Product'} x${i.quantity} - R${(Number(i.price)*Number(i.quantity)).toFixed(2)}`).join('\n');
    const text = `Order #${order.id} - PAID\nCustomer: ${order.customer_name || order.full_name}\nEmail: ${order.email}\nPhone: ${order.phone}\nAddress: ${order.delivery_address || order.address}, ${order.province} ${order.postal_code}\n\nItems:\n${itemListText}\nTOTAL PAID: R${Number(order.total).toFixed(2)}\nStatus: PAID - Ready to Ship\nLocation: ${order.current_location}\nETA: ${order.eta}`;
    // Table rows for HTML
    const itemRows = items.map(i => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;color:#121212">${i.name || 'Product'}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:center;color:#121212">${i.quantity}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:right;color:#121212">R${Number(i.price).toFixed(2)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:right;font-weight:700;color:#121212">R${(Number(i.price)*Number(i.quantity)).toFixed(2)}</td>
      </tr>`).join('');
    const subject = `✅ PAID - DELIVERY NOTE #${order.id} - R${Number(order.total).toFixed(2)} - ${order.customer_name || order.full_name} - Ready to Ship`;
    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F1EB;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EB;padding:24px 0">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);max-width:95%">
        <!-- HEADER -->
        <tr><td style="background:#121212;padding:24px 32px">
          <table width="100%"><tr>
            <td>
              <div style="color:#E9D9BF;font-weight:900;font-size:20px;letter-spacing:2px;line-height:1">URBAN CART</div>
              <div style="color:#E9D9BF;font-size:10px;opacity:0.6;letter-spacing:2px;margin-top:4px">LEPHALALE • ELLISRAS • SOUTH AFRICA</div>
            </td>
            <td align="right">
              <div style="background:#f0fdf4;color:#16a34a;font-weight:800;font-size:11px;padding:8px 14px;border-radius:20px;display:inline-block;letter-spacing:0.5px">✅ PAID - READY TO SHIP</div>
            </td>
          </tr></table>
        </td></tr>
        <!-- ORDER META -->
        <tr><td style="padding:28px 32px 0 32px">
          <table width="100%"><tr>
            <td width="50%" style="vertical-align:top;padding-right:16px">
              <div style="font-size:10px;color:#999;letter-spacing:1.5px;font-weight:700;margin-bottom:10px">BILL TO</div>
              <div style="font-size:13px;line-height:21px;color:#121212">
                <b style="font-size:14px">${order.customer_name || order.full_name}</b><br/>
                ${order.email}<br/>
                ${order.phone}<br/>
                <span style="color:#57534E">${order.delivery_address || order.address}<br/>${order.province} ${order.postal_code}${order.city ? ` • ${order.city}` : ''}</span>
                ${order.address_search ? `<br/><span style="font-size:11px;color:#999">📍 ${order.address_search}</span>` : ''}
              </div>
            </td>
            <td width="50%" style="vertical-align:top">
              <div style="font-size:10px;color:#999;letter-spacing:1.5px;font-weight:700;margin-bottom:10px">SHIPMENT DETAILS</div>
              <div style="font-size:13px;line-height:21px;color:#121212">
                Order: <b>#${order.id}</b><br/>
                Date: ${new Date().toLocaleDateString('en-ZA', {day:'2-digit', month:'short', year:'numeric'})}<br/>
                Payment: <b style="color:#16a34a">PAID via PayFast</b><br/>
                Courier: ${order.current_location || 'Warehouse - Lephalale'}<br/>
                ETA: <b>${order.eta || '1-2 business days'}</b><br/>
                Total: <b style="font-size:16px;color:#121212">R${Number(order.total).toFixed(2)}</b>
              </div>
            </td>
          </tr></table>
        </td></tr>
        <!-- ITEMS TABLE -->
        <tr><td style="padding:28px 32px 0 32px">
          <div style="border:1px solid #F0EDE8;border-radius:12px;overflow:hidden">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#FFFCF8">
                <th style="padding:12px 16px;text-align:left;font-size:10px;letter-spacing:1px;color:#999;font-weight:700">ITEM</th>
                <th style="padding:12px 16px;text-align:center;font-size:10px;letter-spacing:1px;color:#999;font-weight:700">QTY</th>
                <th style="padding:12px 16px;text-align:right;font-size:10px;letter-spacing:1px;color:#999;font-weight:700">UNIT</th>
                <th style="padding:12px 16px;text-align:right;font-size:10px;letter-spacing:1px;color:#999;font-weight:700">TOTAL</th>
              </tr>
              ${itemRows}
              <tr style="background:#121212">
                <td colspan="3" style="padding:16px;color:#E9D9BF;font-weight:700;font-size:13px;text-align:right;letter-spacing:1px">TOTAL PAID</td>
                <td style="padding:16px;color:#E9D9BF;font-weight:900;font-size:16px;text-align:right">R${Number(order.total).toFixed(2)}</td>
              </tr>
            </table>
          </div>
        </td></tr>
        <!-- INSTRUCTIONS -->
        <tr><td style="padding:20px 32px 0 32px">
          <div style="background:#FFFCF8;border:1px dashed #E5D5B7;padding:14px 16px;border-radius:10px;display:flex;gap:12px">
            <div style="font-size:20px">📦</div>
            <div style="font-size:12px;line-height:18px;color:#57534E">
              <b style="color:#121212">Delivery Instructions:</b> Order #${order.id} - Handle with care. Customer phone ${order.phone}. Signature required. Courier: ${order.current_location}. Search: ${order.address_search || 'N/A'}
            </div>
          </div>
        </td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#F5F1EB;padding:18px 32px;text-align:center;margin-top:24px;border-top:1px solid #F0EDE8">
          <div style="font-size:11px;color:#999;line-height:16px">
            📎 PDF attached: <b>DELIVERY-${order.id}.pdf</b> • Generated ${new Date().toLocaleString('en-ZA')} • Urban Cart Admin<br/>
            © ${new Date().getFullYear()} Urban Cart • Ellisras - Lephalale • PayFast Secure Payments
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    // Send via Resend
    const resendResult = await sendViaResend({ 
      to: adminEmail, 
      subject, 
      text, 
      html, 
      pdfBuffer: buffer, 
      pdfName: `DELIVERY-${order.id}.pdf` 
    });
    if(resendResult && resendResult.ok){
      console.log(`✅ PROFESSIONAL PAID Delivery #${order.id} sent to ${adminEmail} via Resend`);
      return { ok:true, via:'resend' };
    }
    const transporter = getTransporter();
    if(!transporter){
      console.log('No Resend and no SMTP');
      return { ok:false, reason: resendResult?.error || 'not_configured' };
    }
    await transporter.sendMail({
      from: `"Urban Cart" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject,
      text, html,
      attachments: [{ filename: `DELIVERY-${order.id}.pdf`, content: buffer, contentType: 'application/pdf' }]
    });
    console.log(`✅ PROFESSIONAL Delivery #${order.id} sent to ${adminEmail} via SMTP`);
    return { ok:true };
  }catch(e){
    console.error('Email send failed', e);
    return { ok:false, reason: e.message };
  }
}

async function ensureSchema(){
  await pool.execute(`
  CREATE TABLE IF NOT EXISTS phone_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    verified TINYINT(1) DEFAULT 0,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY phone_idx (phone),
    KEY expires_idx (expires_at)
  )
`);

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
    const prodAlters = [
      "ADD COLUMN sale_price DECIMAL(10,2) NULL",
      "ADD COLUMN on_sale TINYINT(1) DEFAULT 0",
      "ADD COLUMN active TINYINT(1) DEFAULT 1",
      "ADD COLUMN images JSON NULL",
      "ADD COLUMN is_active TINYINT(1) DEFAULT 1"
    ];
    for(const c of prodAlters){ try{ await pool.query(`ALTER TABLE products ${c}`);}catch{} }
    const custAlters = [
      "ADD COLUMN role VARCHAR(20) DEFAULT 'customer'",
      "ADD COLUMN is_blocked TINYINT(1) DEFAULT 0",
      "ADD COLUMN phone VARCHAR(30) NULL",
      "ADD COLUMN total_spent DECIMAL(10,2) DEFAULT 0",
      "ADD COLUMN blocked_reason TEXT NULL"
    ];
    for(const c of custAlters){ try{ await pool.query(`ALTER TABLE customers ${c}`);}catch{} }
    try{
      await pool.query(`ALTER TABLE orders MODIFY COLUMN status ENUM('pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed') NOT NULL DEFAULT 'pending'`);
    }catch(e){ console.log('status enum fix note:', e.message); }
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN delivery_status VARCHAR(80) DEFAULT 'Order Placed'`); }catch{}
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN payment_status VARCHAR(30) DEFAULT 'pending'`); }catch{}
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN current_location VARCHAR(120) DEFAULT 'Warehouse - Lephalale'`); }catch{}
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN eta VARCHAR(80) DEFAULT '1-2 business days'`); }catch{}
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN cancel_reason VARCHAR(500) NULL`); }catch{}
    try{ await pool.query(`ALTER TABLE orders MODIFY COLUMN refund_reason TEXT NULL`); }catch{}
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
    console.log('✅ Schema migration done');
  }catch(e){ console.error('Migration error:', e.message); }
}
ensureSchema();

app.get('/', (req, res) => { res.send('urban-cart API v6 - Email delivery'); });
app.get('/api', (req, res) => { res.json({ message: 'API working v6 Email', status: 'ok' }); });
app.get('/api/health', async (_req, res) => { 
  try { await pool.query('SELECT 1'); res.json({ ok: true }); } 
  catch { res.status(503).json({ ok: false }); } 
});

app.get('/api/products', async (req, res, next) => { 
  try { 
    const q = String(req.query.q || '').slice(0, 100); 
    const category = Number(req.query.category || 0); 
    const [rows] = await pool.query(
      `SELECT p.id,p.name,p.description,p.price,p.sale_price,p.unit, p.unit_value,p.on_sale,p.stock,p.image_url,p.images,p.active,p.is_active,c.name AS category 
       FROM products p 
       LEFT JOIN categories c ON c.id=p.category_id 
       WHERE (p.active=1 OR p.active IS NULL) 
       AND (?=0 OR p.category_id=?) 
       AND (p.name LIKE ? OR p.description LIKE ?) 
       ORDER BY p.id DESC`, 
      [category, category, `%${q}%`, `%${q}%`]
    ); 
    rows.forEach(r=>{
    try{ r.images = r.images ? JSON.parse(r.images) : []; }catch{ r.images = []; }
  });
    res.json(rows); 
  } catch (e) { next(e); } 
});
app.get('/api/categories', async (_req, res, next) => { 
  try { const [rows] = await pool.query('SELECT id,name FROM categories ORDER BY name'); res.json(rows); } 
  catch (e) { next(e); } 
});

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

app.post('/api/auth/forgot-password', async (req, res, next) => {
  try{
    const email = String(req.body.email || '').trim().toLowerCase();
    if(!email) return res.status(400).json({ error: 'Email required' });
    
    const [users] = await pool.execute('SELECT id,email,name FROM customers WHERE email=?', [email]);
    
    // Always return same message for security (don't reveal if email exists)
    if(!users.length){
      return res.json({ message: 'If an account exists, a reset link has been sent to your email.' });
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour
    
    await pool.execute(
      'INSERT INTO password_resets (email, token, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token=?, expires_at=?', 
      [email, token, expires, token, expires]
    );
    
      const resetLink = `${FRONTEND_URL}?reset_token=${token}`;
      console.log(`RESET LINK FOR ${email}: ${resetLink}`);
      const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#F5F1EB;font-family:Inter,Arial,sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EB;padding:40px 0">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFCF8;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);max-width:90%">
              <tr><td style="background:#121212;padding:28px 32px;text-align:center">
                <div style="color:#E9D9BF;font-weight:900;font-size:22px;letter-spacing:2px">URBAN CART</div>
                <div style="color:#E9D9BF;font-size:10px;letter-spacing:3px;opacity:0.6;margin-top:4px">LEPHALALE • ELLISRAS • SOUTH AFRICA</div>
              </td></tr>
              <tr><td style="padding:36px 32px">
                <h1 style="margin:0 0 8px 0;font-size:24px;color:#121212">Reset your password</h1>
                <p style="margin:0 0 20px 0;color:#666;font-size:14px;line-height:22px">Hi ${users[0].name},<br/>We received a request to reset your password. Click below — expires in <b>1 hour</b>.</p>
                <div style="text-align:center;margin:32px 0">
                  <a href="${resetLink}" style="display:inline-block;background:#121212;color:#FFFCF8;padding:16px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.5px">RESET MY PASSWORD →</a>
                </div>
                <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:8px;margin:20px 0">
                  <div style="font-size:12px;color:#92400E"><b>Didn't request this?</b> Ignore this email. Your password stays the same.</div>
                </div>
                <p style="font-size:11px;color:#999;margin-top:24px;word-break:break-all">If button doesn't work, copy this link:<br/><a href="${resetLink}" style="color:#121212">${resetLink}</a></p>
              </td></tr>
              <tr><td style="background:#F5F1EB;padding:20px 32px;text-align:center;border-top:1px solid #EDE8E0">
                <div style="font-size:11px;color:#999">© ${new Date().getFullYear()} Urban Cart • PayFast Secure • Ellisras</div>
                <div style="font-size:11px;color:#999;margin-top:4px">This is an automated email, please do not reply.</div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>`;
    
    const result = await sendViaResend({ 
      to: email, 
      subject: 'Urban Cart - Reset Your Password (1h expiry)', 
      html 
    });
    
    console.log(`FORGOT email to ${email} ->`, result?.id || result?.error || 'sent');
    
    return res.json({ message: 'Reset link sent to your email (check inbox & spam).' });
    
  }catch(e){ 
    console.error('forgot-password error', e);
    next(e); 
  }
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

app.post('/api/orders', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { full_name, customer_name, email, phone, address_search, delivery_address, address, city, province, postal_code, items, customer_id, phoneVerifiedToken } = req.body;
        if(!phoneVerifiedToken){
      return res.status(400).json({ error: 'Please verify your phone number with OTP first' });
    }
    try{
      const decoded = jwt.verify(phoneVerifiedToken, process.env.JWT_SECRET || 'dev-only-change-this-secret');
      if(!decoded.verified) throw new Error('not verified');
      // Optional: check phone matches
      let normalizedPhone = String(phone||'').replace(/\s/g,'');
      if(normalizedPhone.startsWith('+27')) normalizedPhone = '0' + normalizedPhone.slice(3);
      if(normalizedPhone.startsWith('27')) normalizedPhone = '0' + normalizedPhone.slice(2);
      if(decoded.phone && decoded.phone !== normalizedPhone){
        return res.status(400).json({ error: 'Phone number does not match verified number' });
      }
    }catch(e){
      return res.status(400).json({ error: 'Phone verification expired or invalid, please verify again' });
    }

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
      location: 'Warehouse - Lephalale',
      time: new Date().toISOString(),
      note: `Order confirmed for ${finalFullName}. Address: ${finalDeliveryAddress}, ${finalProvince} ${finalPostalCode}`
    }]);
    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, customer_name, full_name, email, phone, address, city, province, postal_code, address_search, delivery_address, total, status, payment_status, delivery_status, current_location, eta, tracking_history) 
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cid, finalFullName, finalFullName, finalEmail, finalPhone, finalDeliveryAddress, finalCity, finalProvince, finalPostalCode, finalAddressSearch, finalDeliveryAddress, total, 'pending', 'pending', 'Order Placed', 'Warehouse - Lephalale', '1-2 business days', initialHistory]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      const p = products.find(pr => pr.id == (item.id || item.product_id));
      const priceToUse = (p.on_sale && p.sale_price) ? Number(p.sale_price) : Number(p.price);
      // Use what the customer picked in the bag, fall back to the product's own unit
      const itemUnit = item.unit || p.unit || 'none';
      const itemUnitValue = item.unit_value || p.unit_value || null;
      const itemSize = item.selectedSize || item.selected_size || item.size || null;
      await conn.query('INSERT INTO order_items (order_id, product_id, quantity, price, unit, unit_value, selected_size) VALUES (?,?,?,?,?,?,?)', [orderId, item.id || item.product_id, item.quantity, priceToUse, String(itemUnit), itemUnitValue ? String(itemUnitValue) : null, itemSize ? String(itemSize) : null]);
      await conn.query('UPDATE products SET stock=stock-? WHERE id=?', [item.quantity, p.id]);
    }
    if(cid){ await conn.query('UPDATE customers SET total_spent = total_spent + ? WHERE id=?',[total, cid]); }
    // DON'T DELETE CART HERE - cart stays until PayFast confirms payment.
    // If user cancels on PayFast, frontend restores from uc_cart_backup


    console.log(`NEW ORDER #${orderId} - ${finalFullName} - R${total}`);
    res.json({ orderId, total });
  } catch (err) {
    console.error('ORDER ERROR:', err);
    res.status(500).json({ error: 'Could not create your order: ' + err.message });
  } finally { conn.release(); }
});

  // Customer cancels their own order after PayFast cancel
  app.post('/api/orders/:id/cancel', auth, async (req,res)=>{
    try{
      const orderId = req.params.id;
      const userId = req.user.id;
      // Only allow cancelling own order, and only if not already paid/delivered
      const [rows] = await pool.query('SELECT * FROM orders WHERE id=? AND customer_id=?', [orderId, userId]);
      if(!rows.length) return res.status(404).json({error:'Order not found'});
      const order = rows[0];
      if(order.payment_status==='paid' || order.status==='paid' || order.status==='delivered' || order.status==='shipped'){
        return res.status(400).json({error:'Cannot cancel a paid/shipped order'});
      }
      await pool.query("UPDATE orders SET status='cancelled', payment_status='cancelled', cancel_reason='Customer cancelled on PayFast' WHERE id=?", [orderId]);
      res.json({message:'Order cancelled'});
    }catch(e){ console.error(e); res.status(500).json({error:'Failed to cancel order'}); }
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

app.post('/api/admin/products', auth, adminOnly, async (req, res, next) => { 
  try { 
    let { name, description='', price, sale_price=null, on_sale=false, stock=0, category, category_id, is_active=true, active=1, image_url='', unit='none', unit_value=null } = req.body || {}; 
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if (!String(name || '').trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stock)) || Number(stock) < 0) 
      return res.status(400).json({ error: 'Provide valid name price stock.' }); 
    const [r] = await pool.execute('INSERT INTO products(name,description,price,sale_price,on_sale,stock,category_id,active,is_active,image_url,unit,unit_value) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [String(name).trim(), String(description), money(price), sale_price?money(sale_price):null, on_sale?1:0, Number(stock), catId, active?1:0, is_active?1:0, String(image_url), String(unit || 'none'), unit_value ? String(unit_value) : null]); 
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.unit, p.unit_value,p.price,p.sale_price,p.on_sale,p.stock,p.image_url,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [r.insertId]);
    res.status(201).json(rows[0]); 
  } catch (e) { next(e); } 
});

app.put('/api/admin/products/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    let { name, description='', price, sale_price=null, on_sale=false, image_url='', stock=0, category, category_id, is_active=true, active, unit='none', unit_value=null } = req.body || {};
    const catId = category_id ? Number(category_id) : await getCategoryId(category);
    if(active===undefined) active = is_active?1:0;
    const [r] = await pool.execute('UPDATE products SET name=?, description=?, price=?, sale_price=?, on_sale=?, image_url=?, stock=?, category_id=?, active=?, is_active=?, unit=?, unit_value=? WHERE id=?', [String(name).trim(), String(description), money(price), sale_price?money(sale_price):null, on_sale?1:0, String(image_url), Number(stock), catId, active?1:0, is_active?1:0, String(unit || 'none'), unit_value ? String(unit_value) : null, id]);
    if(!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
    const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.unit,p.unit_value,p.price,p.sale_price,p.on_sale,p.image_url,p.stock,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [id]);
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
    const allowed = ['pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed']; 
    let status = String(req.body.status || '').toLowerCase().trim();
    if (!allowed.includes(status)) return res.status(400).json({ error: `Invalid status ${status}` }); 
    const id = Number(req.params.id);
    const cancel_reason = req.body.cancel_reason || null;
    const refund_reason = req.body.refund_reason || null;
    const deliveryMap = { pending:'Order Placed', paid:'Paid - Processing', processing:'Processing', shipped:'Shipped', delivered:'Delivered', cancelled:'Cancelled', refunded:'Refunded', refund_pending:'Refund Pending', failed:'Payment Failed' };
    const delivery_status = deliveryMap[status] || status;
    let query = 'UPDATE orders SET status=?, delivery_status=?, payment_status=?';
    const params = [status, delivery_status, status==='failed' ? 'failed' : status==='paid' ? 'paid' : status==='cancelled' ? 'cancelled' : status==='refunded' ? 'refunded' : 'pending'];
    if(status==='cancelled'){ query += ', cancel_reason=?'; params.push(cancel_reason); }
    if(status==='refunded' || status==='refund_pending'){ query += ', refund_reason=?, refunded_at=NOW()'; params.push(refund_reason || req.body.reason || 'Admin refund'); }
    query += ' WHERE id=?'; params.push(id);
    try{
      const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
      let hist = [];
      try{ hist = typeof existing[0]?.tracking_history==='string' ? JSON.parse(existing[0].tracking_history) : (existing[0]?.tracking_history||[]); }catch{ hist=[]; }
      if(!Array.isArray(hist)) hist=[];
      hist.push({ status: delivery_status, location: 'Admin Panel', time: new Date().toISOString(), note: cancel_reason || refund_reason || `Status changed to ${delivery_status}` });
      await pool.execute('UPDATE orders SET tracking_history=? WHERE id=?', [JSON.stringify(hist), id]);
    }catch{}
    const [r] = await pool.execute(query, params); 
    if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' }); 
    // ✅ ADD IT HERE — If admin marks as PAID, send delivery note
    if(status==='paid'){
      try{
        const [oRows] = await pool.query('SELECT * FROM orders WHERE id=?',[id]);
        const [iRows] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[id]);
        if(oRows.length) await sendDeliveryNoteEmail(oRows[0], iRows);
      }catch(e){ console.log('Admin paid email failed', e.message); }
    }
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
    res.json({ ok:true, message:'Refunded and restocked' });
  }catch(e){ next(e); }
});

app.put('/api/admin/orders/:id', auth, adminOnly, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    const { delivery_status, current_location, eta, tracking_note, delivery_status_code } = req.body;
    const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
    if(!existing.length) return res.status(404).json({ error: 'Order not found.' });
    let hist = [];
    try{ hist = typeof existing[0].tracking_history==='string' ? JSON.parse(existing[0].tracking_history) : (existing[0].tracking_history||[]); }catch{ hist=[]; }
    if(!Array.isArray(hist)) hist=[];
    hist.push({ status: delivery_status || 'Updated', location: current_location || '', eta: eta || '', note: tracking_note || '', time: new Date().toISOString() });
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
    const params = [delivery_status||'Order Placed', current_location||'Warehouse - Lephalale', eta||'1-2 business days', JSON.stringify(hist)];
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

// ===== EMAIL ENDPOINTS =====
app.post('/api/admin/orders/:id/send-delivery-note', auth, adminOnly, async (req, res, next)=>{
  try{
    const id = Number(req.params.id);
    const [orders] = await pool.query('SELECT * FROM orders WHERE id=?',[id]);
    if(!orders.length) return res.status(404).json({ error:'Order not found' });
    const [items] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[id]);
    const result = await sendDeliveryNoteEmail(orders[0], items);
    if(result.ok){
      res.json({ ok:true, message:`Email Delivery Note #${id} sent to ${process.env.ADMIN_EMAIL}! PDF attached.` });
    }else{
      const msg = result.reason==='not_configured' ? 'Set SMTP_USER, SMTP_PASS, ADMIN_EMAIL in Render env' : 'Failed: '+result.reason;
      res.status(500).json({ error: msg });
    }
  }catch(e){ next(e); }
});

app.get('/api/admin/orders/:id/delivery-pdf', auth, adminOnly, async (req, res, next)=>{
  try{
    const id = Number(req.params.id);
    const [orders] = await pool.query('SELECT * FROM orders WHERE id=?',[id]);
    if(!orders.length) return res.status(404).json({ error:'Not found' });
    const [items] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[id]);
    const buffer = await generateDeliveryPdfBuffer(orders[0], items);
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=DELIVERY-${id}.pdf`);
    res.send(buffer);
  }catch(e){ next(e); }
});

app.get('/api/admin/test-email', async (req, res) => {
  const key = req.query.key || req.query.token;
  if(key){
    if(key !== (process.env.ADMIN_PDF_TOKEN || 'urban-cart-secret-123')){
      // allow anyway but log
    }
  } else {
    // try auth
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try{ 
      const user = jwt.verify(token, process.env.JWT_SECRET || 'dev-only-change-this-secret');
      if(user.role !== 'admin') throw new Error('not admin');
    }catch{
      // if no token, still allow test but warn - for debugging
      if(!key){
        return res.status(200).json({ 
          info: 'Not signed in - showing config only. To actually send email, add ?key=YOUR_ADMIN_PDF_TOKEN or login.',
          env_check: {
            SMTP_HOST: process.env.SMTP_HOST || 'MISSING',
            SMTP_PORT: process.env.SMTP_PORT || 'MISSING',
            SMTP_USER: process.env.SMTP_USER ? process.env.SMTP_USER.slice(0,4)+'***' : 'MISSING',
            SMTP_PASS: process.env.SMTP_PASS ? 'SET ('+String(process.env.SMTP_PASS).length+' chars - should be 16)' : 'MISSING',
            ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'MISSING',
            ADMIN_PDF_TOKEN: process.env.ADMIN_PDF_TOKEN ? 'SET' : 'MISSING - set to urban-cart-secret-123'
          }
        });
      }
    }
  }
  // continue actual test
  const _req = req;
  {
  req = _req;

  console.log('TEST EMAIL REQUESTED');
  console.log('ENV CHECK:', { 
    SMTP_HOST: process.env.SMTP_HOST || 'MISSING', 
    SMTP_PORT: process.env.SMTP_PORT || 'MISSING', 
    SMTP_USER: process.env.SMTP_USER ? (process.env.SMTP_USER.slice(0,3)+'***') : 'MISSING', 
    SMTP_PASS: process.env.SMTP_PASS ? 'SET ('+process.env.SMTP_PASS.length+' chars)' : 'MISSING', 
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'MISSING' 
  });
  const transporter = getTransporter();
  if(!transporter){
    return res.status(500).json({ error: 'SMTP not configured. Set SMTP_USER, SMTP_PASS, ADMIN_EMAIL', env: { 
      host: process.env.SMTP_HOST, 
      port: process.env.SMTP_PORT, 
      user_set: !!process.env.SMTP_USER, 
      pass_set: !!process.env.SMTP_PASS, 
      admin: process.env.ADMIN_EMAIL 
    }});
  }
  try{
    await transporter.verify();
    console.log('SMTP verify OK');
    const testOrder = { id: 999, total: 123.45, customer_name: 'Test Customer', full_name: 'Test Customer', email: 'test@test.com', phone: '0821234567', delivery_address: '123 Ellisras', address_search: 'Ellisras Test', province: 'GP', postal_code: '1868', city: 'Ellisras', delivery_status: 'Test', payment_status: 'paid', current_location: 'Warehouse', eta: '2 days' };
    const testItems = [{ name: 'Test Product', quantity: 1, price: 123.45 }];
    const result = await sendDeliveryNoteEmail(testOrder, testItems);
    res.json({ ok: result.ok, result, message: result.ok ? `Test email sent to ${process.env.ADMIN_EMAIL}` : 'Failed: '+result.reason });
  }catch(e){
    console.error('TEST EMAIL FAILED', e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
  }
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
    const orderId = Number(data.m_payment_id);
    if(!orderId) return res.status(200).send('No order');
    const status = (data.payment_status||'').toLowerCase();
    if(status==='complete'){
      await pool.execute("UPDATE orders SET payment_status='paid', status='paid', delivery_status='Paid - Processing' WHERE id=?",[orderId]);
      // NOW it's safe to clear cart - payment confirmed
      try{
        const [ord] = await pool.query('SELECT customer_id FROM orders WHERE id=?',[orderId]);
        if(ord.length && ord[0].customer_id){
          await pool.execute('DELETE FROM carts WHERE user_id=?',[ord[0].customer_id]);
        }
      }catch(e){ console.log('Clear cart after payment failed', e.message); }

      // ✅ SEND DELIVERY NOTE ONLY AFTER PAYMENT
      try{
        const [oRows] = await pool.query('SELECT * FROM orders WHERE id=?',[orderId]);
        const [iRows] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?',[orderId]);
        if(oRows.length){
          await sendDeliveryNoteEmail(oRows[0], iRows);
          console.log(`✅ Delivery Note #${orderId} sent AFTER PAYMENT to ${process.env.ADMIN_EMAIL}`);
        }
      }catch(e){ console.log('Post-payment email failed', e.message); }
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

const port = Number(process.env.PORT || 10000); 
app.listen(port, () => console.log(`Urban Cart API v6 EMAIL listening on http://localhost:${port}`));