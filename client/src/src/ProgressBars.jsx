import React from 'react';
import './progress-bars.css';

const FREE_AT = 1000;
const money = n => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(Number(n || 0));

/* Free-delivery progress: use in the bag and at checkout */
export function FreeDeliveryBar({ total, threshold = FREE_AT }) {
  const t = Number(total || 0);
  const left = Math.max(0, threshold - t);
  const pct = Math.min(100, Math.round((t / threshold) * 100));
  return (
    <div className="pbar-wrap">
      <div className="pbar-label">
        {left > 0 ? <>Add <b>{money(left)}</b> more for FREE delivery</> : <b>FREE delivery unlocked</b>}
      </div>
      <div
        className={'pbar' + (pct >= 100 ? ' done' : '')}
        role="progressbar"
        aria-label="Progress to free delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="pbar-fill" style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

/* Order tracking progress: Placed > Paid > Processing > Shipped > Delivered */
const TRACK_STEPS = ['Placed', 'Paid', 'Processing', 'Shipped', 'Delivered'];

function trackStep(o) {
  const s = String(o.status || '').toLowerCase();
  if (s === 'delivered') return 4;
  if (s === 'shipped') return 3;
  if (s === 'processing') return 2;
  if (s === 'paid' || o.payment_status === 'paid') return 1;
  return 0;
}

export function TrackProgress({ order }) {
  if (!order || ['cancelled', 'refunded', 'refund_pending', 'failed'].includes(order.status)) return null;
  const step = trackStep(order);
  const pct = (step / (TRACK_STEPS.length - 1)) * 100;
  return (
    <div
      className="track-progress"
      role="progressbar"
      aria-label="Order progress"
      aria-valuemin={0}
      aria-valuemax={TRACK_STEPS.length - 1}
      aria-valuenow={step}
      aria-valuetext={TRACK_STEPS[step]}
    >
      <div className="track-line"><div className="track-line-fill" style={{ width: pct + '%' }} /></div>
      <ol className="track-steps">
        {TRACK_STEPS.map((s, i) => (
          <li key={s} className={i <= step ? 'done' : ''}><span className="dot" />{s}</li>
        ))}
      </ol>
    </div>
  );
}

/* Thin bar at the very top of the page while something is loading */
export function TopLoader({ active }) {
  if (!active) return null;
  return <div className="top-loader" aria-hidden="true"><span /></div>;
}

/* Full-page message while the browser is handed over to PayFast */
export function RedirectOverlay({ active }) {
  if (!active) return null;
  return (
    <div className="redirect-overlay" role="alertdialog" aria-live="assertive" aria-label="Redirecting to PayFast">
      <div className="redirect-card">
        <b>Taking you to PayFast...</b>
        <p>Please don't close or refresh this page.</p>
        <div className="pbar"><div className="pbar-fill pbar-indeterminate" /></div>
      </div>
    </div>
  );
}
