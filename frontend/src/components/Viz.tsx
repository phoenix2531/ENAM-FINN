// Small shared visual pieces. No chart library: every mark is deliberate.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { pct, sign } from '../format'
import type { Bundle, Tie as TieT } from '../types'

/** A stable hue per name, so the same person or company always wears the same colour. */
export function hue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return [18, 48, 82, 145, 172, 200, 232, 262, 292, 322][h % 10]
}

/** Category hues: one colour per kind of event, used on chips and story rails. */
export const CAT_HUE: Record<string, number> = {
  results: 262, management_change: 300, litigation: 25, 'M&A': 70, fund_raise: 172, credit_rating: 210,
  earnings_call: 145, press_release: 95, capex: 45, insider_trading: 340, pledging: 10, dividend: 160, bonus_split: 120,
}
export const catHue = (c: string) => CAT_HUE[c] ?? 240

export const closes = (b: Bundle, symbol: string, n = 60) =>
  b.portfolio.find(h => h.symbol === symbol)?.stats.slice(-n).map(s => s.close) ?? []

export function Spark({ data, w = 96, h = 28, tone, fill = true, dot = true, stroke = 1.5, fluid }: {
  data: (number | null)[]; w?: number; h?: number; tone?: 'up' | 'down' | 'ink' | 'accent'; fill?: boolean; dot?: boolean; stroke?: number; fluid?: boolean
}) {
  const id = 'g' + useId().replace(/[^a-z0-9]/gi, '')
  const v = data.filter((x): x is number => x != null)
  if (v.length < 2) return null
  const min = Math.min(...v), max = Math.max(...v)
  const pad = 3
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, pad + (h - pad * 2) * (1 - (y - min) / (max - min || 1))])
  const d = 'M' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')
  const t = tone ?? (v[v.length - 1] >= v[0] ? 'up' : 'down')
  const col = t === 'ink' ? 'var(--ink-2)' : `var(--${t})`
  const last = pts[pts.length - 1]
  return (
    <svg className="spark" width={fluid ? '100%' : w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={fluid ? 'none' : undefined} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity={0.24} />
          <stop offset="1" stopColor={col} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={`${d}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={col} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {dot && !fluid && <><circle cx={last[0]} cy={last[1]} r={4.5} fill={col} opacity={0.18} /><circle cx={last[0]} cy={last[1]} r={2.2} fill={col} /></>}
    </svg>
  )
}

/** A signed percentage with a direction glyph. */
export function Delta({ v, d = 2, pill, className = '' }: { v: number | null | undefined; d?: number; pill?: boolean; className?: string }) {
  if (v == null) return <span className={`delta faint ${className}`}>–</span>
  return (
    <span className={`delta ${sign(v)} ${pill ? 'pill' : ''} ${className}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden style={{ transform: v < 0 ? 'rotate(180deg)' : undefined, opacity: v === 0 ? 0 : 1 }}>
        <path d="M4 1 7.5 6.5h-7z" fill="currentColor" />
      </svg>
      {pct(v, d).replace(/^[+−]/, '')}
    </span>
  )
}

/** Three bars for tie strength: weak, medium, strong. */
export function Tie({ tie }: { tie?: Pick<TieT, 'label'> | null }) {
  const n = tie?.label === 'strong' ? 3 : tie?.label === 'medium' ? 2 : tie ? 1 : 0
  return <span className="tie" title={tie ? `${tie.label} tie` : undefined}><i className={n >= 1 ? 'on' : ''} /><i className={n >= 2 ? 'on' : ''} /><i className={n >= 3 ? 'on' : ''} /></span>
}

/** Segmented control (or underline tabs) whose thumb slides to the active option. */
export function Seg<K extends string>({ items, value, onChange, variant = 'pill', style }: {
  items: readonly (readonly [K, React.ReactNode])[]; value: K; onChange: (k: K) => void; variant?: 'pill' | 'under'; style?: React.CSSProperties
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>('button.on')
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [value, items.length])
  return (
    <div ref={wrap} className={variant === 'pill' ? 'seg' : 'utabs'} role="tablist" style={style}>
      {box && <span className="thumb" style={{ left: box.left, width: box.width }} />}
      {items.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}

/** Ease a number up from zero once, so headline figures land with a little weight. */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target)
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    first.current = false
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setV(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/** Weighted day return of the whole book, and how many holdings rose or fell. */
export function bookToday(b: Bundle) {
  const w = b.portfolio.reduce((n, h) => n + (h.ret_1d != null ? h.weight : 0), 0)
  const ret = w ? b.portfolio.reduce((n, h) => n + (h.ret_1d ?? 0) * h.weight, 0) / w : 0
  const upN = b.portfolio.filter(h => (h.ret_1d ?? 0) > 0).length
  const downN = b.portfolio.filter(h => (h.ret_1d ?? 0) < 0).length
  // Equal-weighted index of the book over the stats window, for a sparkline.
  const len = Math.min(...b.portfolio.map(h => h.stats.length))
  const idx: number[] = []
  for (let i = 0; i < len; i++) {
    let s = 0, tw = 0
    for (const h of b.portfolio) {
      const st = h.stats.slice(-len)
      if (st[0].close && st[i].close) { s += (st[i].close / st[0].close) * h.weight; tw += h.weight }
    }
    idx.push(tw ? (s / tw) * 100 : 100)
  }
  return { ret, upN, downN, flat: b.portfolio.length - upN - downN, idx }
}
