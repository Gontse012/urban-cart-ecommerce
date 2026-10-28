# Urban Cart — Full-stack e-commerce starter

A responsive dark-themed general online shop starter for South Africa. Frontend: React + Vite. Backend: Node.js + Express. Database: MySQL. Currency: ZAR. Hosted payment hand-off: PayFast scaffold.

## Features included
- Responsive homepage, search and category filtering
- Product catalogue loaded from MySQL API (with sample display fallback)
- Shopping bag with quantity updates and local persistence
- Customer registration/login with bcrypt password hashes and JWT
- MySQL-backed order creation with server-side price/stock checks and transaction locks
- Customer order history
- Admin order list/status update and product-create API
- PayFast hosted-checkout form generation scaffold
- South African address fields and ZAR formatting

## Requirements
- Node.js 20+ recommended
- MySQL 8+ (MySQL Workbench is fine)
- A PayFast merchant account for real payment testing; sandbox credentials first

## 1. Create the database
1. Open MySQL Workbench and connect to your local MySQL server.
2. Open `server/schema.sql` and execute the full script. It creates `urban_cart`, the tables, categories and sample products.

## 2. Configure the API
In a terminal, from the project root:

```bash
cp server/.env.example server/.env
```

On Windows PowerShell, use:

```powershell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set your MySQL username/password, a long random `JWT_SECRET`, and the PayFast values when you are ready. Keep `.env` private and never commit it. Do not use the example JWT secret outside local development.

## 3. Install dependencies

```bash
npm install
npm install --prefix server
npm install --prefix client
```

Or use `npm run install:all` from the root.

## 4. Start the app

```bash
npm run dev
```

Open `http://localhost:5173`. The API is at `http://localhost:4000/api/health`.

If MySQL is unavailable, the shop UI still shows sample products, but account/order/API features need the database connection to work.

## 5. Create an admin account (local development)

1. Register a normal account in the UI.
2. In MySQL Workbench, promote that account explicitly:

```sql
USE urban_cart;
UPDATE customers SET role = 'admin' WHERE email = 'your-email@example.com';
```

3. Sign out and sign in again so the new role is included in the JWT. The account menu then offers the order dashboard.

Do not expose admin account creation or role changes to public users. In production, use a controlled admin provisioning process.

## PayFast setup — important

The checkout API builds a hosted-checkout form and redirects to PayFast sandbox by default. Set `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` (if configured in your PayFast account), and test with sandbox credentials first. `PAYFAST_SANDBOX=true` selects the sandbox URL; set it to `false` only for verified production configuration.

**This repository is not production-ready for accepting live payments yet.** The PayFast ITN/notify route deliberately returns HTTP 501 and does not mark orders paid. Before going live, implement and test PayFast's current ITN verification process (signature, source IP, merchant identity, payment amount and order reference), use a public HTTPS `notify_url`, handle duplicate notifications idempotently, and reconcile payment status on the server. A browser return URL is not proof of payment. For local testing, PayFast cannot reach `localhost`; use a secure public staging URL/tunnel for notifications and configure `STORE_URL` accordingly. Review PayFast's current official integration documentation before enabling live transactions.

The order is recorded before redirecting to PayFast. If checkout configuration fails, the order can remain pending; inspect it in MySQL and decide how to handle abandoned orders before production. The sample implementation reduces stock when an order is created, not when payment is confirmed; production inventory should reserve/release stock based on verified payment and timeout/cancellation rules.

## Production checklist
- Add verified PayFast ITN and idempotent payment-state transitions before live payments.
- Add rate limiting, robust input validation, CSRF strategy where relevant, password reset, email verification, logging and monitoring.
- Add shipping/delivery pricing, tax/accounting requirements, returns/privacy/terms pages and customer support details.
- Review image licensing and replace demo Unsplash images with assets you can use commercially.
- Add pagination and stronger admin product editing/deactivation endpoints.
- Deploy frontend and API to HTTPS hosting, use managed MySQL backups, set environment variables in the hosting dashboard, and restrict database network access.
- Configure a real production `CLIENT_URL`, `STORE_URL`, and PayFast notify endpoint.

## API overview
- `GET /api/health`
- `GET /api/products?q=&category=`
- `GET /api/categories`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `POST /api/orders`
- `GET /api/orders/mine` (Bearer token)
- `POST /api/payfast/checkout`
- `GET /api/admin/orders` (admin token)
- `POST /api/admin/products` (admin token)
- `PATCH /api/admin/orders/:id/status` (admin token)

## Project structure

```text
urban-cart/
├── package.json
├── README.md
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── schema.sql
│   └── src.js
└── client/
    ├── index.html
    ├── package.json
    └── src/
        ├── main.jsx
        └── styles.css
```
