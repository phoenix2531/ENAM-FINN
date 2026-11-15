import { useMemo, useState } from 'react'
import { EditProfile } from '../components/EditProfile'
import { IAlert, IBack, IChev, IClose, IEdit, IPath } from '../components/Icons'
import { Avatar } from '../components/People'
import { bookToday, Delta, hue, Spark, Tie } from '../components/Viz'
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
  const { b, now, rules, go, profileEdit, setProfileEdit, originalInvestor, toast } = useApp()
  const [editing, setEditing] = useState(false)
  const [showJourney, setShowJourney] = useState(false)
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
    <div className="screen pf-screen">
      <button className="back" onClick={() => history.length > 1 ? history.back() : go({ tab: 'brief' })}><IBack size={17} /> Back</button>

      <div className={`pf-top ${showJourney ? 'open' : ''}`}>
      <div className="pf-head">
        <Avatar p={{ name: inv.name }} />
        <div style={{ minWidth: 0 }}>
          <div className="dateline"><span>Portfolio</span></div>
          <div className="pf-name-row">
            <h1 className="h1" style={{ margin: '2px 0 0' }}>{inv.name}</h1>
            <button className="pf-edit" onClick={() => setEditing(true)}><IEdit size={14} />Edit profile</button>
            <button className={`pf-edit ${showJourney ? 'on' : ''}`} onClick={() => setShowJourney(v => !v)} aria-expanded={showJourney}>
              <IPath size={14} />Journey<span className="pf-edit-chev" style={{ transform: showJourney ? 'rotate(90deg)' : undefined }}><IChev size={13} /></span>
            </button>
          </div>
          <div className="small muted">{inv.role}, {inv.fund}</div>
        </div>
      </div>
      {showJourney && <Journey onClose={() => setShowJourney(false)} />}
      </div>

      {profileEdit && (
        <div className="pf-pending">
          <span className="warn"><IAlert size={16} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small"><span className="strong">Verification pending</span> <span className="muted">· submitted {new Date(profileEdit.submitted).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            {profileEdit.proofs.map(p => (
              <div key={p.field} className="tiny muted ellipsis" title={p.sha256}>
                {p.field === 'fund' ? 'Firm' : p.field[0].toUpperCase() + p.field.slice(1)}: <span className="strong">{originalInvestor[p.field]}</span> → <span className="strong">{profileEdit.values[p.field]}</span>
                <span className="faint"> · {p.kind}: {p.file} · SHA-256 {p.sha256.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
          <button className="link tiny" onClick={() => { setProfileEdit(null); toast('Profile changes withdrawn') }}>Withdraw</button>
        </div>
      )}
      {editing && <EditProfile onClose={() => setEditing(false)} />}

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

      <div className="pf-grid">
      <div className="pf-main">
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

      {/* Narrow screens: Friends below the holdings. */}
      <div className="pf-below"><Friends /></div>
      </div>

      {/* Wide screens: Friends beside the holdings. */}
      <aside className="pf-aside"><Friends compact /></aside>
      </div>
    </div>
  )
}

type Stop = { org: string; title: string; from: number | null; to: number | null; pending?: boolean }

/** Your journey of firms, newest first, with the friends you overlapped with at each. */
function Journey({ onClose }: { onClose: () => void }) {
  const { b, originalInvestor, profileEdit, openPerson } = useApp()
  const year = new Date(b.meta.today).getFullYear()
  const yr = (v: string | number | null | undefined) => v == null || v === '' ? null : Number(v)

  const stops = useMemo<Stop[]>(() => {
    const base: Stop[] = (originalInvestor.positions ?? []).map(p => ({ org: p.org, title: p.title, from: yr(p.from), to: yr(p.to) }))
      .sort((a, c) => (c.from ?? 0) - (a.from ?? 0))
    const v = profileEdit?.values
    if (!v?.fund && !v?.role) return base
    // A pending firm change starts a new stop this year; a pending role change retitles the current one.
    if (v.fund) {
      const out = base.map(s => s.to == null ? { ...s, to: year } : s)
      return [{ org: v.fund, title: v.role ?? originalInvestor.role, from: year, to: null, pending: true }, ...out]
    }
    return base.map(s => s.to == null ? { ...s, title: v.role!, pending: true } : s)
  }, [originalInvestor, profileEdit, year])

  const contacts = useMemo(() => Object.values(b.network.people).filter(p => p.kind === 'contact'), [b])
  const firstWord = (o: string) => o.toLowerCase().split(/\s+/)[0]
  const overlaps = (s: Stop) => {
    const sFrom = s.from ?? 0, sTo = s.to ?? year
    const out: { p: typeof contacts[number]; title: string; same: boolean; yrs: string }[] = []
    for (const p of contacts) {
      for (const q of p.positions) {
        const same = q.org.toLowerCase() === s.org.toLowerCase()
        const group = !same && firstWord(q.org) === firstWord(s.org) && firstWord(s.org).length > 3
        if (!same && !group) continue
        const a = Math.max(sFrom, q.from ?? 0), z = Math.min(sTo, q.to ?? year)
        if (z < a) continue
        out.push({ p, title: q.title, same, yrs: `${a}–${z === year && (q.to == null || s.to == null) ? 'now' : z}` })
        break
      }
    }
    return out.sort((x, y) => Number(y.same) - Number(x.same))
  }
  const edu = originalInvestor.education ?? []
  const span = (s: Stop) => `${s.from ?? '?'} – ${s.to ?? 'present'}`
  const yrsAt = (s: Stop) => { const n = (s.to ?? year) - (s.from ?? year); return n <= 0 ? 'this year' : `${n} yr${n > 1 ? 's' : ''}` }

  if (!stops.length && !edu.length) return null
  return (
    <div className="pf-journey">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 className="h2" style={{ margin: 0 }}>Journey</h2>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="Close journey"><IClose size={15} /></button>
      </div>
      <div className="card card-pad">
        <ol className="jr">
          {stops.map((s, i) => {
            const ov = overlaps(s)
            return (
              <li key={s.org + s.from + i} className={`jr-stop ${s.to == null ? 'now' : ''} ${s.pending ? 'pending' : ''}`}>
                <span className="jr-dot" />
                <div className="row between" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <div>
                    <span className="strong">{s.org}</span>
                    {s.pending && <span className="side-insider" style={{ marginLeft: 8 }}>pending</span>}
                  </div>
                  <span className="tiny faint num">{span(s)} · {yrsAt(s)}</span>
                </div>
                <div className="small muted">{s.title}</div>
                {ov.length > 0 && (
                  <div className="jr-people">
                    <span className="tiny faint">{ov.length === 1 ? 'Overlapped with' : `Overlapped with ${ov.length}`}</span>
                    {ov.map(o => (
                      <button key={o.p.id} className="jr-person" onClick={() => openPerson(o.p.id)} title={`${o.title}${o.same ? '' : ' (same group)'} · ${o.yrs}`}>
                        <Avatar p={o.p} /><span className="tiny">{o.p.name}</span>{!o.same && <span className="tiny faint">· group</span>}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
          {edu.slice().sort((a, c) => (c.year ?? 0) - (a.year ?? 0)).map(e => (
            <li key={e.school} className="jr-stop edu">
              <span className="jr-dot" />
              <div className="row between" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="strong">{e.school}</span>
                <span className="tiny faint num">{e.year ? `Class of ${e.year}` : ''}</span>
              </div>
              <div className="small muted">{e.degree}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** How often you talk, in words. */
const cadence = (n: number) =>
  n >= 10 ? 'Monthly' : n >= 6 ? 'Every 2 months' : n >= 4 ? 'Every quarter' : n >= 2 ? 'A few times a year' : n === 1 ? 'Once this year' : 'Not this year'

/** Friends: the investor's own contacts, most-talked-to first. */
export function Friends({ compact }: { compact?: boolean }) {
  const { b, openPerson } = useApp()
  const [all, setAll] = useState(false)
  const today = new Date(b.meta.today).getTime()
  const friends = useMemo(() => Object.values(b.network.people)
    .filter(p => p.kind === 'contact' && p.tie)
    .map(p => {
      const t = p.tie!
      const n = t.touches_12m ?? 0
      const days = t.last_contact ? Math.round((today - new Date(t.last_contact).getTime()) / 864e5) : null
      // Overdue: silent for over 1.5× your usual gap with them.
      const gap = n ? 365 / n : null
      return { p, n, days, overdue: gap != null && days != null && days > gap * 1.5 }
    })
    .sort((a, c) => c.n - a.n || (a.days ?? 1e9) - (c.days ?? 1e9)), [b, today])
  const top = compact ? 12 : 10
  const shown = all ? friends : friends.slice(0, top)
  const max = Math.max(...friends.map(f => f.n), 1)
  const ago = (d: number | null) => d == null ? '–' : d < 14 ? `${d}d ago` : d < 60 ? `${Math.round(d / 7)}w ago` : `${Math.round(d / 30.4)}mo ago`

  return (
    <div className={compact ? 'fr-compact' : 'section'}>
      <div className={compact ? 'card-head' : 'section-head'} style={compact ? { padding: '0 4px 10px' } : undefined}>
        <h2 className="h2">Friends <span className="count num">{friends.length}</span></h2>
        <span className="tiny faint">{compact ? 'by how often you talk' : 'by how often you talk · last 12 months'}</span>
      </div>
      <div className="card list">
        {shown.map(({ p, n, days, overdue }, i) => compact ? (
          <button key={p.id} className="li fr-c" onClick={() => openPerson(p.id)}>
            <Avatar p={p} />
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="small strong ellipsis">{p.name}</span>
                <Tie tie={p.tie} />
              </div>
              <div className="tiny muted"><span className="num strong">{n}×</span> {cadence(n)}</div>
              <div className="fr-bar" style={{ marginTop: 5 }}><span style={{ width: `${(n / max) * 100}%` }} /></div>
            </div>
            <div className="fr-last tiny">
              <div className={overdue ? 'warn' : 'faint'}>{ago(days)}</div>
              {overdue && <div className="warn" style={{ fontSize: 10 }}>due a call</div>}
            </div>
          </button>
        ) : (
          <button key={p.id} className="li fr-row" onClick={() => openPerson(p.id)}>
            <span className="fr-rank num tiny faint">{i + 1}</span>
            <Avatar p={p} />
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="strong ellipsis" style={{ fontSize: 14.5 }}>{p.name}</span>
                <Tie tie={p.tie} />
              </div>
              <div className="tiny muted ellipsis">{p.headline}</div>
              {p.tie?.how && <div className="tiny faint ellipsis">{p.tie.how}</div>}
            </div>
            <div className="fr-freq">
              <div className="small"><span className="num strong">{n}×</span> <span className="muted fr-cad">{cadence(n)}</span></div>
              <div className="fr-bar"><span style={{ width: `${(n / max) * 100}%` }} /></div>
            </div>
            <div className="fr-last tiny">
              <div className={overdue ? 'warn' : 'faint'}>{ago(days)}</div>
              {overdue && <div className="warn" style={{ fontSize: 10.5 }}>due a call</div>}
            </div>
            <span className="chev"><IChev size={15} /></span>
          </button>
        ))}
        {friends.length > top && (
          <button className="inbox-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${friends.length}`}</button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 10, padding: compact ? '0 4px' : undefined }}>
        Ranked by conversations in the last 12 months, then by how recently you spoke. <span className="warn">Due a call</span> means it has been more than 1.5× your usual gap with them.
      </p>
    </div>
  )
}
