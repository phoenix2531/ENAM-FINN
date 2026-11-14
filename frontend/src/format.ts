const IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const IN1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

export const cr = (v: number | null | undefined) =>
  v == null ? '–' : `${v < 0 ? '−' : ''}₹${Math.abs(v) >= 100000 ? `${IN1.format(Math.abs(v) / 100000)}L` : IN.format(Math.abs(v))} cr`
export const num = (v: number | null | undefined, d = 0) =>
  v == null ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v)
export const pct = (v: number | null | undefined, d = 1) =>
  v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`
export const sign = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '')

export function ago(iso: string, now: Date): string {
  const t = new Date(iso).getTime()
  const h = (now.getTime() - t) / 3.6e6
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`
  if (h < 24) return `${Math.round(h)}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

export const initials = (name: string) =>
  name.replace(/^(Dr|Capt|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export const CATEGORY_LABEL: Record<string, string> = {
  results: 'Results', 'M&A': 'M&A', fund_raise: 'Fund raise', management_change: 'Management',
  litigation: 'Legal / regulatory', insider_trading: 'Insider trade', earnings_call: 'Earnings call',
  investor_meetings: 'Investor meet', credit_rating: 'Credit rating', dividend: 'Dividend',
  bonus_split: 'Bonus / split', capex: 'Capex', press_release: 'Press release', postal_ballot: 'Postal ballot',
  agm_egm: 'AGM / EGM', pledging: 'Pledge', unclassified: 'Routine',
}

export const pdfPage = (url: string, page?: number) => (page ? `${url.split('#')[0]}#page=${page}` : url)
