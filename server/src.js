import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import {
  requireEnv, IS_PROD, corsOptions,
  globalLimiter, authLimiter, resetLimiter, otpSendLimiter, otpVerifyLimiter, orderLimiter, reviewLimiter,
  makeAuth, adminOnly, signToken, wrap,
  normalizePhone, isValidSAnumber, isEmail, cleanText, asInt, isHttpUrl, escapeHtml,
  generateOTP, storeOtp, checkOtp, signPhoneToken, readPhoneToken, sha256,
  verifyPayfastItn, errorHandler
} from './security.js';

/* ================= STARTUP CHECKS (app refuses to run insecurely) ================= */
const requiredEnv = ['JWT_SECRET', 'ALLOWED_ORIGINS', 'ADMIN_EMAIL'];
if (IS_PROD) requiredEnv.push('DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME');
if (IS_PROD && process.env.PAYFAST_SANDBOX !== 'true') requiredEnv.push('PAYFAST_PASSPHRASE');
requireEnv(requiredEnv);

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy: needed for real client IPs (rate limits, PayFast IP check)
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '500kb' }));

/* ================= DATABASE ================= */
const dbSsl = process.env.DB_SSL_CA
  ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') }
  : ((process.env.DB_HOST || '').includes('clever-cloud.com')
      ? (console.warn('WARNING: DB TLS certificate is NOT verified. Set DB_SSL_CA to fix.'), { rejectUnauthorized: false })
      : undefined);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'urban_cart',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 2),
  decimalNumbers: true,
  ssl: dbSsl,
  enableKeepAlive: true
});

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://urban-cart-ecommerce.vercel.app').replace(/\/$/, '');
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM_EMAIL = process.env.FROM_EMAIL || 'Urban Cart <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL.trim();
const PHONE_OTP_REQUIRED = process.env.PHONE_OTP_REQUIRED !== 'false';

/* ================= SMALL HELPERS ================= */
const money = n => Math.round(Number(n) * 100) / 100;
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const asId = v => asInt(v, 1, 2147483647);
const multiline = (v, max = 5000) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const ALLOWED_STATUS = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'refund_pending', 'failed'];
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), 12); // equalises login timing
const toE164 = p => '+27' + normalizePhone(p).slice(1);
const otpStore = new Map();

const parseHist = v => {
  try {
    const h = typeof v === 'string' ? JSON.parse(v) : (v || []);
    return Array.isArray(h) ? h : [];
  } catch { return []; }
};

const isSafeImage = u =>
  u === '' || /^\/[^/]/.test(u) || isHttpUrl(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u);

async function getCategoryId(nameOrId) {
  if (!nameOrId) return null;
  if (Number.isInteger(Number(nameOrId)) && Number(nameOrId) > 0) return Number(nameOrId);
  const [rows] = await pool.execute('SELECT id FROM categories WHERE name=? LIMIT 1', [String(nameOrId).trim()]);
  return rows.length ? rows[0].id : null;
}

function formatUnitLabel(it) {
  if (!it) return '';
  const parts = [];
  const size = it.selected_size || it.selectedSize || it.size || null;
  if (size) parts.push(`Size: ${size}`);
  const color = it.selected_color || it.selectedColor || it.color || null;
  if (color) parts.push(`Colour: ${color}`);
  if (it.unit && it.unit !== 'none' && it.unit !== 'size') {
    const val = Number(it.unit_value || 0);
    if (val) parts.push(`${it.unit_value}${it.unit} each - Total: ${it.quantity * val}${it.unit}`);
    else parts.push(`${it.unit}`);
  }
  if (!parts.length) return '';
  return ` (${parts.join(' | ')})`;
}

/* ================= SMS (OTP delivery) ================= */
async function sendSms(phone, message) {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
  const to = toE164(phone);
  console.log('[SMS] provider:', provider, 'to:', to, 'hasKey:', !!process.env.AT_API_KEY, 'username:', process.env.AT_USERNAME);
  if (provider === 'africastalking') {
    const baseUrl = process.env.AT_BASE_URL || 'https://api.sandbox.africastalking.com/version1/messaging';
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { apiKey: process.env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: process.env.AT_USERNAME, to, message, ...(process.env.AT_SENDER_ID ? { from: process.env.AT_SENDER_ID } : {}) })
    });
    const data = await r.json().catch(() => ({}));
    console.log('[SMS] AT response:', r.status, JSON.stringify(data));
    if (!r.ok) throw new Error('SMS provider error ' + r.status + ' ' + JSON.stringify(data));
    return true;
  }
  console.log('[SMS] No provider configured, OTP would be:', message);
  return false;
}

/* ================= EMAIL + PDF ================= */
async function generateDeliveryPdfBuffer(order, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).font('Helvetica-Bold').text('URBAN CART');
    doc.fontSize(8).font('Helvetica').text('Ellisras - Lephalale - SA\nPayFast Secure');
    const headerRight = `DELIVERY\n#${order.id}\n${new Date().toISOString().slice(0, 10)}\n${(order.delivery_status || '').toUpperCase()} / ${(order.payment_status || order.status || '').toUpperCase()}`;
    doc.fontSize(8).text(headerRight, 400, 40, { align: 'right', width: 155 });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);
    const topY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').text('BILL TO:', 40, topY);
    doc.font('Helvetica').fontSize(9).text(
      `${order.customer_name || order.full_name || 'Customer'}\n${order.email || ''}\n${order.phone || ''}\n${order.delivery_address || order.address || ''}\n${order.province || ''}, ${order.postal_code || ''}`,
      40, topY + 12, { width: 240 }
    );
    doc.font('Helvetica-Bold').text('DELIVERY:', 320, topY);
    doc.font('Helvetica').fontSize(9).text(
      `${order.delivery_address || order.address || ''}, ${order.province || ''}\nCourier: ${order.current_location || 'Warehouse - Lephalale'}\nETA: ${order.eta || '1-2 business days'}`,
      320, topY + 12, { width: 235 }
    );
    doc.y = Math.max(doc.y, topY + 70);
    doc.moveDown(1);
    const tableTop = doc.y;
    const cols = { item: 40, qty: 320, unit: 380, total: 470 };
    doc.rect(40, tableTop, 515, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', 45, tableTop + 6, { width: 270 });
    doc.text('Qty', cols.qty, tableTop + 6, { width: 50, align: 'center' });
    doc.text('Unit', cols.unit, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Total', cols.total, tableTop + 6, { width: 80, align: 'right' });
    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    for (const it of items) {
      const name = (it.name || `Product #${it.product_id}`) + formatUnitLabel(it);
      const lineH = 20;
      if (y + lineH > 750) { doc.addPage(); y = 40; }
      doc.rect(40, y, 515, lineH).stroke();
      doc.text(name.slice(0, 60), 45, y + 6, { width: 270 });
      doc.text(String(it.quantity), cols.qty, y + 6, { width: 50, align: 'center' });
      doc.text(`R ${Number(it.price).toFixed(2)}`, cols.unit, y + 6, { width: 80, align: 'right' });
      doc.text(`R ${(Number(it.price) * Number(it.quantity)).toFixed(2)}`, cols.total, y + 6, { width: 80, align: 'right' });
      y += lineH;
    }
    doc.rect(40, y, 515, 20).stroke();
    doc.font('Helvetica-Bold').text('TOTAL', cols.unit, y + 6, { width: 80, align: 'right' });
    doc.text(`R ${Number(order.total).toFixed(2)}`, cols.total, y + 6, { width: 80, align: 'right' });
    y += 50;
    doc.rect(40, y, 515, 45).dash(4, { space: 4 }).stroke();
    doc.undash();
    doc.font('Helvetica-Bold').fontSize(9).text('DELIVERY NOTE:', 50, y + 8);
    doc.font('Helvetica').fontSize(9).text(`Order #${order.id} - Handle with care. Customer phone: ${order.phone}. Signature required.`, 50, y + 20, { width: 495 });
    y += 70;
    doc.fontSize(7).font('Helvetica').text(`Generated by Urban Cart Admin - ${new Date().toLocaleString()}`, 40, y);
    doc.end();
  });
}

async function sendViaResend({ to, subject, text, html, pdfBuffer, pdfName }) {
  if (!RESEND_API_KEY) return null;
  try {
    const payload = { from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, html: html || text || '', text: text || '' };
    if (pdfBuffer) payload.attachments = [{ filename: pdfName || 'delivery-note.pdf', content: pdfBuffer.toString('base64') }];
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
}


async function sendEmailResend(toOrObj, subject, html) {
  if (typeof toOrObj === 'object' && toOrObj !== null) return sendViaResend(toOrObj);
  return sendViaResend({ to: toOrObj, subject, html });
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendDeliveryNoteEmail(order, items) {
  try {
    const buffer = await generateDeliveryPdfBuffer(order, items);
    const e = escapeHtml;
    const custName = order.customer_name || order.full_name || '';
    const itemListText = items.map(i => `• ${i.name || 'Product'}${formatUnitLabel(i)} x${i.quantity} - R${(Number(i.price) * Number(i.quantity)).toFixed(2)}`).join('\n');
    const text = `Order #${order.id} - PAID\nCustomer: ${custName}\nEmail: ${order.email}\nPhone: ${order.phone}\nAddress: ${order.delivery_address || order.address}, ${order.province} ${order.postal_code}\n\nItems:\n${itemListText}\nTOTAL PAID: R${Number(order.total).toFixed(2)}\nStatus: PAID - Ready to Ship\nLocation: ${order.current_location}\nETA: ${order.eta}`;
    const itemRows = items.map(i => `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;color:#121212">${e(i.name || 'Product')}<br/><span style="font-size:11px;color:#92400E;font-weight:700;">${e(formatUnitLabel(i))}</span></td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:center;color:#121212">${e(i.quantity)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:right;color:#121212">R${Number(i.price).toFixed(2)}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #F0EDE8;font-size:13px;text-align:right;font-weight:700;color:#121212">R${(Number(i.price) * Number(i.quantity)).toFixed(2)}</td>
      </tr>`).join('');
    const subject = `✅ PAID - DELIVERY NOTE #${order.id} - R${Number(order.total).toFixed(2)} - ${custName.replace(/[\r\n]/g, ' ')} - Ready to Ship`;
    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F1EB;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EB;padding:24px 0">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.08);max-width:95%">
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
        <tr><td style="padding:28px 32px 0 32px">
          <table width="100%"><tr>
            <td width="50%" style="vertical-align:top;padding-right:16px">
              <div style="font-size:10px;color:#999;letter-spacing:1.5px;font-weight:700;margin-bottom:10px">BILL TO</div>
              <div style="font-size:13px;line-height:21px;color:#121212">
                <b style="font-size:14px">${e(custName)}</b><br/>
                ${e(order.email)}<br/>
                ${e(order.phone)}<br/>
                <span style="color:#57534E">${e(order.delivery_address || order.address)}<br/>${e(order.province)} ${e(order.postal_code)}${order.city ? ` • ${e(order.city)}` : ''}</span>
                ${order.address_search ? `<br/><span style="font-size:11px;color:#999">📍 ${e(order.address_search)}</span>` : ''}
              </div>
            </td>
            <td width="50%" style="vertical-align:top">
              <div style="font-size:10px;color:#999;letter-spacing:1.5px;font-weight:700;margin-bottom:10px">SHIPMENT DETAILS</div>
              <div style="font-size:13px;line-height:21px;color:#121212">
                Order: <b>#${e(order.id)}</b><br/>
                Date: ${new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}<br/>
                Payment: <b style="color:#16a34a">PAID via PayFast</b><br/>
                Courier: ${e(order.current_location || 'Warehouse - Lephalale')}<br/>
                ETA: <b>${e(order.eta || '1-2 business days')}</b><br/>
                Total: <b style="font-size:16px;color:#121212">R${Number(order.total).toFixed(2)}</b>
              </div>
            </td>
          </tr></table>
        </td></tr>
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
        <tr><td style="padding:20px 32px 0 32px">
          <div style="background:#FFFCF8;border:1px dashed #E5D5B7;padding:14px 16px;border-radius:10px">
            <div style="font-size:12px;line-height:18px;color:#57534E">
              📦 <b style="color:#121212">Delivery Instructions:</b> Order #${e(order.id)} - Handle with care. Customer phone ${e(order.phone)}. Signature required. Courier: ${e(order.current_location)}. Search: ${e(order.address_search || 'N/A')}
            </div>
          </div>
        </td></tr>
        <tr><td style="background:#F5F1EB;padding:18px 32px;text-align:center;border-top:1px solid #F0EDE8">
          <div style="font-size:11px;color:#999;line-height:16px">
            📎 PDF attached: <b>DELIVERY-${e(order.id)}.pdf</b> • Generated ${new Date().toLocaleString('en-ZA')} • Urban Cart Admin<br/>
            © ${new Date().getFullYear()} Urban Cart • Ellisras - Lephalale • PayFast Secure Payments
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const resendResult = await sendViaResend({ to: ADMIN_EMAIL, subject, text, html, pdfBuffer: buffer, pdfName: `DELIVERY-${order.id}.pdf` });
    if (resendResult && resendResult.ok) {
      console.log(`Delivery note #${order.id} sent via Resend`);
      return { ok: true, via: 'resend' };
    }
    const transporter = getTransporter();
    if (!transporter) {
      console.log('No Resend and no SMTP configured');
      return { ok: false, reason: resendResult?.error || 'not_configured' };
    }
    await transporter.sendMail({
      from: `"Urban Cart" <${process.env.SMTP_USER}>`,
      to: ADMIN_EMAIL, subject, text, html,
      attachments: [{ filename: `DELIVERY-${order.id}.pdf`, content: buffer, contentType: 'application/pdf' }]
    });
    console.log(`Delivery note #${order.id} sent via SMTP`);
    return { ok: true };
  } catch (err) {
    console.error('Email send failed', err);
    return { ok: false, reason: err.message };
  }
}

/* ================= ORDER LIFECYCLE HELPERS ================= */
async function restockOrder(orderId) {
  const [items] = await pool.query('SELECT product_id, quantity FROM order_items WHERE order_id=?', [orderId]);
  for (const it of items) {
    await pool.execute('UPDATE products SET stock=stock+? WHERE id=?', [it.quantity, it.product_id]);
  }
}

// Runs once when an order becomes paid: credit customer, clear their cart, send delivery note
async function onOrderPaid(orderId) {
  try {
    const [oRows] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!oRows.length) return;
    const o = oRows[0];
    if (o.customer_id) {
      await pool.execute('UPDATE customers SET total_spent = total_spent + ? WHERE id=?', [o.total, o.customer_id]);
      await pool.execute('DELETE FROM carts WHERE user_id=?', [o.customer_id]);
    }
    const [iRows] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [orderId]);
    await sendDeliveryNoteEmail(o, iRows);
  } catch (e) { console.error('onOrderPaid failed', orderId, e.message); }
}

async function markOrderPaid(orderId, pfPaymentId) {
  const [r] = await pool.execute(
    "UPDATE orders SET payment_status='paid', status='paid', delivery_status='Paid - Processing', payment_method='PayFast', payfast_id=? WHERE id=? AND status='pending'",
    [pfPaymentId ? String(pfPaymentId).slice(0, 100) : null, orderId]);
  if (r.affectedRows) return onOrderPaid(orderId);
  const [rows] = await pool.query('SELECT status FROM orders WHERE id=?', [orderId]);
  if (rows[0]?.status === 'paid') return; // duplicate ITN, already handled
  console.warn(`Payment received for order #${orderId} in status "${rows[0]?.status}" - manual review needed`);
  await sendViaResend({
    to: ADMIN_EMAIL,
    subject: `⚠️ Payment received for non-pending order #${orderId}`,
    html: `<p>PayFast confirmed a payment for order #${escapeHtml(orderId)} but its status is <b>${escapeHtml(rows[0]?.status)}</b>. Check stock and refund via PayFast if needed.</p>`
  });
}

/* ================= PAYFAST ITN (defined before rate limiter; verified 4 ways) ================= */
app.post('/api/payfast/notify', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
  res.status(200).send('OK'); // acknowledge immediately; process after
  try {
    const data = req.body || {};
    const orderId = asId(data.m_payment_id);
    if (!orderId) return;
    if (data.merchant_id !== process.env.PAYFAST_MERCHANT_ID) return console.warn('ITN merchant mismatch');
    const [rows] = await pool.execute('SELECT id,total,status FROM orders WHERE id=?', [orderId]);
    if (!rows.length) return;
    const check = await verifyPayfastItn({
      body: data, ip: req.ip, expectedAmount: rows[0].total,
      sandbox: process.env.PAYFAST_SANDBOX === 'true', passphrase: process.env.PAYFAST_PASSPHRASE
    });
    if (!check.ok) return console.warn(`ITN rejected for order ${orderId}: ${check.reason}`);

    const status = String(data.payment_status || '').toLowerCase();
    if (status === 'complete') await markOrderPaid(orderId, data.pf_payment_id);
    else if (status === 'failed') await pool.execute("UPDATE orders SET payment_status='failed' WHERE id=? AND status='pending'", [orderId]);
    else if (status === 'cancelled') await pool.execute("UPDATE orders SET payment_status='cancelled' WHERE id=? AND status='pending'", [orderId]);
  } catch (e) { console.error('ITN error', e.message); }
});

/* ================= RATE LIMIT + AUTH WIRING ================= */
app.use('/api', globalLimiter);
const auth = makeAuth(pool);
app.use('/api/admin', auth, adminOnly); // every admin route is protected from this one line

/* ================= SCHEMA (move to a migration script when you can) ================= */
async function ensureSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS phone_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      otp VARCHAR(64) NOT NULL,
      verified TINYINT(1) DEFAULT 0,
      attempts TINYINT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY phone_idx (phone),
      KEY expires_idx (expires_at)
    )`);
  // otp now stores a SHA-256 hash (64 chars) and we track wrong attempts
  try { await pool.query('ALTER TABLE phone_otps MODIFY COLUMN otp VARCHAR(64) NOT NULL'); } catch {}
  try { await pool.query('ALTER TABLE phone_otps ADD COLUMN attempts TINYINT NOT NULL DEFAULT 0'); } catch {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      user_id INT NULL,
      customer_name VARCHAR(100) NOT NULL,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      is_approved TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )`);

  try { await pool.query('ALTER TABLE order_items ADD COLUMN selected_color VARCHAR(50) NULL'); } catch {}

  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS carts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        selected_size VARCHAR(50) NULL DEFAULT '',
        selected_color VARCHAR(50) NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_product_variant (user_id, product_id, selected_size, selected_color),
        FOREIGN KEY (user_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )`);
    try { await pool.query("ALTER TABLE carts ADD COLUMN selected_size VARCHAR(50) NULL DEFAULT ''"); } catch {}
    try { await pool.query("ALTER TABLE carts ADD COLUMN selected_color VARCHAR(50) NULL DEFAULT ''"); } catch {}
    try { await pool.query('ALTER TABLE carts DROP INDEX unique_user_product'); } catch {}
    try { await pool.query('ALTER TABLE carts ADD UNIQUE KEY unique_user_product_variant (user_id, product_id, selected_size, selected_color)'); } catch {}

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_email (email),
        KEY token_idx (token)
      )`);
    const prodAlters = [
      'ADD COLUMN sale_price DECIMAL(10,2) NULL',
      'ADD COLUMN is_bestseller TINYINT(1) NOT NULL DEFAULT 0',
      'ADD COLUMN on_sale TINYINT(1) DEFAULT 0',
      'ADD COLUMN active TINYINT(1) DEFAULT 1',
      'ADD COLUMN images JSON NULL',
      'ADD COLUMN colors TEXT NULL',
      'ADD COLUMN is_active TINYINT(1) DEFAULT 1'
    ];
    for (const c of prodAlters) { try { await pool.query(`ALTER TABLE products ${c}`); } catch {} }
    const custAlters = [
      "ADD COLUMN role VARCHAR(20) DEFAULT 'customer'",
      'ADD COLUMN is_blocked TINYINT(1) DEFAULT 0',
      'ADD COLUMN phone VARCHAR(30) NULL',
      'ADD COLUMN total_spent DECIMAL(10,2) DEFAULT 0',
      'ADD COLUMN blocked_reason TEXT NULL'
    ];
    for (const c of custAlters) { try { await pool.query(`ALTER TABLE customers ${c}`); } catch {} }
    try { await pool.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending','paid','processing','shipped','delivered','cancelled','refunded','refund_pending','failed') NOT NULL DEFAULT 'pending'"); } catch (e) { console.log('status enum note:', e.message); }
    try { await pool.query("ALTER TABLE orders MODIFY COLUMN delivery_status VARCHAR(80) DEFAULT 'Order Placed'"); } catch {}
    try { await pool.query("ALTER TABLE orders MODIFY COLUMN payment_status VARCHAR(30) DEFAULT 'pending'"); } catch {}
    try { await pool.query("ALTER TABLE orders MODIFY COLUMN current_location VARCHAR(120) DEFAULT 'Warehouse - Lephalale'"); } catch {}
    try { await pool.query("ALTER TABLE orders MODIFY COLUMN eta VARCHAR(80) DEFAULT '1-2 business days'"); } catch {}
    try { await pool.query('ALTER TABLE orders MODIFY COLUMN cancel_reason VARCHAR(500) NULL'); } catch {}
    try { await pool.query('ALTER TABLE orders MODIFY COLUMN refund_reason TEXT NULL'); } catch {}
    const orderAlters = [
      'ADD COLUMN address_search VARCHAR(255) NULL',
      'ADD COLUMN delivery_address VARCHAR(255) NULL',
      'ADD COLUMN tracking_history JSON NULL',
      'ADD COLUMN full_name VARCHAR(255) NULL',
      'ADD COLUMN refunded_at TIMESTAMP NULL',
      'ADD COLUMN payment_method VARCHAR(50) NULL',
      'ADD COLUMN payfast_id VARCHAR(100) NULL'
    ];
    for (const c of orderAlters) { try { await pool.query(`ALTER TABLE orders ${c}`); } catch {} }
    console.log('Schema migration done');
  } catch (e) { console.error('Migration error:', e.message); }
}
ensureSchema().catch(e => console.error('Schema error:', e.message));

/* ================= BASIC ROUTES ================= */
app.get('/', (_req, res) => { res.send('urban-cart API'); });
app.get('/api', (_req, res) => { res.json({ status: 'ok' }); });
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

/* ================= REVIEWS ================= */
app.get('/api/products/:id/reviews', wrap(async (req, res) => {
  const pid = asId(req.params.id);
  if (!pid) return res.json([]);
  const [rows] = await pool.query(
    `SELECT id, product_id, customer_name, rating, comment, created_at
     FROM reviews WHERE product_id = ? AND is_approved = 1 ORDER BY created_at DESC`, [pid]);
  res.json(rows);
}));

app.post('/api/reviews', reviewLimiter, auth, wrap(async (req, res) => {
  const product_id = asId(req.body.product_id);
  const rating = asInt(req.body.rating, 1, 5);
  const comment = multiline(req.body.comment, 1000);
  if (!product_id || !rating || !comment) return res.status(400).json({ error: 'Valid rating (1-5) and comment required' });

  const [prod] = await pool.query('SELECT name FROM products WHERE id = ?', [product_id]);
  if (!prod.length) return res.status(404).json({ error: 'Product not found' });

  const name = cleanText(req.user.name || req.user.email?.split('@')[0] || 'Customer', 100);
  const [r] = await pool.query(
    'INSERT INTO reviews (product_id, user_id, customer_name, rating, comment) VALUES (?,?,?,?,?)',
    [product_id, req.user.id, name, rating, comment]);
  const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [r.insertId]);
  const newReview = rows[0];

  try {
    const prodName = prod[0].name || `Product #${product_id}`;
    const e = escapeHtml;
    await sendEmailResend({
      to: ADMIN_EMAIL,
      subject: `⭐ New Review - ${String(prodName).replace(/[\r\n]/g, ' ')} (${rating}/5)`,
      html: `<div style="font-family:Arial; max-width:600px; margin:0 auto; border:2px solid #121212;">
        <div style="background:#121212; color:#E9D9BF; padding:20px; text-align:center;">
          <h2 style="margin:0; font-size:22px;">⭐ NEW REVIEW</h2>
          <p style="margin:8px 0 0; opacity:.8;">Urban Cart - ${e(prodName)}</p>
        </div>
        <div style="padding:20px;">
          <p><b>Product:</b> ${e(prodName)}</p>
          <p><b>Customer:</b> ${e(name)}</p>
          <p><b>Rating:</b> ${'⭐'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)</p>
          <p><b>Comment:</b></p>
          <div style="background:#FFFCF8; border:1px solid #ddd; padding:12px; border-radius:8px; white-space:pre-wrap;">${e(comment)}</div>
          <p style="font-size:12px; color:#666; margin-top:16px;">Review ID: #${newReview.id} • ${new Date().toLocaleString('en-ZA')}</p>
          <p style="font-size:12px;">Open Admin → Reviews to approve / delete it.</p>
        </div>
      </div>`
    });
  } catch (e) { console.log('Review notify failed:', e.message); }

  res.json(newReview);
}));

app.delete('/api/admin/reviews/:id', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  await pool.query('DELETE FROM reviews WHERE id = ?', [id]);
  res.json({ ok: true });
}));

app.get('/api/admin/reviews', wrap(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT r.*, p.name AS product_name, p.image_url
    FROM reviews r LEFT JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC LIMIT 200`);
  res.json(rows);
}));

/* ================= PRODUCTS (public) ================= */
app.get('/api/products', wrap(async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100).replace(/[\\%_]/g, '\\$&');
  const category = asInt(req.query.category || 0, 0, 2147483647) || 0;
  const [rows] = await pool.query(
    `SELECT p.id,p.name,p.description,p.price,p.is_bestseller,p.sale_price,p.colors,p.unit,p.unit_value,p.on_sale,p.stock,p.image_url,p.images,p.active,p.is_active,c.name AS category
     FROM products p
     LEFT JOIN categories c ON c.id=p.category_id
     WHERE (p.active=1 OR p.active IS NULL)
     AND (?=0 OR p.category_id=?)
     AND (p.name LIKE ? OR p.description LIKE ?)
     ORDER BY p.id DESC`,
    [category, category, `%${q}%`, `%${q}%`]);
  rows.forEach(r => {
    try { r.images = typeof r.images === 'string' ? JSON.parse(r.images) : (Array.isArray(r.images) ? r.images : []); }
    catch { r.images = []; }
  });
  res.json(rows);
}));

app.get('/api/categories', wrap(async (_req, res) => {
  const [rows] = await pool.query('SELECT id,name FROM categories ORDER BY name');
  res.json(rows);
}));

/* ================= AUTH ================= */
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const name = cleanText(req.body.name, 100);
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || !isEmail(email) || password.length < 8 || Buffer.byteLength(password) > 72)
    return res.status(400).json({ error: 'Enter a name, valid email and a password of 8-72 characters.' });
  const [exists] = await pool.execute('SELECT id FROM customers WHERE email=?', [email]);
  if (exists.length) return res.status(409).json({ error: 'An account with this email already exists.' });
  const hash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute('INSERT INTO customers(name,email,password_hash,role) VALUES(?,?,?,?)', [name, email, hash, 'customer']);
    const user = { id: result.insertId, name, email, role: 'customer' };
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw e;
  }
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase();
  const password = String(req.body.password || '');
  const [rows] = await pool.execute('SELECT id,name,email,password_hash,role,is_blocked FROM customers WHERE email=?', [email]);
  const hash = rows.length ? rows[0].password_hash : DUMMY_HASH; // always run bcrypt: no timing leak
  const ok = await bcrypt.compare(password, hash);
  if (!rows.length || !ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (rows[0].is_blocked) return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
  const { password_hash, is_blocked, ...user } = rows[0];
  res.json({ token: signToken(user), user });
}));

app.get('/api/auth/me', auth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ user: { id, name, email, role } });
});

// Requires the current password. Frontend must send { password } in the DELETE body.
app.delete('/api/auth/me', authLimiter, auth, async (req, res, next) => {
  let conn;
  try {
    const password = String(req.body?.password || '');
    const [u] = await pool.execute('SELECT password_hash FROM customers WHERE id=?', [req.user.id]);
    if (!u.length || !(await bcrypt.compare(password, u[0].password_hash)))
      return res.status(401).json({ error: 'Password is incorrect.' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]);
    await conn.execute('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id=?)', [req.user.id]);
    await conn.execute('DELETE FROM orders WHERE customer_id=?', [req.user.id]);
    const [r] = await conn.execute('DELETE FROM customers WHERE id=?', [req.user.id]);
    if (!r.affectedRows) { await conn.rollback(); return res.status(404).json({ error: 'Account not found.' }); }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { if (conn) await conn.rollback(); next(e); }
  finally { if (conn) conn.release(); }
});

app.post('/api/auth/forgot-password', resetLimiter, wrap(async (req, res) => {
  const email = cleanText(req.body.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Valid email required' });
  const GENERIC = { message: 'If an account exists, a reset link has been sent to your email (check inbox & spam).' };

  const [users] = await pool.execute('SELECT id,email,name FROM customers WHERE email=?', [email]);
  if (!users.length) return res.json(GENERIC);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token); // only the hash is stored
  const expires = new Date(Date.now() + 3600000);
  await pool.execute(
    'INSERT INTO password_resets (email, token, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE token=?, expires_at=?',
    [email, tokenHash, expires, tokenHash, expires]);

  const resetLink = `${FRONTEND_URL}?reset_token=${token}`;
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
            <p style="margin:0 0 20px 0;color:#666;font-size:14px;line-height:22px">Hi ${escapeHtml(users[0].name)},<br/>We received a request to reset your password. Click below — expires in <b>1 hour</b>.</p>
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
  const result = await sendViaResend({ to: email, subject: 'Urban Cart - Reset Your Password (1h expiry)', html });
  if (result && !result.ok) console.error('Reset email failed:', result.error);
  res.json(GENERIC);
}));

app.post('/api/auth/reset-password', authLimiter, wrap(async (req, res) => {
  const token = String(req.body.token || '');
  const newPassword = String(req.body.newPassword || '');
  if (!/^[a-f0-9]{64}$/.test(token) || newPassword.length < 8 || Buffer.byteLength(newPassword) > 72)
    return res.status(400).json({ error: 'Valid token and password (8-72 chars) required' });
  const [rows] = await pool.execute('SELECT email, expires_at FROM password_resets WHERE token=?', [sha256(token)]);
  if (!rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
  if (new Date(rows[0].expires_at) < new Date()) {
    await pool.execute('DELETE FROM password_resets WHERE email=?', [rows[0].email]);
    return res.status(400).json({ error: 'Token expired, request a new link' });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.execute('UPDATE customers SET password_hash=? WHERE email=?', [hash, rows[0].email]);
  await pool.execute('DELETE FROM password_resets WHERE email=?', [rows[0].email]);
  res.json({ message: 'Password reset successful, you can now sign in.' });
}));

/* ================= PHONE OTP (requires sign-in; token bound to user + phone) ================= */
app.post('/api/auth/send-phone-otp', otpSendLimiter, auth, wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!isValidSAnumber(phone)) return res.status(400).json({ error: 'Enter a valid SA number like 0821234567' });

  const otp = generateOTP();
  await storeOtp(pool, phone, otp);

  try {
    const sent = await sendSms(phone, `Your Urban Cart OTP is ${otp}. It expires in 5 minutes.`);
    console.log('[OTP] phone:', phone, 'otp:', otp, 'sent:', sent);
    // If no SMS provider, return the code so you can test checkout NOW
    // In sandbox, AT never delivers to a real phone, so show the code for testing
    const isSandbox = (process.env.AT_BASE_URL || '').includes('sandbox');
    if (!sent || isSandbox) return res.json({ ok: true, message: 'OTP sent (check SMS / logs)', debug_otp: otp });
  } catch (e) {
    console.error('[SMS] send failed:', e.message);
    console.log('[OTP DEBUG] phone:', phone, 'otp:', otp);
    return res.json({ ok: true, message: 'OTP sent (check SMS / logs)', debug_otp: otp });
  }
  res.json({ ok: true, message: 'OTP sent' });
}));

app.post('/api/auth/verify-phone-otp', otpVerifyLimiter, auth, wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = String(req.body.otp || '').trim();
  if (!isValidSAnumber(phone) || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter a valid phone and 6-digit code' });
  const result = await checkOtp(pool, phone, otp);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, message: 'Phone verified', phoneVerifiedToken: signPhoneToken(phone, req.user.id) });
}));

/* ================= CART ================= */
const cartSelect = `SELECT c.product_id, c.quantity, c.selected_size, c.selected_color, p.name, p.price, p.sale_price, p.on_sale, p.image_url FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.updated_at DESC`;

app.get('/api/cart/mine', auth, wrap(async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT c.product_id, c.quantity, c.selected_size, c.selected_color, p.name, p.description, p.price, p.sale_price, p.on_sale, p.image_url, p.stock, p.is_active, cat.name AS category
    FROM carts c JOIN products p ON p.id=c.product_id LEFT JOIN categories cat ON cat.id=p.category_id
    WHERE c.user_id=? ORDER BY c.updated_at DESC`, [req.user.id]);
  res.json(rows);
}));

app.post('/api/cart', auth, wrap(async (req, res) => {
  const product_id = asId(req.body.product_id || req.body.id);
  let quantity = Number(req.body.quantity || 1);
  const selected_size = cleanText(req.body.selectedSize || req.body.selected_size || req.body.size, 50);
  const selected_color = cleanText(req.body.selectedColor || req.body.selected_color || req.body.color, 50);
  if (!product_id) return res.status(400).json({ error: 'Invalid product.' });
  if (!Number.isInteger(quantity) || quantity < 1) quantity = 1;
  if (quantity > 99) quantity = 99;
  const [prod] = await pool.execute('SELECT id, stock, is_active, active FROM products WHERE id=?', [product_id]);
  if (!prod.length) return res.status(404).json({ error: 'Product not found.' });
  if (prod[0].stock < quantity || prod[0].is_active == 0 || prod[0].active == 0) return res.status(409).json({ error: 'Out of stock.' });
  await pool.execute(
    'INSERT INTO carts (user_id, product_id, quantity, selected_size, selected_color) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity = LEAST(99, quantity + VALUES(quantity))',
    [req.user.id, product_id, quantity, selected_size, selected_color]);
  const [rows] = await pool.execute(cartSelect, [req.user.id]);
  res.json(rows);
}));

app.patch('/api/cart/:productId', auth, wrap(async (req, res) => {
  const productId = asId(req.params.productId);
  const quantity = Number(req.body.quantity);
  const selected_size = cleanText(req.body.selectedSize || req.body.selected_size, 50);
  const selected_color = cleanText(req.body.selectedColor || req.body.selected_color, 50);
  if (!productId) return res.status(400).json({ error: 'Invalid product.' });
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Invalid quantity.' });
  if (quantity === 0) {
    await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=? AND selected_size=? AND selected_color=?', [req.user.id, productId, selected_size, selected_color]);
  } else {
    await pool.execute('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=? AND selected_size=? AND selected_color=?', [Math.min(99, quantity), req.user.id, productId, selected_size, selected_color]);
  }
  const [rows] = await pool.execute(cartSelect, [req.user.id]);
  res.json(rows);
}));

app.delete('/api/cart/:productId', auth, wrap(async (req, res) => {
  const size = cleanText(req.body?.selectedSize || req.body?.selected_size || req.query.selected_size || req.query.selectedSize, 50);
  const color = cleanText(req.body?.selectedColor || req.body?.selected_color || req.query.selected_color || req.query.selectedColor, 50);
  const pid = asId(req.params.productId);
  if (!pid) return res.status(400).json({ error: 'Invalid product.' });
  await pool.execute('DELETE FROM carts WHERE user_id=? AND product_id=? AND selected_size=? AND selected_color=?', [req.user.id, pid, size, color]);
  res.json({ ok: true });
}));

app.delete('/api/cart', auth, wrap(async (req, res) => {
  await pool.execute('DELETE FROM carts WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
}));

/* ================= ORDERS ================= */
app.post('/api/orders', orderLimiter, auth, async (req, res, next) => {
  let conn;
  try {
    const b = req.body || {};
    const finalFullName = cleanText(b.full_name || b.customer_name, 150);
    const finalEmail = cleanText(b.email, 254).toLowerCase();
    const finalPhone = normalizePhone(b.phone);
    const finalDeliveryAddress = cleanText(b.delivery_address || b.address, 255);
    const finalAddressSearch = cleanText(b.address_search, 255);
    const finalProvince = cleanText(b.province, 50).toUpperCase();
    const finalPostalCode = cleanText(b.postal_code, 10);
    const finalCity = cleanText(b.city, 100) || finalDeliveryAddress;

    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Cart is empty' });
    if (!finalFullName || !isEmail(finalEmail) || !finalPhone || !finalDeliveryAddress || !finalProvince || !finalPostalCode)
      return res.status(400).json({ error: 'Full Name, Email, SA Phone, Delivery Address, Province, Postal Code required.' });
    if (!isValidSAnumber(finalPhone)) return res.status(400).json({ error: 'Invalid SA phone' });
    if (!/^[0-9]{4}$/.test(finalPostalCode)) return res.status(400).json({ error: 'Postal code 4 digits' });

    if (PHONE_OTP_REQUIRED) {
      if (!b.phoneVerifiedToken) return res.status(400).json({ error: 'Please verify your phone number with OTP first' });
      if (!readPhoneToken(String(b.phoneVerifiedToken), finalPhone, req.user.id))
        return res.status(400).json({ error: 'Phone verification expired or invalid, please verify again' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const lines = [];
    let total = 0;
    for (const it of rawItems) {
      const pid = asId(it.id ?? it.product_id);
      const qty = asInt(it.quantity, 1, 99);
      if (!pid || !qty) throw httpErr(400, 'Invalid item in cart.');
      const [pr] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [pid]);
      const p = pr[0];
      if (!p || p.active === 0 || p.is_active === 0) throw httpErr(400, `Product ${pid} is unavailable.`);
      const [u] = await conn.query('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?', [qty, pid, qty]);
      if (!u.affectedRows) throw httpErr(409, `Not enough stock for ${p.name}.`);
      const price = (p.on_sale && p.sale_price) ? Number(p.sale_price) : Number(p.price); // price ALWAYS from DB
      total += price * qty;
      lines.push({ p, pid, qty, price, it });
    }
    total = money(total);
    if (!(total > 0)) throw httpErr(400, 'Invalid order total.');

    const initialHistory = JSON.stringify([{
      status: 'Order Placed',
      location: 'Warehouse - Lephalale',
      time: new Date().toISOString(),
      note: `Order confirmed for ${finalFullName}. Address: ${finalDeliveryAddress}, ${finalProvince} ${finalPostalCode}`
    }]);
    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, customer_name, full_name, email, phone, address, city, province, postal_code, address_search, delivery_address, total, status, payment_status, delivery_status, current_location, eta, tracking_history)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, finalFullName, finalFullName, finalEmail, finalPhone, finalDeliveryAddress, finalCity, finalProvince, finalPostalCode, finalAddressSearch, finalDeliveryAddress, total, 'pending', 'pending', 'Order Placed', 'Warehouse - Lephalale', '1-2 business days', initialHistory]);
    const orderId = orderResult.insertId;

    for (const { p, pid, qty, price, it } of lines) {
      const itemUnit = cleanText(it.unit || p.unit || 'none', 20);
      const rawUnitValue = it.unit_value || p.unit_value || null;
      const itemUnitValue = rawUnitValue ? cleanText(rawUnitValue, 20) : null;
      const itemSize = cleanText(it.selectedSize || it.selected_size || it.size, 50) || null;
      const itemColor = cleanText(it.selectedColor || it.selected_color || it.color, 50) || null;
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price, unit, unit_value, selected_size, selected_color) VALUES (?,?,?,?,?,?,?,?)',
        [orderId, pid, qty, price, itemUnit, itemUnitValue, itemSize, itemColor]);
    }
    await conn.commit();
    // Cart is cleared and total_spent credited only once PayFast confirms payment (see onOrderPaid)
    console.log(`NEW ORDER #${orderId} - R${total}`);
    res.json({ orderId, total });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch {} }
    next(err);
  } finally { if (conn) conn.release(); }
});

// Customer cancels their own unpaid order (e.g. after cancelling on PayFast)
app.post('/api/orders/:id/cancel', auth, wrap(async (req, res) => {
  const orderId = asId(req.params.id);
  if (!orderId) return res.status(400).json({ error: 'Invalid order' });
  const [rows] = await pool.query('SELECT status FROM orders WHERE id=? AND customer_id=?', [orderId, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  if (rows[0].status === 'cancelled') return res.json({ message: 'Order already cancelled' });
  // Conditional update: if PayFast confirmed payment in the meantime, this won't match
  const [r] = await pool.query(
    "UPDATE orders SET status='cancelled', payment_status='cancelled', delivery_status='Cancelled', cancel_reason='Customer cancelled on PayFast' WHERE id=? AND customer_id=? AND status='pending'",
    [orderId, req.user.id]);
  if (!r.affectedRows) return res.status(400).json({ error: 'Cannot cancel a paid/shipped order' });
  await restockOrder(orderId);
  res.json({ message: 'Order cancelled' });
}));

// Only the signed-in customer's own orders (no email matching: unverified emails must not grant access)
app.get('/api/orders/mine', auth, wrap(async (req, res) => {
  const [rows] = await pool.execute('SELECT id,total,status,payment_status,delivery_status,current_location,eta,tracking_history,delivery_address,province,postal_code,cancel_reason,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC', [req.user.id]);
  for (const r of rows) {
    const [items] = await pool.execute('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [r.id]);
    r.items = items;
    r.tracking_history = parseHist(r.tracking_history);
  }
  res.json(rows);
}));

app.get('/api/orders/my-orders', auth, wrap(async (req, res) => {
  const [rows] = await pool.execute('SELECT o.*, oi.quantity, oi.price, oi.selected_size, oi.selected_color, oi.unit, oi.unit_value, p.name, p.image_url, oi.product_id as oi_pid FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id WHERE o.customer_id=? ORDER BY o.created_at DESC', [req.user.id]);
  const map = {};
  rows.forEach(r => {
    if (!map[r.id]) map[r.id] = { id: r.id, total: r.total, status: r.status, payment_status: r.payment_status, delivery_status: r.delivery_status, current_location: r.current_location, eta: r.eta, tracking_history: r.tracking_history, delivery_address: r.delivery_address, province: r.province, postal_code: r.postal_code, cancel_reason: r.cancel_reason, created_at: r.created_at, items: [] };
    if (r.quantity) map[r.id].items.push({ product_id: r.oi_pid, name: r.name, image_url: r.image_url, quantity: r.quantity, price: r.price, selected_size: r.selected_size, selected_color: r.selected_color, unit: r.unit, unit_value: r.unit_value });
  });
  res.json(Object.values(map).map(o => { o.tracking_history = parseHist(o.tracking_history); return o; }));
}));

/* ================= ADMIN (all routes below are behind auth + adminOnly via app.use above) ================= */
app.get('/api/admin/stats', wrap(async (_req, res) => {
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
    GROUP BY p.id, p.name ORDER BY qty DESC LIMIT 10`);
  const [recent] = await pool.query(`SELECT id, customer_name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 8`);
  res.json({ today: todayRows[0], month: monthRows[0], total: totalRows[0], pending: pendingRows[0].cnt, failed: failedRows[0].cnt, best, recent });
}));

app.get('/api/admin/orders', wrap(async (_req, res) => {
  const [rows] = await pool.query(`SELECT o.*, c.name as customer_name_db, c.is_blocked FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 300`);
  for (const r of rows) {
    const [items] = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [r.id]);
    r.items = items;
    r.tracking_history = parseHist(r.tracking_history);
  }
  res.json(rows);
}));

app.get('/api/admin/users', wrap(async (_req, res) => {
  const [rows] = await pool.query(`SELECT id, name, email, phone, role, is_blocked, total_spent, created_at, (SELECT COUNT(*) FROM orders WHERE customer_id=customers.id) as order_count FROM customers ORDER BY created_at DESC LIMIT 500`);
  res.json(rows);
}));

app.patch('/api/admin/users/:id/block', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot block yourself' });
  const [u] = await pool.query('SELECT is_blocked FROM customers WHERE id=?', [id]);
  if (!u.length) return res.status(404).json({ error: 'User not found' });
  const newVal = u[0].is_blocked ? 0 : 1;
  await pool.execute('UPDATE customers SET is_blocked=? WHERE id=?', [newVal, id]);
  console.log(`ADMIN AUDIT: user ${req.user.id} set is_blocked=${newVal} on user ${id}`);
  res.json({ ok: true, is_blocked: !!newVal });
}));

app.patch('/api/admin/users/:id/unblock', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  await pool.execute('UPDATE customers SET is_blocked=0 WHERE id=?', [id]);
  res.json({ ok: true });
}));

app.patch('/api/admin/users/:id/role', wrap(async (req, res) => {
  const { role } = req.body;
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (!['admin', 'customer', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'You cannot demote yourself' });
  await pool.execute('UPDATE customers SET role=? WHERE id=?', [role, id]);
  console.log(`ADMIN AUDIT: user ${req.user.id} set role=${role} on user ${id}`);
  res.json({ ok: true, role });
}));

/* ----- products (admin) ----- */
async function parseProductBody(body = {}) {
  const name = cleanText(body.name, 200);
  const price = Number(body.price);
  const stock = Number(body.stock ?? 0);
  const saleRaw = body.sale_price;
  const sale = (saleRaw === null || saleRaw === undefined || saleRaw === '' || Number(saleRaw) === 0) ? null : Number(saleRaw);
  const image_url = String(body.image_url || '').trim();
  if (!name) throw httpErr(400, 'Product name is required.');
  if (!Number.isFinite(price) || price < 0 || price > 1e7) throw httpErr(400, 'Invalid price.');
  if (sale !== null && (!Number.isFinite(sale) || sale < 0 || sale > 1e7)) throw httpErr(400, 'Invalid sale price.');
  if (!Number.isInteger(stock) || stock < 0 || stock > 1e6) throw httpErr(400, 'Invalid stock.');
  if (!isSafeImage(image_url)) throw httpErr(400, 'Invalid image URL.');
  let images = null;
  if (Array.isArray(body.images)) {
    images = body.images.slice(0, 10).map(u => String(u || '').trim());
    if (!images.every(isSafeImage)) throw httpErr(400, 'Invalid image URL in images.');
  }
  const catId = body.category_id ? Number(body.category_id) : await getCategoryId(body.category);
  return {
    name, price: money(price), sale: sale !== null ? money(sale) : null, stock, image_url, images, catId,
    description: multiline(body.description, 5000),
    colors: body.colors ? cleanText(body.colors, 500) : null,
    on_sale: body.on_sale ? 1 : 0,
    is_bestseller: body.is_bestseller ? 1 : 0,
    unit: cleanText(body.unit || 'none', 20) || 'none',
    unit_value: body.unit_value ? cleanText(body.unit_value, 20) : null
  };
}

app.post('/api/admin/products', wrap(async (req, res) => {
  const d = await parseProductBody(req.body);
  const { active = 1, is_active = true } = req.body || {};
  const [r] = await pool.execute(
    'INSERT INTO products(name,description,price,sale_price,colors,on_sale,is_bestseller,stock,category_id,active,is_active,image_url,unit,unit_value) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [d.name, d.description, d.price, d.sale, d.colors, d.on_sale, d.is_bestseller, d.stock, d.catId, active ? 1 : 0, is_active ? 1 : 0, d.image_url, d.unit, d.unit_value]);
  const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.unit,p.unit_value,p.price,p.sale_price,p.colors,p.on_sale,p.is_bestseller,p.stock,p.image_url,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [r.insertId]);
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/products/:id', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const d = await parseProductBody(req.body);
  let { is_active = true, active } = req.body || {};
  if (active === undefined) active = is_active ? 1 : 0;
  const [r] = await pool.execute(
    'UPDATE products SET name=?, description=?, price=?, sale_price=?, colors=?, on_sale=?, is_bestseller=?, image_url=?, images=?, stock=?, category_id=?, active=?, is_active=?, unit=?, unit_value=? WHERE id=?',
    [d.name, d.description, d.price, d.sale, d.colors, d.on_sale, d.is_bestseller, d.image_url, d.images ? JSON.stringify(d.images) : null, d.stock, d.catId, active ? 1 : 0, is_active ? 1 : 0, d.unit, d.unit_value, id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
  const [rows] = await pool.query('SELECT p.id,p.name,p.description,p.unit,p.unit_value,p.price,p.sale_price,p.colors,p.on_sale,p.is_bestseller,p.image_url,p.images,p.stock,p.active,p.is_active,c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?', [id]);
  res.json(rows[0]);
}));

app.delete('/api/admin/products/:id', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [r] = await pool.execute('DELETE FROM products WHERE id=?', [id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true, id });
}));

app.put('/api/admin/products/:id/bestseller', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  await pool.execute('UPDATE products SET is_bestseller = 0');
  await pool.execute('UPDATE products SET is_bestseller = 1 WHERE id = ?', [id]);
  res.json({ ok: true });
}));

/* ----- orders (admin) ----- */
app.patch('/api/admin/orders/:id/status', wrap(async (req, res) => {
  const status = String(req.body.status || '').toLowerCase().trim();
  if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const cancel_reason = cleanText(req.body.cancel_reason, 500) || null;
  const refund_reason = cleanText(req.body.refund_reason || req.body.reason, 500) || null;

  const [existing] = await pool.query('SELECT status, tracking_history FROM orders WHERE id=?', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Order not found.' });
  const prev = existing[0].status;

  const deliveryMap = { pending: 'Order Placed', paid: 'Paid - Processing', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', refund_pending: 'Refund Pending', failed: 'Payment Failed' };
  const delivery_status = deliveryMap[status] || status;
  const payment_status = status === 'failed' ? 'failed' : status === 'paid' ? 'paid' : status === 'cancelled' ? 'cancelled' : status === 'refunded' ? 'refunded' : 'pending';

  const hist = parseHist(existing[0].tracking_history);
  hist.push({ status: delivery_status, location: 'Admin Panel', time: new Date().toISOString(), note: cancel_reason || refund_reason || `Status changed to ${delivery_status}` });

  const sets = ['status=?', 'delivery_status=?', 'payment_status=?', 'tracking_history=?'];
  const params = [status, delivery_status, payment_status, JSON.stringify(hist)];
  if (status === 'cancelled') { sets.push('cancel_reason=?'); params.push(cancel_reason); }
  if (status === 'refunded' || status === 'refund_pending') { sets.push('refund_reason=?', 'refunded_at=NOW()'); params.push(refund_reason || 'Admin refund'); }
  params.push(id);
  await pool.execute(`UPDATE orders SET ${sets.join(', ')} WHERE id=?`, params);

  const dead = ['cancelled', 'refunded'];
  if (dead.includes(status) && !dead.includes(prev)) await restockOrder(id);
  if (status === 'paid' && prev !== 'paid') await onOrderPaid(id);
  console.log(`ADMIN AUDIT: user ${req.user.id} changed order ${id} ${prev} -> ${status}`);
  res.json({ ok: true, status, delivery_status });
}));

app.post('/api/admin/orders/:id/refund', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const reason = cleanText(req.body.reason || req.body.refund_reason || 'Admin issued refund', 500);
  const [order] = await pool.query('SELECT status FROM orders WHERE id=?', [id]);
  if (!order.length) return res.status(404).json({ error: 'Order not found' });
  const alreadyDead = ['cancelled', 'refunded'].includes(order[0].status);
  await pool.execute("UPDATE orders SET status='refunded', payment_status='refunded', delivery_status='Refunded', refund_reason=?, refunded_at=NOW() WHERE id=?", [reason, id]);
  if (!alreadyDead) await restockOrder(id); // never restock the same order twice
  console.log(`ADMIN AUDIT: user ${req.user.id} refunded order ${id}`);
  res.json({ ok: true, message: alreadyDead ? 'Marked refunded (stock was already restored)' : 'Refunded and restocked' });
}));

async function appendTracking(req, res, { allowStatusCode }) {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const delivery_status = cleanText(req.body.delivery_status, 80) || 'Updated';
  const current_location = cleanText(req.body.current_location, 120) || 'Warehouse - Lephalale';
  const eta = cleanText(req.body.eta, 80) || '1-2 business days';
  const tracking_note = cleanText(req.body.tracking_note, 500);
  const [existing] = await pool.query('SELECT tracking_history FROM orders WHERE id=?', [id]);
  if (!existing.length) return res.status(404).json({ error: 'Order not found.' });
  const hist = parseHist(existing[0].tracking_history);
  hist.push({ status: delivery_status, location: current_location, eta, note: tracking_note, time: new Date().toISOString() });

  const code = String((allowStatusCode ? req.body.delivery_status_code : null) ?? req.body.status ?? '').toLowerCase();
  let sql = 'UPDATE orders SET delivery_status=?, current_location=?, eta=?, tracking_history=?';
  const params = [delivery_status, current_location, eta, JSON.stringify(hist)];
  if (code && ALLOWED_STATUS.includes(code)) { sql += ', status=?'; params.push(code); }
  sql += ' WHERE id=?'; params.push(id);
  await pool.execute(sql, params);
  res.json({ ok: true, history: hist });
}
app.put('/api/admin/orders/:id', wrap((req, res) => appendTracking(req, res, { allowStatusCode: true })));
app.put('/api/admin/orders/:id/tracking', wrap((req, res) => appendTracking(req, res, { allowStatusCode: false })));

app.get('/api/admin/orders/:id/invoice', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [orders] = await pool.query('SELECT * FROM orders WHERE id=?', [id]);
  if (!orders.length) return res.status(404).json({ error: 'Not found' });
  const [items] = await pool.query('SELECT oi.*, p.name, p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [id]);
  res.json({ order: orders[0], items });
}));

app.post('/api/admin/orders/:id/send-delivery-note', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [orders] = await pool.query('SELECT * FROM orders WHERE id=?', [id]);
  if (!orders.length) return res.status(404).json({ error: 'Order not found' });
  const [items] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [id]);
  const result = await sendDeliveryNoteEmail(orders[0], items);
  if (result.ok) return res.json({ ok: true, message: `Delivery Note #${id} emailed to ${ADMIN_EMAIL} with PDF attached.` });
  const msg = result.reason === 'not_configured' ? 'Email is not configured (set RESEND_API_KEY or SMTP_USER/SMTP_PASS).' : 'Email failed - check server logs.';
  res.status(500).json({ error: msg });
}));

app.get('/api/admin/orders/:id/delivery-pdf', wrap(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const [orders] = await pool.query('SELECT * FROM orders WHERE id=?', [id]);
  if (!orders.length) return res.status(404).json({ error: 'Not found' });
  const [items] = await pool.query('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?', [id]);
  const buffer = await generateDeliveryPdfBuffer(orders[0], items);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=DELIVERY-${id}.pdf`);
  res.send(buffer);
}));

// NOTE: the old /api/admin/test-email route was removed on purpose.

/* ================= PAYFAST CHECKOUT ================= */
function generateSignature(data, passphrase) {
  const keys = Object.keys(data).filter(k => k !== 'signature' && data[k] !== '' && data[k] !== null && data[k] !== undefined).sort();
  let pfOutput = '';
  for (const key of keys) {
    pfOutput += `${key}=${encodeURIComponent(String(data[key]).trim()).replace(/%20/g, '+')}&`;
  }
  let getString = pfOutput.slice(0, -1);
  if (passphrase && String(passphrase).trim() !== '') {
    getString += `&passphrase=${encodeURIComponent(String(passphrase).trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(getString).digest('hex');
}

app.post('/api/payfast/checkout', auth, wrap(async (req, res) => {
  const orderId = asId(req.body.orderId);
  if (!orderId) return res.status(400).json({ error: 'Invalid order.' });
  // Only the order's owner can start payment for it
  const [rows] = await pool.execute('SELECT id,email,customer_name,full_name,total,status,delivery_address,province FROM orders WHERE id=? AND customer_id=?', [orderId, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found.' });
  const order = rows[0];
  if (order.status !== 'pending') return res.status(409).json({ error: 'This order is no longer pending.' });
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  if (!merchantId || !merchantKey) return res.status(503).json({ error: 'PayFast is not configured yet.' });
  const apiUrl = (process.env.API_URL || 'https://urban-cart-ecommerce.onrender.com').replace(/\/$/, '');
  const fullName = order.full_name || order.customer_name || 'Customer';
  const pfData = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${FRONTEND_URL}/?payment=return&order=${order.id}`,
    cancel_url: `${FRONTEND_URL}/?payment=cancel&order=${order.id}`,
    notify_url: `${apiUrl}/api/payfast/notify`,
    name_first: String(fullName).split(' ')[0].slice(0, 100) || 'Customer',
    name_last: String(fullName).split(' ').slice(1).join(' ').slice(0, 100) || 'Customer',
    email_address: order.email,
    m_payment_id: String(order.id),
    amount: Number(order.total).toFixed(2),
    item_name: `Urban Cart Order #${order.id}`.slice(0, 100),
    item_description: `Delivery to ${order.delivery_address || ''}, ${order.province || ''}`.slice(0, 255)
  };
  
  console.log('PF CHECKOUT', { sandbox: process.env.PAYFAST_SANDBOX, merchant_id: merchantId, amount: pfData.amount, notify_url: pfData.notify_url, return_url: pfData.return_url });
  
  pfData.signature = generateSignature(pfData, process.env.PAYFAST_PASSPHRASE);
  res.json({
    action: process.env.PAYFAST_SANDBOX === 'true' ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process',
    fields: pfData
  });
}));

/* ================= ERRORS + START ================= */
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  // Deliberate client errors (validation, stock, bad JSON, payload too large) keep their message
  if (err && err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  return errorHandler(err, req, res, next); // everything else: generic message in production
});

const port = Number(process.env.PORT || 10000);
app.listen(port, () => console.log(`Urban Cart API listening on port ${port}`));