/** Number formats for the terminal UI. Minus is U+2212 so signed columns align in mono. */
const fin = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
const MINUS = '−';

/** ₹46.5L, ₹1.24Cr, $12.4K. Two significant decimals below 100 units, one above. */
export function inr(v: any, { signed = false, currency = 'INR' }: { signed?: boolean; currency?: string } = {}) {
  if (!fin(v)) return '—';
  const sign = v < 0 ? MINUS : signed && v > 0 ? '+' : '';
  const a = Math.abs(v);
  const sym = currency === 'USD' ? '$' : '₹';
  if (currency === 'USD') {
    if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e4) return `${sign}${sym}${(a / 1e3).toFixed(1)}K`;
    return `${sign}${sym}${a.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (a >= 1e7) return `${sign}${sym}${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `${sign}${sym}${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${sign}${sym}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${a.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** A per-share price: full precision, grouped for the currency. */
export function px(v: any, currency = 'INR') {
  if (!fin(v)) return '—';
  return (currency === 'USD' ? '$' : '₹') + v.toLocaleString(currency === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(v: any, { signed = true, digits = 1 }: { signed?: boolean; digits?: number } = {}) {
  if (!fin(v)) return '—';
  const sign = v < 0 ? MINUS : signed && v > 0 ? '+' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function qty(v: any) {
  if (!fin(v)) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: v % 1 ? 4 : 0 });
}

export const tone = (v: any) => (!fin(v) || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-gain' : 'text-loss');
export const symbol = (ticker: string) => String(ticker || '').replace(/\.(NS|BO)$/, '');
