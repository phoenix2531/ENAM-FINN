import { useEffect, useState } from 'react'
import { loadDossier, NeedsLive } from '../api'
import { CallNote } from '../components/Cards'
import { BarsLine, Paired } from '../components/Charts'
import { IAlert, IBack, ICheck, IExt } from '../components/Icons'
import { PersonLine } from '../components/People'
import { Delta, Seg, Spark } from '../components/Viz'
import { useApp } from '../ctx'
import { cr, num, pct, pdfPage, sign } from '../format'
import { assetQualityTakeaway, cashTakeaway, leverageTakeaway, revenueTakeaway } from '../insight'
import type { Dossier as D, LedgerRow } from '../types'

const STATUS: Record<LedgerRow['status'], { label: string; cls: string; color: string }> = {
  delivered: { label: 'Delivered', cls: 'up', color: 'var(--up)' },
  on_track: { label: 'On track', cls: 'up', color: 'color-mix(in srgb, var(--up) 45%, var(--surface))' },
  missed: { label: 'Missed', cls: 'down', color: 'var(--down)' },
  walked_back: { label: 'Walked back', cls: 'warn', color: 'var(--warn)' },
  pending: { label: 'Pending', cls: 'plain', color: 'var(--ink-3)' },
  unverifiable: { label: "Can't verify", cls: 'plain', color: 'var(--line-2)' },
}
// Misses first: a broken promise is what changes a view; a pending one changes nothing yet.
const ORDER: LedgerRow['status'][] = ['missed', 'walked_back', 'delivered', 'on_track', 'pending', 'unverifiable']
const TABS = [['promises', 'Promises'], ['financials', 'Financials'], ['case', 'Bull & bear'], ['people', 'People']] as const
type Tab = typeof TABS[number][0]
const toTab = (s?: string): Tab => s === 'case' || s === 'people' || s === 'promises' ? s : s ? 'financials' : 'promises'

export function Dossier({ symbol, section }: { symbol: string; section?: string }) {
  const { b, go } = useApp()
  const [d, setD] = useState<D | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(toTab(section))

  useEffect(() => {
    setD(null); setErr(null); setTab(toTab(section))
    loadDossier(symbol).then(setD).catch(e => setErr(e instanceof NeedsLive ? 'needs-live' : String(e.message ?? e)))
    window.scrollTo(0, 0)
  }, [symbol, section])

  const holding = b.portfolio.find(h => h.symbol === symbol)
  const back = <button className="back" onClick={() => history.length > 1 ? history.back() : go({ tab: 'research' })}><IBack size={17} /> Back</button>

  if (err) return (
    <div className="screen">{back}
      <div className="empty">
        <div className="eyebrow">{symbol}</div>
        <h1 className="h1" style={{ marginTop: 10 }}>{err === 'needs-live' ? <>Not in this <em>snapshot</em></> : <>Couldn't build it</>}</h1>
        {err === 'needs-live'
          ? <p className="small" style={{ maxWidth: '48ch', margin: '0 auto' }}>This demo carries {b.portfolio.length + b.research.length} companies. Connected to the FINN server, any NSE ticker builds in one to three minutes.</p>
          : <p className="small" style={{ maxWidth: '48ch', margin: '0 auto' }}>Couldn't build a dossier: {err === '404' ? `no listed company found for "${symbol}". Search by company name on the Research tab; it may also be unlisted` : err}.</p>}
        <button className="btn ghost" style={{ marginTop: 22 }} onClick={() => go({ tab: 'research' })}>Back to Research</button>
      </div>
    </div>
  )
  if (!d) return (
    <div className="screen">{back}
      <div className="skeleton" style={{ height: 12, width: 120, marginTop: 24 }} />
      <div className="skeleton" style={{ height: 52, width: '60%', marginTop: 12 }} />
      <div className="skeleton" style={{ height: 70, marginTop: 22 }} />
      <div className="skeleton" style={{ height: 76, marginTop: 18 }} />
      {/* Snapshot companies open in milliseconds; anything else is a live build worth explaining. */}
      {[...b.portfolio, ...b.research].some(x => x.symbol === symbol) ? <div className="skeleton" style={{ height: 220, marginTop: 18 }} /> : <Building />}
    </div>
  )

  const f = d.fundamentals
  const margin = f.financial.ebitda_margin ?? f.financial.pat_margin
  const [lo, hi] = f.snapshot.range_52w
  const rp = f.snapshot.range_position
  const series = holding?.stats.map(s => s.close) ?? []
  const periodRet = series.length > 1 ? (series[series.length - 1] / series[0] - 1) * 100 : null
  const ledgerN = d.guidance.ledger?.length ?? 0
  const peopleN = d.network.call.length + d.network.people.length

  return (
    <div className="screen">
      {back}
      <div className="d-head rise">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="sym">{d.symbol}</span>
            {holding && <span className="tag accent">{holding.weight}% of book</span>}
            {d.sector_path?.length > 0 && <span className="tiny faint ellipsis">{d.sector_path.slice(-2).join(' · ')}</span>}
          </div>
          <h1 className="h1" style={{ marginBottom: 0, marginTop: 8 }}>{d.name.replace(/ (Ltd|Limited)\.?$/, '')}</h1>
        </div>
        <div className="d-price">
          <div className="p">₹{num(f.snapshot.price)}</div>
          {holding && <div style={{ marginTop: 6 }}><Delta v={holding.ret_1d} pill /></div>}
        </div>
      </div>

      {series.length > 1 && (
        <div className="d-spark rise" style={{ '--i': 1 } as React.CSSProperties}>
          <Spark data={series} w={600} h={72} fluid stroke={1.8} />
          <div className="row between tiny faint num" style={{ marginTop: 4 }}>
            <span>{series.length} sessions</span>
            {periodRet != null && <span className={sign(periodRet)}>{pct(periodRet)} over the period</span>}
          </div>
        </div>
      )}

      {lo != null && hi != null && rp != null && (
        <div className="range rise" style={{ '--i': 2 } as React.CSSProperties}>
          <div className="row between"><span className="eyebrow">52-week range</span><span className="tiny muted num">{Math.round(rp * 100)}% of the way up</span></div>
          <div className="range-track"><span className="range-knob" style={{ left: `${Math.max(0, Math.min(1, rp)) * 100}%` }} /></div>
          <div className="row between tiny num faint"><span>₹{num(lo)}</span><span>₹{num(hi)}</span></div>
        </div>
      )}

      <div className="kpis rise" style={{ '--i': 3 } as React.CSSProperties}>
        {/* Banks are judged on return on equity and price to book; ROCE and margin mislead for a lender. */}
        {(f.balance.financial_company
          ? [['Mkt cap', cr(f.snapshot.market_cap_cr)], ['P/E', num(f.snapshot.pe, 1)], ['P/B', num(f.snapshot.pb, 1)],
             ['ROE', f.snapshot.roe != null ? `${num(f.snapshot.roe, 0)}%` : '–']]
          : [['Mkt cap', cr(f.snapshot.market_cap_cr)], ['P/E', num(f.snapshot.pe, 1)],
             ['ROCE', f.snapshot.roce != null ? `${num(f.snapshot.roce, 0)}%` : '–'],
             [f.financial.ebitda_margin != null ? 'Margin' : 'PAT mgn', margin != null ? `${num(margin, 0)}%` : '–']]).map(([k, v]) => (
          <div className="kpi" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
        ))}
      </div>

      {f.flags.length > 0 && (
        <div className="flags">
          {f.flags.slice(0, 3).map((fl, i) => (
            <div key={i} className={`flag ${fl.level}`}>
              <span className={fl.level === 'red' ? 'down' : fl.level === 'watch' ? 'warn' : 'faint'} style={{ marginTop: 1 }}><IAlert size={16} /></span>
              <span>{fl.text}</span>
            </div>
          ))}
        </div>
      )}

      <Seg variant="under" value={tab} onChange={setTab} style={{ marginTop: 32 }}
        items={TABS.map(([k, l]) => [k, <>{l}{k === 'promises' && ledgerN ? <span className="n">{ledgerN}</span> : k === 'people' && peopleN ? <span className="n">{peopleN}</span> : null}</>] as const)} />

      <div key={tab} className="rise">
        {tab === 'promises' && <Promises d={d} />}
        {tab === 'financials' && <Financials d={d} />}
        {tab === 'case' && <Case d={d} />}
        {tab === 'people' && <People d={d} />}
      </div>
    </div>
  )
}

/** A first build reads four transcripts and takes minutes: say so, and show it is alive. */
function Building() {
  const [s, setS] = useState(0)
  useEffect(() => { const t = setInterval(() => setS(x => x + 1), 1000); return () => clearInterval(t) }, [])
  const steps = [['Fetching financials and filings', 0, 15], ['Reading the last four earnings calls', 15, 60], ['Checking every promise against the numbers', 60, Infinity]] as const
  return (
    <div className="building">
      <div className="row between"><span className="eyebrow">Building the dossier</span><span className="num tiny muted">{s}s</span></div>
      <div className="steps">
        {steps.map(([label, a, z]) => {
          const st = s >= z ? 'done' : s >= a ? 'on' : ''
          return (
            <div key={label} className={`step ${st}`}>
              {st === 'done' ? <ICheck size={14} /> : st === 'on' ? <span className="spinner" /> : <span style={{ width: 14, height: 14, borderRadius: 7, boxShadow: 'inset 0 0 0 2px var(--line-2)' }} />}
              {label}
            </div>
          )
        })}
      </div>
      <p className="tiny faint" style={{ margin: '14px 0 0' }}>A company's first dossier takes one to three minutes. After that it opens instantly.</p>
    </div>
  )
}

/** The verdict and the bar already say it; the model's paragraph is there for whoever wants it. */
function Summary({ text }: { text?: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <button className="small muted" style={{ margin: '10px 0 0', display: 'block', maxWidth: '62ch' }} onClick={() => setOpen(!open)}>
      <span className={open ? '' : 'clamp3'}>{text}</span>{!open && <span className="link"> More</span>}
    </button>
  )
}

function Promises({ d }: { d: D }) {
  const g = d.guidance
  if (g.status !== 'ok') return <p className="small muted" style={{ marginTop: 24 }}>{g.message ?? (g.status === 'no_transcripts' ? 'No earnings-call transcripts are listed for this company.' : 'Not available.')}</p>
  const counts = (g.ledger ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {})
  const callUrl = (call: string) => g.sources?.[call.replace(/ call$/, '')] ?? d.documents.transcripts.find(x => call.startsWith(x.call))?.url
  const cred = g.credibility?.label
  const keys = Object.keys(STATUS) as LedgerRow['status'][]

  return (
    <>
      <div className="card card-pad" style={{ marginTop: 24 }}>
        <div className="eyebrow">Management credibility · last {g.calls?.length ?? 4} calls</div>
        <div className={`verdict ${cred === 'high' ? 'up' : cred === 'low' ? 'down' : cred === 'mixed' ? 'warn' : ''}`}>
          {cred === 'too early' ? 'Too early to tell' : cred ? cred[0].toUpperCase() + cred.slice(1) : '–'}
        </div>
        <Summary text={g.credibility?.summary} />
        <div className="scorebar">
          {keys.map(k => counts[k] ? <span key={k} style={{ flex: counts[k], background: STATUS[k].color }} /> : null)}
        </div>
        <div className="legend">
          {keys.filter(k => counts[k]).map(k => <span key={k}><i style={{ background: STATUS[k].color }} /><span className="num">{counts[k]}</span> {STATUS[k].label.toLowerCase()}</span>)}
        </div>
      </div>

      <div className="section" style={{ marginTop: 32 }}>
        <h2 className="h2">Promised vs delivered <span className="count num">{g.ledger?.length ?? 0}</span></h2>
        <div className="list">{[...(g.ledger ?? [])].sort((a, c) => ORDER.indexOf(a.status) - ORDER.indexOf(c.status)).map((r, i) => <LedgerItem key={i} r={r} url={callUrl(r.made_in)} />)}</div>
      </div>

      {g.narrative_vs_numbers && g.narrative_vs_numbers.length > 0 && (
        <div className="section">
          <h2 className="h2">Story vs numbers</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {g.narrative_vs_numbers.map((n, i) => (
              <div key={i} className="card card-pad">
                <span className={`tag ${n.verdict === 'diverge' ? 'down' : n.verdict === 'agree' ? 'up' : 'warn'}`}>
                  <span className="pip" />{n.verdict === 'diverge' ? 'Diverges' : n.verdict === 'agree' ? 'Agrees' : 'Partly agrees'}
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '8px 12px', marginTop: 12 }} className="small">
                  <span className="eyebrow" style={{ paddingTop: 2 }}>They say</span><span className="serif" style={{ fontSize: 17, lineHeight: 1.3 }}>{n.story}</span>
                  <span className="eyebrow" style={{ paddingTop: 2 }}>Numbers say</span><span>{n.numbers}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {g.current_guidance && g.current_guidance.length > 0 && (
        <div className="section">
          <h2 className="h2">Guiding to now</h2>
          <div className="card list">
            {g.current_guidance.map((c, i) => (
              <a key={i} className="li top" href={pdfPage(callUrl(c.made_in) ?? '#', c.page)} target="_blank" rel="noreferrer">
                <div className="grow small"><span className="strong">{c.metric}</span>: {c.target} <span className="faint">({c.horizon})</span></div>
                <span className={`tag ${c.change === 'raised' ? 'up' : c.change === 'cut' ? 'down' : 'plain'}`}>{c.change}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function LedgerItem({ r, url }: { r: LedgerRow; url?: string }) {
  const [open, setOpen] = useState(false)
  const st = STATUS[r.status]
  return (
    <button className="ledger-item" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="stripe" style={{ background: st.color }} />
      <div style={{ minWidth: 0 }}>
        <div className="lp" style={{ fontWeight: 550, fontSize: 14.5, transition: 'color .15s' }}>{r.promise}</div>
        <div className="small muted" style={{ marginTop: 3 }}>{r.actual}</div>
        <div className="tiny faint" style={{ marginTop: 6 }}>{r.made_in}{r.topic ? ` · ${r.topic}` : ''}</div>
        {open && (
          <>
            <div className="quote">“{r.quote}”</div>
            {url && <a className="tiny link row" style={{ gap: 4, display: 'inline-flex' }} href={pdfPage(url, r.page)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Transcript, page {r.page} <IExt size={12} /></a>}
          </>
        )}
      </div>
      <span className={`tag ${st.cls}`}>{st.label}</span>
    </button>
  )
}

function Financials({ d }: { d: D }) {
  const f = d.fundamentals
  const t = f.trajectory
  const de = f.balance.debt_to_equity.at(-1)?.[1]
  const growth = revenueTakeaway(d)
  const cash = cashTakeaway(d)
  const cagr = [
    t.cagr.revenue['5y'] != null && `Revenue ${pct(t.cagr.revenue['5y'], 0)}/yr over 5 years`,
    t.cagr.pat['5y'] != null && `profit ${pct(t.cagr.pat['5y'], 0)}/yr`,
  ].filter(Boolean).join(', ')
  const shareN = (s: string) => { const m = s?.match(/(\d+(\.\d+)?)\s*%/); return m ? +m[1] : null }

  return (
    <>
      <p className="serif" style={{ marginTop: 24, fontSize: 21, lineHeight: 1.35 }}>{d.business.what ?? d.about}</p>
      {d.business.segments && d.business.segments.length > 0 && (
        <div className="card list" style={{ marginTop: 14 }}>
          {d.business.segments.map(s => {
            const n = shareN(s.share)
            return (
              <div key={s.name} style={{ padding: '11px 16px' }}>
                <div className="row between small"><span>{s.name}</span>{s.share && <span className="num muted">{s.share}</span>}</div>
                {n != null && <div className="meter" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, n)}%`, background: 'var(--accent)' }} /></div>}
              </div>
            )
          })}
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Revenue{t.margin.length > 0 && !f.balance.financial_company ? <> & margin</> : null}</h2>
          {t.margin_trend && !f.balance.financial_company && <span className={`tag ${t.margin_trend === 'expanding' ? 'up' : t.margin_trend === 'compressing' ? 'down' : 'plain'}`}>margins {t.margin_trend}</span>}
        </div>
        <div className="card card-pad">
          {growth && <p className="takeaway">{growth}</p>}
          <BarsLine labels={t.years} bars={t.revenue} line={f.balance.financial_company ? undefined : t.margin} />
          {cagr && <div className="tiny muted" style={{ marginTop: 4 }}>{cagr}</div>}
        </div>
      </div>

      {f.balance.financial_company && t.quarters.length > 0 && <LenderQuarters d={d} />}
      {!f.balance.financial_company && t.quarters.length > 0 && (
        <div className="results-wrap" style={{ marginTop: 16 }}>
          <table className="results">
            <thead><tr><th>Quarter</th><th>Revenue</th><th>YoY</th><th>PAT YoY</th></tr></thead>
            <tbody>{t.quarters.slice(-4).map(q => (
              <tr key={q.period}>
                <td>{new Date(q.period).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</td>
                <td>{num(q.revenue)}</td><td className={sign(q.rev_yoy)}>{pct(q.rev_yoy, 0)}</td><td className={sign(q.pat_yoy)}>{pct(q.pat_yoy, 0)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="section">
        <h2 className="h2">Balance sheet</h2>
        <p className="takeaway">{leverageTakeaway(d)}</p>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
          <div className="kpi"><div className="k">Borrowings</div><div className="v">{cr(f.balance.borrowings_cr)}</div></div>
          <div className="kpi"><div className="k">Net worth</div><div className="v">{cr(f.balance.equity_cr)}</div></div>
          <div className="kpi"><div className="k">{f.balance.financial_company ? 'Borrow/eq' : 'Debt/eq'}</div><div className="v">{de != null ? de.toFixed(2) : '–'}</div></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Profit vs <span className="accent">operating cash</span></h2>
          {f.cash.conversion_5y != null && <span className={`tag ${f.cash.conversion_5y >= 80 ? 'up' : f.cash.conversion_5y < 60 ? 'down' : 'warn'}`}>{f.cash.conversion_5y}% converted · 5y</span>}
        </div>
        <div className="card card-pad">
          {cash && <p className={`takeaway ${cash.tone}`}>{cash.text}</p>}
          {f.cash.note ? <p className="small muted">{f.cash.note}</p> : (
            <Paired labels={f.cash.cfo.slice(-6).map(x => x[0])} a={f.cash.pat.slice(-6).map(x => x[1])} b={f.cash.cfo.slice(-6).map(x => x[1])} />
          )}
        </div>
      </div>

      <div className="section">
        <h2 className="h2">Sources</h2>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {[...d.documents.transcripts.map(x => ({ url: x.url, label: `${x.call} call` })),
            ...d.documents.annual_reports.slice(0, 2).map(x => ({ url: x.url, label: `Annual report ${x.year}` })),
            { url: d.links.screener, label: 'screener.in' }]
            .filter((x, i, all) => all.findIndex(y => y.label === x.label) === i).map(x => (
            <a key={x.url} className="toggle" href={x.url} target="_blank" rel="noreferrer">{x.label}<IExt size={12} /></a>
          ))}
        </div>
      </div>
    </>
  )
}

/** Lenders, compared on the same terms bank to bank: net interest income and bad loans. */
function LenderQuarters({ d }: { d: D }) {
  const q = d.fundamentals.trajectory.quarters.slice(-4)
  const aq = assetQualityTakeaway(d)
  const hasNpa = q.some(x => x.gnpa != null)
  return (
    <>
      <div className="results-wrap" style={{ marginTop: 16 }}>
        <table className="results">
          <thead><tr><th>Quarter</th><th>NII</th><th>YoY</th>{hasNpa && <><th>Gross NPA</th><th>Net NPA</th></>}</tr></thead>
          <tbody>{q.map(x => (
            <tr key={x.period}>
              <td>{new Date(x.period).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}</td>
              <td>{num(x.nii)}</td><td className={sign(x.nii_yoy)}>{pct(x.nii_yoy, 0)}</td>
              {hasNpa && <><td>{x.gnpa != null ? `${x.gnpa.toFixed(2)}%` : '–'}</td><td>{x.nnpa != null ? `${x.nnpa.toFixed(2)}%` : '–'}</td></>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="tiny faint" style={{ marginTop: 8 }}>NII: net interest income, interest earned minus interest paid, ₹ cr. NPA: loans not being repaid, as a share of all loans.</div>
      {aq && (
        <div className="section">
          <h2 className="h2">Asset quality</h2>
          <p className={`takeaway ${aq.tone}`}>{aq.text}</p>
        </div>
      )}
    </>
  )
}

function Case({ d }: { d: D }) {
  const g = d.guidance
  if (g.status !== 'ok' || !(g.bull?.length || g.bear?.length)) return <p className="small muted" style={{ marginTop: 24 }}>Built from the transcripts once a model has read them.</p>
  return (
    <div className="case-grid">
      {(['bull', 'bear'] as const).map(side => (
        <div key={side} className={`case-col ${side}`}>
          <div className="row between">
            <span className={`eyebrow ${side === 'bull' ? 'up' : 'down'}`} style={{ color: side === 'bull' ? 'var(--up)' : 'var(--down)' }}>{side === 'bull' ? 'Bull case' : 'Bear case'}</span>
            <span className="num tiny muted">{(g[side] ?? []).length}</span>
          </div>
          {(g[side] ?? []).map((c, i) => (
            <div key={i} className="item">
              <div className="serif" style={{ fontSize: 19, lineHeight: 1.25 }}>{c.point}</div>
              <div className="small muted" style={{ marginTop: 4 }}>{c.evidence}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function People({ d }: { d: D }) {
  const n = d.network
  if (!n.call.length && !n.people.length) return <p className="small muted" style={{ marginTop: 24 }}>Nobody in your network has worked here, at a competitor or in its value chain.</p>
  return (
    <>
      {n.call.length > 0 && <div style={{ marginTop: 14 }}>{n.call.slice(0, 3).map(c => <CallNote key={c.contact.id} c={c} label="Call" />)}</div>}
      {n.people.length > 0 && (
        <div className="section">
          <h2 className="h2">Leadership in recent filings</h2>
          <div className="card list">
            {n.people.map(x => (
              <PersonLine key={x.person.id} p={x.person}
                sub={x.paths[0] ? <span className="accent">Via {x.paths[0].contact.name}</span> : x.person.headline} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
