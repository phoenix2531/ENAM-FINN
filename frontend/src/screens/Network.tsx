import { useMemo, useState } from 'react'
import { IAlert, IBack, IChev, IGap, IPath, IRefresh, ISearch } from '../components/Icons'
import { PersonLine } from '../components/People'
import { Seg, useCountUp } from '../components/Viz'
import { useApp } from '../ctx'
import type { Notice, ThemeRow } from '../types'

const COVER: Record<ThemeRow['coverage'], { cls: string; color: string }> = {
  deep: { cls: 'up', color: 'var(--up)' }, thin: { cls: 'warn', color: 'var(--warn)' },
  'blind spot': { cls: 'down', color: 'var(--down)' }, 'outside portfolio': { cls: 'plain', color: 'var(--ink-3)' },
}
const KIND: Record<Notice['kind'], { label: string; hue: number; icon: typeof IPath }> = {
  path: { label: 'Way in', hue: 262, icon: IPath }, reconnect: { label: 'Reconnect', hue: 172, icon: IRefresh },
  caution: { label: 'Caution', hue: 70, icon: IAlert }, gap: { label: 'Gap', hue: 25, icon: IGap },
}

export function Network() {
  const { b, route, go, openPerson } = useApp()
  const [q, setQ] = useState('')
  const [allNotices, setAllNotices] = useState(false)
  const [allThemes, setAllThemes] = useState(false)
  const [kind, setKind] = useState<'all' | Notice['kind']>('all')
  const contacts = useMemo(() => Object.values(b.network.people).filter(p => p.kind === 'contact')
    .sort((a, c) => (c.tie?.score ?? 0) - (a.tie?.score ?? 0)), [b])
  const nContacts = useCountUp(contacts.length)

  if (route.tab === 'network' && route.theme) return <Theme name={route.theme} />

  const ql = q.toLowerCase()
  const filtered = q ? contacts.filter(c => (c.name + ' ' + c.headline + ' ' + c.positions.map(p => p.org).join(' ')).toLowerCase().includes(ql)) : contacts.slice(0, 8)
  const themes = b.network.expertise.themes.filter(t => t.portfolio.length && t.coverage !== 'outside portfolio')
  const weak = themes.filter(t => t.coverage === 'thin' || t.coverage === 'blind spot')
  const byKind = kind === 'all' ? b.network.notices : b.network.notices.filter(n => n.kind === kind)
  const notices = allNotices ? byKind : byKind.slice(0, 5)
  const kinds = (['path', 'reconnect', 'caution', 'gap'] as const).filter(k => b.network.notices.some(n => n.kind === k))
  const maxDepth = Math.max(...themes.map(t => t.depth), 1)
  const strong = contacts.filter(c => c.tie?.label === 'strong').length

  const act = (n: Notice) => {
    if (n.kind === 'path' && n.person) openPerson(n.person)
    else if (n.kind === 'reconnect' && n.contact) openPerson(n.contact)
    else if (n.kind === 'gap') { const t = themes.find(t => n.text.toLowerCase().includes(t.theme.toLowerCase())); if (t) go({ tab: 'network', theme: t.theme }) }
    else if (n.symbol) go({ tab: 'research', symbol: n.symbol })
  }

  return (
    <div className="screen">
      <div className="dateline rise"><span>Network</span><span className="bar" /><span>Private to you</span></div>
      <h1 className="h1 rise" style={{ '--i': 1 } as React.CSSProperties}>Who can <em>explain</em> it?</h1>
      <p className="lede rise" style={{ '--i': 2 } as React.CSSProperties}>The people you know, and exactly where their careers cross your portfolio.</p>

      <div className="card stats3 rise" style={{ '--i': 3 } as React.CSSProperties}>
        <div><div className="eyebrow">People</div><div className="v">{Math.round(nContacts)}</div><div className="tiny faint">{strong} strong ties</div></div>
        <div><div className="eyebrow">Noticed</div><div className="v">{b.network.notices.length}</div><div className="tiny faint">this week</div></div>
        <div><div className="eyebrow">Thin spots</div><div className={`v ${weak.length ? 'warn' : ''}`}>{weak.length}</div><div className="tiny faint">of {themes.length} themes</div></div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Noticed</h2>
        </div>
        <Seg items={[['all', 'All'] as const, ...kinds.map(k => [k, KIND[k].label] as const)]} value={kind} onChange={k => { setKind(k); setAllNotices(false) }} style={{ marginTop: 0, marginBottom: 12 }} />
        <div className="card list">
          {notices.map((n, i) => {
            const K = KIND[n.kind]
            return (
              <button key={i} className="notice li" onClick={() => act(n)}>
                <span className="notice-ic" style={{ '--h': K.hue } as React.CSSProperties}><K.icon size={17} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="eyebrow" style={{ color: `oklch(var(--tint-fg-l) var(--tint-fg-c) ${K.hue})` }}>{K.label}</span>
                    {n.symbol && <span className="sym" style={{ fontSize: 10.5 }}>{n.symbol}</span>}
                  </div>
                  <div className="small" style={{ marginTop: 3, fontWeight: 500 }}>{n.text}</div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>{n.detail}</div>
                </div>
                <span className="chev" style={{ marginTop: 8 }}><IChev size={16} /></span>
              </button>
            )
          })}
        </div>
        {byKind.length > 5 && (
          <button className="btn ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => setAllNotices(!allNotices)}>
            {allNotices ? 'Show fewer' : `Show all ${byKind.length}`}
          </button>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Coverage by theme</h2>
          {themes.length > weak.length && (
            <button className="tiny link" onClick={() => setAllThemes(!allThemes)}>
              {allThemes ? 'Only thin spots' : `+${themes.length - weak.length} well covered`}
            </button>
          )}
        </div>
        <div className="card list">
          {(allThemes ? themes : weak).map(t => (
            <button key={t.theme} className="cover li" onClick={() => go({ tab: 'network', theme: t.theme })}>
              <div style={{ minWidth: 0 }}>
                <div className="small strong ellipsis">{t.theme}</div>
                <div className="tiny muted ellipsis">{t.people[0] ? `Go-to: ${t.people[0].contact.name}` : 'Nobody yet'} · <span className="num">{t.portfolio.join(', ')}</span></div>
              </div>
              <div className="meter"><span style={{ width: `${Math.max(4, (t.depth / maxDepth) * 100)}%`, background: COVER[t.coverage].color }} /></div>
              <span className={`tag ${COVER[t.coverage].cls}`}>{t.coverage}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2 className="h2">People <span className="count num">{contacts.length}</span></h2>
        <div className="search" style={{ marginBottom: 6 }}><ISearch size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, company or role" /></div>
        <div className="list people-grid">
          {filtered.map(c => <PersonLine key={c.id} p={c} />)}
        </div>
        {!q && contacts.length > 8 && <p className="hint" style={{ marginTop: 10 }}>Showing your 8 strongest ties. Search to find anyone.</p>}
      </div>

      <p className="hint" style={{ marginTop: 36 }}>Private to you. Your network is never shared or used for anyone else. Contacts in this demo are fictional.</p>
    </div>
  )
}

function Theme({ name }: { name: string }) {
  const { b, go } = useApp()
  const t = b.network.expertise.themes.find(x => x.theme === name)
  const all = useMemo(() => Object.values(b.network.people).filter(p => p.kind === 'contact' && p.expertise?.some(([th]) => th === name))
    .map(p => ({ p, score: p.expertise!.find(([th]) => th === name)![1] })).sort((a, c) => c.score - a.score), [b, name])
  const top = Math.max(...all.map(x => x.score), 1)
  return (
    <div className="screen">
      <button className="back" onClick={() => history.back()}><IBack size={17} /> Network</button>
      <div className="dateline" style={{ marginTop: 16 }}><span>Theme</span><span className="bar" />{t && t.coverage !== 'outside portfolio' && <span className={`tag ${COVER[t.coverage].cls}`}>{t.coverage} coverage</span>}</div>
      <h1 className="h1">{name}</h1>
      {t && t.portfolio.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <span className="small muted">You own</span>
          {t.portfolio.map(s => <button key={s} className="toggle" style={{ height: 28 }} onClick={() => go({ tab: 'research', symbol: s })}><span className="sym">{s}</span></button>)}
        </div>
      )}
      <div className="section" style={{ marginTop: 32 }}>
        <h2 className="h2">Your go-to people <span className="count num">{all.length}</span></h2>
        {all.length ? (
          <div className="card list">
            {all.map(({ p, score }) => (
              <PersonLine key={p.id} p={p} sub={t?.people.find(x => x.contact.id === p.id)?.why ?? p.headline}
                right={<div className="meter" style={{ width: 56 }}><span style={{ width: `${(score / top) * 100}%`, background: 'var(--accent)' }} /></div>} />
            ))}
          </div>
        ) : (
          <div className="card card-pad">
            <p className="takeaway" style={{ fontSize: 22 }}>A blind spot.</p>
            <p className="small muted" style={{ margin: 0 }}>Nobody in your network has worked in {name.toLowerCase()}. Worth an expert-network call, or an introduction from someone in an adjacent industry.</p>
          </div>
        )}
      </div>
    </div>
  )
}
