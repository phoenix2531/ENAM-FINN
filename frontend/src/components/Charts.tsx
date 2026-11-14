// Hand-built SVG charts: no chart library, so every pixel is deliberate and the bundle stays small.
import { useId, useState } from 'react'
import { cr } from '../format'

const gid = (s: string) => 'c' + s.replace(/[^a-z0-9]/gi, '')

/** Bars for a level series (revenue) with an optional line overlay (margin %). Hover reads out a year. */
export function BarsLine({ labels, bars, line, h = 170 }: { labels: string[]; bars: (number | null)[]; line?: (number | null)[]; h?: number }) {
  const id = gid(useId())
  const [hi, setHi] = useState<number | null>(null)
  const W = 360, padB = 20, padT = 16
  const n = bars.length
  if (!n) return null
  const max = Math.max(...bars.map(b => b ?? 0), 1)
  const min = Math.min(0, ...bars.map(b => b ?? 0))
  const slot = W / n
  const y = (v: number) => padT + (h - padT - padB) * (1 - (v - min) / (max - min || 1))
  const lv = (line ?? []).filter((x): x is number => x != null)
  const lmin = Math.min(...lv), lmax = Math.max(...lv)
  const ly = (v: number) => padT + 8 + (h - padT - padB - 22) * (1 - (v - lmin) / (lmax - lmin || 1))
  const sel = hi ?? n - 1
  const linePts = (line ?? []).map((v, i) => v == null ? null : [i * slot + slot / 2, ly(v)] as const).filter(Boolean) as (readonly [number, number])[]
  return (
    <div onMouseLeave={() => setHi(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${h}`} role="img">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.95} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => <line key={f} className="grid" x1={0} x2={W} y1={y(min + (max - min) * f)} y2={y(min + (max - min) * f)} />)}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {bars.map((b, i) => b == null ? null : (
          <rect key={i} className="bar" x={i * slot + slot * 0.2} width={slot * 0.6} y={Math.min(y(b), y(0))} height={Math.max(1, Math.abs(y(0) - y(b)))}
            rx={2} fill={b < 0 ? 'var(--down)' : i === sel ? `url(#${id})` : 'var(--accent)'} opacity={i === sel ? 1 : 0.2} />
        ))}
        {labels.map((l, i) => (n <= 8 || (n - 1 - i) % 2 === 0 || i === sel) && (
          <text key={i} x={i * slot + slot / 2} y={h - 5} textAnchor="middle" style={i === sel ? { fill: 'var(--ink)' } : undefined}>{l}</text>
        ))}
        {linePts.length > 1 && (
          <>
            <polyline fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" points={linePts.map(p => p.join(',')).join(' ')} />
            {linePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.3} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.3} />)}
          </>
        )}
        {bars.map((_, i) => <rect key={i} className="hit" x={i * slot} y={0} width={slot} height={h} onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} />)}
      </svg>
      <div className="chart-tip">
        <span style={{ color: 'var(--ink)' }}>{labels[sel]}</span> · <span className="accent">{cr(bars[sel])}</span>
        {line?.[sel] != null && <> · margin <span style={{ color: 'var(--ink)' }}>{line[sel]!.toFixed(1)}%</span></>}
      </div>
    </div>
  )
}

/** Paired bars: profit (light) vs operating cash (accent), the quickest test of earnings quality. */
export function Paired({ labels, a, b, h = 150 }: { labels: string[]; a: (number | null)[]; b: (number | null)[]; h?: number }) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 360, padB = 20, padT = 10
  const all = [...a, ...b].filter((x): x is number => x != null)
  if (!all.length) return null
  const max = Math.max(...all, 1), min = Math.min(0, ...all)
  const n = labels.length, slot = W / n
  const y = (v: number) => padT + (h - padT - padB) * (1 - (v - min) / (max - min || 1))
  const sel = hi ?? n - 1
  return (
    <div onMouseLeave={() => setHi(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${h}`} role="img">
        {[0.5, 1].map(f => <line key={f} className="grid" x1={0} x2={W} y1={y(max * f)} y2={y(max * f)} />)}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {labels.map((l, i) => (
          <g key={i} opacity={i === sel ? 1 : 0.55}>
            {a[i] != null && <rect x={i * slot + slot * 0.18} width={slot * 0.3} y={Math.min(y(a[i]!), y(0))} height={Math.max(1, Math.abs(y(0) - y(a[i]!)))} rx={2} fill="var(--ink-3)" opacity={0.45} />}
            {b[i] != null && <rect x={i * slot + slot * 0.52} width={slot * 0.3} y={Math.min(y(b[i]!), y(0))} height={Math.max(1, Math.abs(y(0) - y(b[i]!)))} rx={2} fill={b[i]! < 0 ? 'var(--down)' : 'var(--accent)'} />}
            <text x={i * slot + slot / 2} y={h - 5} textAnchor="middle" style={i === sel ? { fill: 'var(--ink)' } : undefined}>{l}</text>
          </g>
        ))}
        {labels.map((_, i) => <rect key={i} className="hit" x={i * slot} y={0} width={slot} height={h} onMouseEnter={() => setHi(i)} onClick={() => setHi(i)} />)}
      </svg>
      <div className="chart-tip">
        <span style={{ color: 'var(--ink)' }}>{labels[sel]}</span> · profit {cr(a[sel])} · <span className="accent">cash {cr(b[sel])}</span>
      </div>
    </div>
  )
}
