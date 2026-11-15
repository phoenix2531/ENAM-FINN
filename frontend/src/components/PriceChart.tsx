// Interactive price chart for a story: close line, volume bars, the filing day marked.
// Hand-built SVG like the rest of the app; pointer events cover mouse and touch.
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { DayStat } from '../types'
import { Delta, Seg } from './Viz'

const RANGES = [['1M', '1M'], ['3M', '3M'], ['ALL', 'All']] as const
type RangeKey = typeof RANGES[number][0]
const SESSIONS: Record<RangeKey, number> = { '1M': 22, '3M': 66, ALL: Infinity }

const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const fmtPx = (v: number) => '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: v < 100 ? 2 : 0 })

export function PriceChart({ stats, eventDate, eventLabel = 'Filing' }: { stats: DayStat[]; eventDate?: string; eventLabel?: string }) {
  const gid = 'pc' + useId().replace(/[^a-z0-9]/gi, '')
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  const [range, setRange] = useState<RangeKey>('3M')
  const [hi, setHi] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = stats.slice(-Math.min(SESSIONS[range], stats.length))
  if (data.length < 2) return null

  const H = 240, padT = 14, padB = 22, volH = 38, padR = 52
  const plotW = W - padR
  const priceBottom = H - padB - volH - 8
  const closes = data.map(d => d.close)
  const min = Math.min(...closes), max = Math.max(...closes)
  const span = max - min || 1
  const lo = min - span * 0.06, hiV = max + span * 0.06
  const x = (i: number) => (i / (data.length - 1)) * plotW
  const y = (v: number) => padT + (priceBottom - padT) * (1 - (v - lo) / (hiV - lo))
  const maxVol = Math.max(...data.map(d => d.vol), 1)

  const first = data[0].close, last = data[data.length - 1].close
  const up = last >= first
  const col = up ? 'var(--up)' : 'var(--down)'
  const line = 'M' + data.map((d, i) => `${x(i).toFixed(1)},${y(d.close).toFixed(1)}`).join('L')

  // The filing lands on the first session on or after its date.
  const evDay = eventDate?.slice(0, 10)
  const evIdx = evDay ? data.findIndex(d => d.date >= evDay) : -1

  const ticks = [0, 0.5, 1].map(f => lo + (hiV - lo) * (0.08 + f * 0.84))
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 90)))

  const sel = hi ?? data.length - 1
  const s = data[sel]
  const sinceStart = ((s.close - first) / first) * 100

  const pick = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return
    const i = Math.round(((clientX - r.left) / plotW) * (data.length - 1))
    setHi(Math.max(0, Math.min(data.length - 1, i)))
  }

  return (
    <div className="pchart">
      <div className="pchart-head">
        <div>
          <div className="pchart-px num">{fmtPx(s.close)}</div>
          <div className="tiny muted row" style={{ gap: 8, marginTop: 2 }}>
            <span>{hi == null ? 'Last close' : fmtDay(s.date)}</span>
            {s.ret != null && <span>day <Delta v={s.ret} /></span>}
            <span>{range === 'ALL' ? 'period' : range} <Delta v={sinceStart} /></span>
            {s.volx != null && <span className={s.volx >= 2 ? 'strong' : ''}>{s.volx.toFixed(1)}× vol</span>}
          </div>
        </div>
        <Seg items={RANGES} value={range} onChange={k => { setRange(k); setHi(null) }} />
      </div>

      <div ref={wrap} className="pchart-plot"
        onPointerMove={e => pick(e.clientX)} onPointerDown={e => pick(e.clientX)}
        onPointerLeave={() => setHi(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="chart" style={{ marginTop: 0 }} role="img" aria-label={`Price chart, ${fmtPx(first)} to ${fmtPx(last)}`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col} stopOpacity={0.22} />
              <stop offset="1" stopColor={col} stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map(t => (
            <g key={t}>
              <line className="grid" x1={0} x2={plotW} y1={y(t)} y2={y(t)} />
              <text x={W - 4} y={y(t) + 3} textAnchor="end">{fmtPx(t)}</text>
            </g>
          ))}

          {/* volume */}
          {data.map((d, i) => {
            // Square-root scale: one 30× spike would otherwise flatten every other day.
            const bh = Math.max(1, Math.sqrt(d.vol / maxVol) * volH)
            const bw = Math.max(1.5, (plotW / data.length) * 0.6)
            return <rect key={d.date} x={x(i) - bw / 2} y={H - padB - bh} width={bw} height={bh} rx={1}
              fill={i === sel ? 'var(--ink-2)' : (d.volx ?? 0) >= 2 ? 'var(--accent)' : 'var(--line-2)'} opacity={i === sel ? 0.9 : (d.volx ?? 0) >= 2 ? 0.7 : 1} />
          })}

          {/* filing marker */}
          {evIdx >= 0 && (
            <g className="pchart-event">
              <line x1={x(evIdx)} x2={x(evIdx)} y1={padT} y2={H - padB} />
              <rect x={Math.min(x(evIdx) + 4, plotW - 46)} y={padT - 2} width={42} height={15} rx={4} />
              <text x={Math.min(x(evIdx) + 4, plotW - 46) + 21} y={padT + 8.5} textAnchor="middle">{eventLabel}</text>
            </g>
          )}

          <path d={`${line}L${plotW},${priceBottom}L0,${priceBottom}Z`} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

          {data.map((d, i) => i % labelEvery === 0 && i < data.length - labelEvery / 2 && (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'}>{fmtDay(d.date)}</text>
          ))}
          <text x={plotW} y={H - 6} textAnchor="end">{fmtDay(data[data.length - 1].date)}</text>

          {/* crosshair */}
          <line x1={x(sel)} x2={x(sel)} y1={padT} y2={H - padB} stroke="var(--ink-3)" strokeDasharray="3 3" opacity={hi == null ? 0 : 1} />
          <circle cx={x(sel)} cy={y(s.close)} r={7} fill={col} opacity={0.18} />
          <circle cx={x(sel)} cy={y(s.close)} r={3.4} fill={col} stroke="var(--surface)" strokeWidth={1.5} />
        </svg>
      </div>
      <div className="tiny faint" style={{ marginTop: 6 }}>
        Daily close · bars are volume, <span className="accent">blue</span> where it ran 2× average{evIdx >= 0 ? ' · dashed line is the filing' : ''}. Hover or drag to read a day.
      </div>
    </div>
  )
}
