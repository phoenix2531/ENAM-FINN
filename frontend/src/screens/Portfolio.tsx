import { useMemo, useState } from 'react'
import { IAlert, IBack, IChev } from '../components/Icons'
import { Avatar } from '../components/People'
import { bookToday, Delta, hue, Spark } from '../components/Viz'
import { useApp } from '../ctx'
import { hitsFor } from '../signals'
import type { Holding } from '../types'

type SortKey = 'weight' | 'd1' | 'm1' | 'm3'
const SORTS: [SortKey, string][] = [['weight', 'Weight'], ['d1', '1D'], ['m1', '1M'], ['m3', '3M']]

/** % change over the last n sessions. */
const change = (h: Holding, n: number) => {
  const s = h.stats
  if (s.length < 2) return null
  const from = s[Math.max(0, s.length - 1 - n)].close, to = s[s.length - 1].close
  return from ? ((to - from) / from) * 100 : null
}

const GROUPS: [RegExp, string][] = [
  [/bank|nbfc|financ|insur|microfinance|asset management/i, 'Financials'],
  [/software|it |computer|telecom/i, 'Tech & Telecom'],
  [/construct|electrical|industrial|cable|engineer|capital goods|defen/i, 'Industrials'],
  [/pharma|hospital|health|diagnos/i, 'Healthcare'],
  [/retail|commerce|jewel|consumer|airline|auto|food|fmcg|hotel/i, 'Consumer'],
  [/refiner|oil|gas|power|chemical|pesticide|agro|metal|cement/i, 'Energy & Materials'],
]
const sectorGroup = (s: string) => GROUPS.find(([re]) => re.test(s))?.[1] ?? 'Other'
const GROUP_HUE: Record<string, number> = { Financials: 232, 'Tech & Telecom': 200, Industrials: 48, Healthcare: 145, Consumer: 322, 'Energy & Materials': 18, Other: 262 }

export function Portfolio() {
  const { b, now, rules, go } = useApp()
  const [sort, setSort] = useState<SortKey>('weight')
  const inv = b.meta.investor
  const book = useMemo(() => bookToday(b), [b])

  const rows = useMemo(() => {
    const dates = b.portfolio[0]?.stats.map(s => s.date) ?? []
    const since = dates[Math.max(0, dates.length - 5)] ?? ''
    const weekAgo = now.getTime() - 168 * 3.6e6
    return b.portfolio.map(h => ({
      h,
      d1: h.ret_1d,
      m1: change(h, 21),
      m3: change(h, 63),
      alerts: hitsFor(h, rules).filter(x => x.date >= since).length,
      stories: b.brief.stories.filter(s => s.symbol === h.symbol && s.tier === 'act' && new Date(s.published).getTime() >= weekAgo).length,
    }))
  }, [b, rules, now])

  const sorted = [...rows].sort((a, c) => sort === 'weight' ? c.h.weight - a.h.weight : (c[sort] ?? -1e9) - (a[sort] ?? -1e9))
  const invested = b.portfolio.reduce((n, h) => n + h.weight, 0)
  const cash = Math.max(0, 100 - invested)
  const maxW = Math.max(...b.portfolio.map(h => h.weight))
  const period3m = book.idx.length > 1 ? book.idx[book.idx.length - 1] - 100 : null

  // Sector mix: NSE's fine-grained sectors rolled up into broad groups.
  const sectors = useMemo(() => {
    const m = new Map<string, { w: number; names: string[] }>()
    for (const h of b.portfolio) {
      const g = sectorGroup(h.sector)
      const e = m.get(g) ?? { w: 0, names: [] }
      e.w += h.weight; e.names.push(h.symbol); m.set(g, e)
    }
    return [...m].map(([g, e]) => [g, e.w, e.names] as [string, number, string[]]).sort((a, c) => c[1] - a[1])
  }, [b])
  const sectorColor = (s: string) => `oklch(0.66 0.13 ${GROUP_HUE[s] ?? hue(s)})`

  return (
    <div className="screen">
      <button className="back" onClick={() => history.length > 1 ? history.back() : go({ tab: 'brief' })}><IBack size={17} /> Back</button>

      <div className="pf-head">
        <Avatar p={{ name: inv.name }} />
        <div>
          <div className="dateline"><span>Portfolio</span></div>
          <h1 className="h1" style={{ margin: '2px 0 0' }}>{inv.name}</h1>
          <div className="small muted">{inv.role}, {inv.fund}</div>
        </div>
      </div>

      <div className="card book pf-stats">
        <div>
          <div className="eyebrow">Today</div>
          <div className={`v ${book.ret >= 0 ? 'up' : 'down'}`}>{book.ret >= 0 ? '+' : '−'}{Math.abs(book.ret).toFixed(2)}%</div>
          <div className="sub">weighted, 1 day</div>
        </div>
        <div>
          <div className="eyebrow">{book.idx.length} sessions</div>
          <div className={`v ${(period3m ?? 0) >= 0 ? 'up' : 'down'}`}>{period3m == null ? '–' : `${period3m >= 0 ? '+' : '−'}${Math.abs(period3m).toFixed(1)}%`}</div>
          <div style={{ marginTop: 6 }}><Spark data={book.idx} w={120} h={22} dot={false} /></div>
        </div>
        <div>
          <div className="eyebrow">Holdings</div>
          <div className="v">{b.portfolio.length}</div>
          <div className="sub"><span className="up">{book.upN} up</span> · <span className="down">{book.downN} down</span> today</div>
        </div>
        <div>
          <div className="eyebrow">Invested</div>
          <div className="v">{invested.toFixed(0)}%</div>
          <div className="sub">{cash > 0 ? `${cash.toFixed(0)}% cash / other` : 'fully invested'}</div>
        </div>
      </div>

      <div className="section">
        <h2 className="h2">Sector mix</h2>
        <div className="card card-pad">
          <div className="pf-mix">
            {sectors.map(([s, w, names]) => <span key={s} style={{ flex: w, background: sectorColor(s) }} title={`${s} ${w}%: ${names.join(', ')}`} />)}
            {cash > 0 && <span style={{ flex: cash, background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-2)' }} title={`Cash / other ${cash}%`} />}
          </div>
          <div className="pf-legend">
            {sectors.map(([s, w, names]) => (
              <div key={s} className="row tiny" style={{ gap: 8 }} title={names.join(', ')}>
                <span className="pf-swatch" style={{ background: sectorColor(s) }} />
                <span className="grow ellipsis"><span className="muted">{s}</span> <span className="faint">· {names.length}</span></span>
                <span className="num">{w.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Holdings <span className="count num">{b.portfolio.length}</span></h2>
          <div className="row" style={{ gap: 6 }}>
            {SORTS.map(([k, l]) => (
              <button key={k} className={`toggle ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)} style={{ height: 28 }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="card list">
          <div className="pf-row pf-th tiny faint">
            <span>Company</span><span className="pf-spark">3M</span><span>Price</span><span>1D</span><span className="pf-hide">1M</span><span>Weight</span><span />
          </div>
          {sorted.map(r => (
            <button key={r.h.symbol} className="pf-row li" onClick={() => go({ tab: 'research', symbol: r.h.symbol })}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="sym">{r.h.symbol}</span>
                  {r.stories > 0 && <span className="pf-badge" title={`${r.stories} open in the Brief this week`}>{r.stories}</span>}
                  {r.alerts > 0 && <span className="warn" title={`${r.alerts} alert${r.alerts > 1 ? 's' : ''} in the last 5 sessions`}><IAlert size={12} /></span>}
                </div>
                <div className="tiny faint ellipsis">{r.h.name.replace(/ (Ltd|Limited)\.?$/, '')}</div>
              </div>
              <span className="pf-spark"><Spark data={r.h.stats.slice(-63).map(s => s.close)} w={84} h={26} dot={false} /></span>
              <span className="num small">₹{r.h.price?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '–'}</span>
              <span className="small"><Delta v={r.d1} /></span>
              <span className="small pf-hide"><Delta v={r.m1} d={1} /></span>
              <span className="pf-w">
                <span className="num small">{r.h.weight}%</span>
                <span className="wbar"><span style={{ width: `${(r.h.weight / maxW) * 100}%` }} /></span>
              </span>
              <span className="chev"><IChev size={15} /></span>
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Weights are share of the fund. A number next to a ticker counts stories open in the Brief this week; <span className="warn"><IAlert size={11} /></span> means it crossed your alert rules in the last 5 sessions.
        </p>
      </div>
    </div>
  )
}
