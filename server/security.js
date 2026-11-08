// security.js - drop-in hardening helpers for Urban Cart API
// npm i express-rate-limit
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

/* ---------- 1. ENV VALIDATION (fail fast, no insecure fallbacks) ---------- */
export function requireEnv(names) {
  const missing = names.filter(n => !process.env[n] || !String(process.env[n]).trim());
  if (missing.length) {
    console.error('FATAL: missing env vars: ' + missing.join(', '));
    process.exit(1);
  }
  if (String(process.env.JWT_SECRET).length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
}

export const IS_PROD = process.env.NODE_ENV === 'production';

/* ---------- 2. CORS (exact origins only - no *.vercel.app wildcard) ---------- */
const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

export const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);            // curl / server-to-server (PayFast ITN)
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(null, false);                        // browser blocked, no stack trace
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
  // credentials intentionally omitted: you use Bearer tokens, not cookies
};

/* ---------- 3. RATE LIMITERS ---------- */
const json429 = msg => (_req, res) => res.status(429).json({ error: msg });
const mk = (windowMs, limit, msg, keyGenerator) =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false,
              handler: json429(msg), ...(keyGenerator ? { keyGenerator } : {}) });

export const globalLimiter = mk(15 * 60e3, 300, 'Too many requests, slow down.');
export const authLimiter   = mk(15 * 60e3, 10,  'Too many attempts, try again in 15 minutes.');
export const resetLimiter  = mk(60 * 60e3, 5,   'Too many reset requests, try again later.');
export const otpSendLimiter = mk(10 * 60e3, 3,  'Too many OTP requests, wait 10 minutes.',
  req => `${req.ip}|${normalizePhone(req.body?.phone)}`);
export const otpVerifyLimiter = mk(15 * 60e3, 10, 'Too many OTP attempts.');
export const orderLimiter  = mk(60 * 60e3, 20,  'Too many orders, try again later.');
export const reviewLimiter = mk(60 * 60e3, 10,  'Too many reviews, try again later.');

/* ---------- 4. AUTH (HS256 pinned, DB-checked role and block status) ---------- */
const JWT_OPTS = { algorithms: ['HS256'], issuer: 'urban-cart' };

export const signToken = user => jwt.sign(
  { id: user.id, name: user.name, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', issuer: 'urban-cart', expiresIn: '2h' }
);

export function makeAuth(pool) {
  return async (req, res, next) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Please sign in again.' });
    let user;
    try {
      const p = jwt.verify(m[1], process.env.JWT_SECRET, JWT_OPTS);
      // Re-read role/blocked from DB so demotions and blocks apply immediately
      const [rows] = await pool.execute(
        'SELECT id,name,email,role,is_blocked FROM customers WHERE id=?', [p.id]);
      if (!rows.length) return res.status(401).json({ error: 'Please sign in again.' });
      if (rows[0].is_blocked) return res.status(403).json({ error: 'Account blocked.' });
      user = rows[0];
    } catch {
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    req.user = user;
    next();
  };
}

export const adminOnly = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' });

// Wrap async handlers so a thrown error reaches the error middleware (Express 4)
export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- 5. INPUT HELPERS ---------- */
export function normalizePhone(phone) {
  let p = String(phone || '').replace(/[\s-]/g, '');
  if (p.startsWith('+27')) p = '0' + p.slice(3);
  else if (p.startsWith('27')) p = '0' + p.slice(2);
  return p;
}
export const isValidSAnumber = phone => /^0[6-8][0-9]{8}$/.test(normalizePhone(phone));

export const isEmail = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const cleanText = (v, max = 255) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

export const asInt = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export const isHttpUrl = u => {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; }
  catch { return false; }
};

// Use for EVERY value interpolated into HTML emails
export const escapeHtml = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- 6. OTP (crypto RNG, hashed at rest, attempt-limited) ---------- */
export const generateOTP = () => String(crypto.randomInt(100000, 1000000));
export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const hashOtp = (phone, otp) => sha256(`${process.env.JWT_SECRET}|${phone}|${otp}`);

// Schema: ALTER TABLE phone_otps ADD COLUMN attempts TINYINT NOT NULL DEFAULT 0;
export async function storeOtp(pool, phone, otp) {
  await pool.execute('DELETE FROM phone_otps WHERE phone=?', [phone]);
  await pool.execute(
    'INSERT INTO phone_otps (phone, otp, expires_at) VALUES (?,?,?)',
    [phone, hashOtp(phone, otp), new Date(Date.now() + 5 * 60e3)]);
}

export async function checkOtp(pool, phone, otp) {
  const [rows] = await pool.execute(
    'SELECT id, otp, expires_at, attempts FROM phone_otps WHERE phone=? AND verified=0 ORDER BY id DESC LIMIT 1',
    [phone]);
  if (!rows.length) return { ok: false, error: 'Request a new OTP.' };
  const r = rows[0];
  if (new Date(r.expires_at) < new Date()) return { ok: false, error: 'OTP expired, request a new one.' };
  if (r.attempts >= 5) return { ok: false, error: 'Too many wrong attempts, request a new OTP.' };
  const a = Buffer.from(r.otp), b = Buffer.from(hashOtp(phone, otp));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await pool.execute('UPDATE phone_otps SET attempts=attempts+1 WHERE id=?', [r.id]);
    return { ok: false, error: 'Invalid OTP.' };
  }
  await pool.execute('UPDATE phone_otps SET verified=1 WHERE id=?', [r.id]);
  return { ok: true };
}

export const signPhoneToken = (phone, userId) => jwt.sign(
  { phone, uid: userId, purpose: 'phone-verified' }, process.env.JWT_SECRET,
  { algorithm: 'HS256', issuer: 'urban-cart', expiresIn: '30m' });

export function readPhoneToken(token, phone, userId) {
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET, JWT_OPTS);
    return d.purpose === 'phone-verified' && d.phone === normalizePhone(phone) && d.uid === userId;
  } catch { return false; }
}

/* ---------- 7. PAYFAST ITN VERIFICATION (the 4 checks PayFast requires) ---------- */
const pfEncode = v => encodeURIComponent(String(v).trim()).replace(/%20/g, '+');

function pfSignature(body, passphrase) {
  const { signature, ...rest } = body;               // ITN: keep fields in received order
  let s = Object.entries(rest).map(([k, v]) => `${k}=${pfEncode(v)}`).join('&');
  if (passphrase) s += `&passphrase=${pfEncode(passphrase)}`;
  return { s, sig: crypto.createHash('md5').update(s).digest('hex'), given: String(signature || '') };
}

async function pfIpOk(ip) {
  const hosts = ['www.payfast.co.za', 'sandbox.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za'];
  const ips = new Set();
  for (const h of hosts) { try { (await dns.resolve4(h)).forEach(i => ips.add(i)); } catch {} }
  return ips.has(String(ip).replace('::ffff:', ''));
}

/**
 * Returns { ok, reason }. Call BEFORE marking any order paid.
 * expectedAmount = order.total from YOUR database (never from the request).
 */
export async function verifyPayfastItn({ body, ip, expectedAmount, sandbox, passphrase }) {
  const { s, sig, given } = pfSignature(body, passphrase);
  if (sig.length !== given.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(given)))
    return { ok: false, reason: 'bad signature' };
  if (!(await pfIpOk(ip))) return { ok: false, reason: 'ip not from PayFast' };
  if (Math.abs(Number(body.amount_gross) - Number(expectedAmount)) > 0.01)
    return { ok: false, reason: 'amount mismatch' };
  const host = sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
  const r = await fetch(`https://${host}/eng/query/validate`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: s
  });
  if ((await r.text()).trim() !== 'VALID') return { ok: false, reason: 'server validation failed' };
  return { ok: true };
}

/* ---------- 8. ERROR HANDLER (no internals leaked in production) ---------- */
export function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ECONNREFUSED')
    return res.status(503).json({ error: 'Service temporarily unavailable.' });
  res.status(500).json({ error: IS_PROD ? 'Something went wrong.' : String(err.message) });
}
