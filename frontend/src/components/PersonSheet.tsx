import { useEffect, useMemo, useState } from 'react'
import { loadDossier } from '../api'
import { useApp } from '../ctx'
import { CATEGORY_LABEL } from '../format'
import type { LedgerRow, Profile, Story } from '../types'
import { ICheck, ICopy, IExt, IPhone, IUser } from './Icons'
import { Avatar, PathView } from './People'
import { Tie } from './Viz'
import { Sheet } from './Sheet'

type Reason = { text: string; symbol?: string; draft: string }

function firstName(n: string) {
  return n.replace(/^(Dr|Capt|Mr|Ms)\.?\s+/i, '').split(' ')[0]
}

/** Why this person matters today, assembled from the Brief and the network notices. */
const EVENT_NOUN: Record<string, string> = {
  litigation: 'legal and regulatory trouble', results: 'quarter', 'M&A': 'deal', fund_raise: 'fund raise',
  management_change: 'leadership change', press_release: 'news', capex: 'capex plan', credit_rating: 'rating action',
}

function reasons(p: Profile, stories: Story[], hooks: { hook: string; contact: { id: string }; event: { symbol: string } }[]): Reason[] {
  const out: Reason[] = []
  const first = firstName(p.name)
  const seen = new Set<string>()
  for (const s of stories) {
    const c = s.call?.find(c => c.contact.id === p.id)
    const co = s.company.replace(/ (Ltd|Limited)\.?$/, '')
    if (c && !seen.has(s.symbol)) {
      seen.add(s.symbol)
      const what = EVENT_NOUN[s.category] ?? (CATEGORY_LABEL[s.category] ?? s.category).toLowerCase()
      out.push({
        text: `Best placed to explain ${co}'s ${what}. ${c.credential.replace(/ \(same .*\)$/, '')}.`, symbol: s.symbol,
        draft: `Hi ${first}, hope you're well. ${s.company} has been in the news (${s.headline.replace(/\.$/, '')}). Given your time ${c.credential.includes(' at ') ? 'at ' + c.credential.split(' at ')[1].split(',')[0].split(' (')[0] : 'in the space'}, I'd value your read on ${c.knows || 'what it means'}. Do you have 15 minutes this week?`,
      })
    }
    for (const sp of s.people ?? []) {
      const path = sp.paths.find(x => x.contact.id === p.id)
      if (path) out.push({
        text: `Your way in to ${sp.name} (${sp.role.split(';')[0].split('(')[0].trim()}, ${s.company}): ${path.links[0].text}.`, symbol: s.symbol,
        draft: `Hi ${first}, hope all's well. I see ${sp.name} is taking over as ${sp.role.split(';')[0].split('(')[0].trim()} at ${s.company}. I believe your paths crossed (${path.links[0].text.replace(/;.*/, '')}). I'd love your sense of how they work and what they're likely to prioritise. Coffee this week?`,
      })
    }
  }
  for (const h of hooks) if (h.contact.id === p.id && !seen.has(h.event.symbol)) out.push({
    text: h.hook,
    draft: `Hi ${first}, it's been a while! Saw the news on ${h.hook.split(' (')[0]} and thought of you. Would love to catch up and hear your take. Free for a call this week?`,
  })
  return out
}

export function PersonSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, go, logCall, called, toast } = useApp()
  const p = b.network.people[id]
  const rs = useMemo(() => (p ? reasons(p, b.brief.stories, b.network.reconnect) : []), [p, b])
  if (!p) return <Sheet onClose={onClose}><div className="empty">Person not found.</div></Sheet>
  const isContact = p.kind === 'contact'
  // Why this person is in front of you: the filing that put them in the Brief.
  const news = b.brief.stories.flatMap(st => (st.people ?? []).filter(x => x.id === p.id).map(x => ({ story: st, person: x })))
    .sort((a, c) => Number(c.person.incoming) - Number(a.person.incoming))[0]
  // Diligence needs a dossier that already exists; a profile must never start a minutes-long build.
  const known = new Set([...b.portfolio, ...b.research].map(x => x.symbol))
  const askAbout = [news?.person.incoming ? news.story.symbol : null, ...p.positions.filter(x => x.current).map(x => x.symbol)]
    .find((x): x is string => !!x && known.has(x))

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Draft copied') }
    catch { toast('Could not copy on this device') }
  }

  return (
    <Sheet onClose={onClose} label={isContact ? 'Your contact' : 'From company filings'}>
      <div className="row rise" style={{ gap: 16, marginTop: 6, alignItems: 'center' }}>
        <Avatar p={p} lg />
        <div className="grow">
          <div className="serif" style={{ fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.015em' }}>{p.name}</div>
          <div className="small muted" style={{ marginTop: 4 }}>{p.headline}</div>
        </div>
      </div>

      <div className="row rise" style={{ flexWrap: 'wrap', gap: 6, marginTop: 14, '--i': 1 } as React.CSSProperties}>
        {p.tie && <span className="tag accent"><Tie tie={p.tie} />{p.tie.label} tie</span>}
        {p.tie?.how && <span className="tag plain long">{p.tie.how}</span>}
        {p.tie?.last && <span className="tag plain">{p.tie.last}</span>}
        {called[p.id] && <span className="tag up"><ICheck size={12} />called {called[p.id]}</span>}
        {p.city && <span className="tag plain">{p.city}</span>}
      </div>

      {news && (
        <div className={`flag ${news.person.incoming ? '' : 'watch'} rise`} style={{ marginTop: 14, '--i': 2 } as React.CSSProperties}>
          <span className={news.person.incoming ? 'accent' : 'warn'} style={{ marginTop: 1 }}><IUser size={16} /></span>
          <span>
            <span className="strong">{news.person.incoming ? 'Incoming' : 'Leaving'}</span>
            <span className="muted"> {news.person.role.split(';')[0].split('(')[0].trim().toLowerCase()}, {news.story.company}
              {news.person.incoming && news.person.effective ? ` · from ${news.person.effective.replace(/close of business hours on /i, '').split(',')[0]}` : ''}</span>
          </span>
        </div>
      )}
      {!isContact && <div className="tiny faint" style={{ marginTop: 8 }}>Public role facts only, drawn from exchange filings.</div>}

      {rs.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="eyebrow">Why now</div>
          {rs.slice(0, 2).map((r, i) => <p key={i} className={i ? 'small' : 'serif'} style={{ margin: i ? '10px 0 0' : '6px 0 0', fontSize: i ? undefined : 19, lineHeight: 1.3 }}>{r.text}</p>)}
        </div>
      )}

      {isContact && (
        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          {rs[0] && <button className="btn accent" onClick={() => copy(rs[0].draft)}><ICopy size={15} />Copy a note</button>}
          <button className={`btn ${rs[0] ? 'ghost' : ''}`} onClick={() => { logCall(p.id); toast(`Logged a call with ${firstName(p.name)}`) }}><IPhone size={15} />Log a call</button>
        </div>
      )}

      {!isContact && (
        <div className="section" style={{ marginTop: 28 }}>
          <h3 className="h2">Your way in</h3>
          {p.paths?.length
            ? p.paths.slice(0, 2).map((path, i) => <div key={path.contact.id} className="card card-pad" style={{ marginTop: i ? 10 : 0, paddingTop: 4 }}><PathView path={path} target={p} /></div>)
            : <p className="small muted">Nobody in your network has crossed paths with {p.name} yet.</p>}
        </div>
      )}

      {!isContact && <WorthAsking symbol={askAbout} />}

      <div className="section" style={{ marginTop: 28 }}>
        <h3 className="h2">Career</h3>
        <ul className="timeline">
          {p.positions.map((x, i) => (
            <li key={i} className={x.current ? 'now' : ''}>
              <span className="num tiny faint" style={{ paddingTop: 2 }}>{x.from ?? '—'}–{x.current ? 'now' : x.to ?? '—'}</span>
              <span className="node" />
              <span>
                {x.title}<span className="muted">, {x.symbol
                  ? <button className="link" onClick={() => { onClose(); go({ tab: 'research', symbol: x.symbol! }) }}>{x.org}</button>
                  : x.org}</span>
              </span>
            </li>
          ))}
        </ul>
        {p.education?.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {p.education.map((e, i) => <span key={i} className="tag plain long">{[e.degree, e.school, e.year].filter(Boolean).join(', ')}</span>)}
          </div>
        )}
      </div>

      {p.sources?.length > 0 && (
        <div className="row" style={{ marginTop: 24, flexWrap: 'wrap', gap: 6 }}>
          <span className="eyebrow">Sources</span>
          {p.sources.map(s => (
            <a key={s} className="tag plain" href={s} target="_blank" rel="noreferrer">
              {s.includes('bseindia') || s.includes('nseindia') ? 'company filing' : new URL(s).hostname.replace('www.', '')}<IExt size={11} />
            </a>
          ))}
        </div>
      )}
    </Sheet>
  )
}

/** Diligence before meeting a new leader: what their company promised and missed. */
function WorthAsking({ symbol }: { symbol?: string }) {
  const { b } = useApp()
  const cur = symbol ? { symbol, org: [...b.portfolio, ...b.research].find(x => x.symbol === symbol)!.name } : undefined
  const [rows, setRows] = useState<LedgerRow[] | null>(null)
  useEffect(() => {
    if (!cur?.symbol) return
    loadDossier(cur.symbol)
      .then(d => setRows((d.guidance.ledger ?? []).filter(r => r.status === 'walked_back' || r.status === 'missed').slice(0, 3)))
      .catch(() => setRows([]))
  }, [cur?.symbol])
  if (!cur?.symbol || !rows?.length) return null
  return (
    <div className="section" style={{ marginTop: 28 }}>
      <h3 className="h2">Worth asking about · {cur.symbol}</h3>
      <div className="card list">
        {rows.map((r, i) => (
          <div key={i} style={{ padding: '12px 16px' }}>
            <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
              <div className="small strong">{r.promise}</div>
              <span className={`tag ${r.status === 'missed' ? 'down' : 'warn'}`}>{r.status === 'missed' ? 'Missed' : 'Walked back'}</span>
            </div>
            <div className="tiny muted" style={{ marginTop: 4 }}>{r.actual}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
