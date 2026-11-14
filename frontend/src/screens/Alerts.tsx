import { useMemo } from 'react'
import { ICheck, IBack } from '../components/Icons'
import { Delta } from '../components/Viz'
import { useApp } from '../ctx'
import { CATEGORY_LABEL, day } from '../format'
import { explain, hitsFor } from '../signals'
import { catHue } from '../components/Viz'

const MATERIAL = ['results', 'M&A', 'management_change', 'litigation', 'fund_raise', 'capex', 'credit_rating', 'pledging', 'insider_trading', 'dividend', 'bonus_split']

const fill = (v: number, min: number, max: number) => ({ '--fill': `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties)

export function Alerts() {
  const { b, rules, setRules, go } = useApp()

  const hits = useMemo(() => b.portfolio.flatMap(h => hitsFor(h, rules).map(x => ({ ...x, h }))), [b, rules])
  const sessions = b.portfolio[0]?.stats.length ?? 0
  const perWeek = sessions ? (hits.length / sessions) * 5 : 0
  const recent = [...hits].sort((a, c) => c.date.localeCompare(a.date)).slice(0, 5)
  // How many alerts each session would have produced, so the threshold has a shape.
  const dates = b.portfolio[0]?.stats.map(s => s.date) ?? []
  const perDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of hits) m.set(x.date, (m.get(x.date) ?? 0) + 1)
    return dates.map(d => m.get(d) ?? 0)
  }, [hits, dates])
  const peak = Math.max(...perDay, 1)
  const verdict = perWeek > 15 ? { t: 'Too many to mean anything.', c: 'down' } : perWeek < 1 ? { t: 'Very quiet; you may miss moves.', c: 'warn' } : { t: 'Rare enough to notice.', c: 'up' }

  return (
    <div className="screen">
      <button className="back" onClick={() => go({ tab: 'brief' })}><IBack size={17} /> Brief</button>
      <div className="dateline" style={{ marginTop: 16 }}><span>Alert rules</span><span className="bar" /><span>After every close</span></div>
      <h1 className="h1">What counts as <em>unusual</em></h1>
      <p className="lede">FINN checks every holding after the close and tells you only what crosses these lines.</p>

      <div className="card" style={{ marginTop: 26 }}>
        <div className="dial">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div><div className="eyebrow">Volume above</div><div className="small muted">vs {rules.volume_lookback}-day average</div></div>
            <span className="big">{rules.volume_multiple.toFixed(1)}×</span>
          </div>
          <input className="slider" type="range" min={1.5} max={6} step={0.1} value={rules.volume_multiple} style={fill(rules.volume_multiple, 1.5, 6)}
            onChange={e => setRules({ ...rules, volume_multiple: +e.target.value })} aria-label="Volume multiple" />
        </div>
        <div className="dial">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div><div className="eyebrow">Price move beyond</div><div className="small muted">in a single session</div></div>
            <span className="big">±{rules.price_move_pct.toFixed(1)}%</span>
          </div>
          <input className="slider" type="range" min={1.5} max={12} step={0.5} value={rules.price_move_pct} style={fill(rules.price_move_pct, 1.5, 12)}
            onChange={e => setRules({ ...rules, price_move_pct: +e.target.value })} aria-label="Price move percent" />
        </div>
        <div className="dial" style={{ background: 'var(--bg)', borderRadius: '0 0 var(--r) var(--r)' }}>
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="eyebrow">At these settings</div>
              <div className="small" style={{ marginTop: 2 }}>about <span className="num strong">{perWeek.toFixed(1)}</span> alerts a week across {b.portfolio.length} holdings</div>
            </div>
            <span className={`tag ${verdict.c}`}><span className="pip" />{verdict.t}</span>
          </div>
          <div className="hist" aria-label="Alerts per session">
            {perDay.map((n, i) => <span key={i} title={`${dates[i]}: ${n}`} style={{ height: `${(n / peak) * 100}%`, opacity: n ? 0.85 : 0.15 }} />)}
          </div>
          <div className="row between tiny faint num" style={{ marginTop: 6 }}><span>{dates[0] ? day(dates[0]) : ''}</span><span>{sessions} sessions</span><span>{dates.at(-1) ? day(dates.at(-1)!) : ''}</span></div>
        </div>
      </div>

      <div className="section">
        <h2 className="h2" style={{ marginBottom: 12 }}>Filings that should interrupt you <span className="count num">{rules.categories.filter(c => MATERIAL.includes(c)).length}/{MATERIAL.length}</span></h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {MATERIAL.map(c => {
            const on = rules.categories.includes(c)
            return (
              <button key={c} className={`toggle ${on ? 'on' : ''}`} style={{ '--h': catHue(c) } as React.CSSProperties}
                onClick={() => setRules({ ...rules, categories: on ? rules.categories.filter(x => x !== c) : [...rules.categories, c] })}>
                <span className="ck">{on && <ICheck size={11} />}</span>{CATEGORY_LABEL[c]}
              </button>
            )
          })}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="section">
          <h2 className="h2">Would have fired recently</h2>
          <div className="card list">
            {recent.map(r => {
              const s = explain(b, r.h.symbol, r.date)
              return (
                <button key={r.h.symbol + r.date} className="li" onClick={() => go({ tab: 'research', symbol: r.h.symbol })}>
                  <div className="grow">
                    <div className="row" style={{ flexWrap: 'wrap', rowGap: 4 }}><span className="sym">{r.h.symbol}</span><span className="tiny faint" style={{ whiteSpace: 'nowrap' }}>{day(r.date)}</span>{r.why.filter(w => w.includes('volume')).map(w => <span key={w} className="tag plain" style={{ height: 18 }}>{w}</span>)}</div>
                    <div className={`small ellipsis ${s ? 'muted' : 'warn'}`} style={{ marginTop: 4 }}>{s ? s.headline : 'No filing explains it'}</div>
                  </div>
                  <Delta v={r.ret} d={1} pill />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
