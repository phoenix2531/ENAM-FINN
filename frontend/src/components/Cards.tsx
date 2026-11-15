import { useApp } from '../ctx'
import { ago, CATEGORY_LABEL, num, pct, sign } from '../format'
import { storyTitle, whyItRanks } from '../insight'
import type { Bundle, CallSuggestion, ResultsCard, Story, StoryPerson } from '../types'
import { IAlert, IChev, IPath, IPhone } from './Icons'
import { Avatar } from './People'
import { catHue, Delta } from './Viz'

export function CatTag({ c }: { c: string }) {
  return <span className="tag" style={{ '--h': catHue(c) } as React.CSSProperties}><span className="pip" />{CATEGORY_LABEL[c] ?? c}</span>
}

export function Reaction({ r }: { r: Story['reaction'] }) {
  if (!r || r.ret == null) return null
  return (
    <span>
      <span className={Math.abs(r.ret) >= 3 ? sign(r.ret) : ''}><Delta v={r.ret} d={1} /></span>
      <span className="muted"> next session{r.volx != null && r.volx >= 2 ? <>, <span className="num">{r.volx.toFixed(0)}×</span> volume</> : ''}</span>
    </span>
  )
}

// Amber only for warnings. Asset quality is neutral unless bad loans are rising.
const noteTone = (n: string) => n.startsWith('EBITDA margin') ? 'muted' : n.startsWith('Gross NPA') ? (/ up \d/.test(n) ? 'warn' : 'muted') : 'warn'

export function Results({ r }: { r: ResultsCard }) {
  return (
    <div className="results-wrap">
      <table className="results">
        <thead><tr><th>{r.label} · ₹ cr</th><th></th><th>QoQ</th><th>YoY</th></tr></thead>
        <tbody>
          {r.lines.map(l => (
            <tr key={l.metric}>
              <td>{l.metric}</td>
              <td>{num(l.value)}</td>
              <td className={sign(l.qoq)}>{pct(l.qoq)}</td>
              <td className={sign(l.yoy)}>{pct(l.yoy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Warnings (other income carrying profit, odd tax) beat the margin line, which the table already implies. */}
      {[...r.notes.filter(n => !n.startsWith('EBITDA margin')), ...r.notes.filter(n => n.startsWith('EBITDA margin'))].slice(0, 2).map(n => (
        <div key={n} className={`small row ${noteTone(n)}`} style={{ marginTop: 8, alignItems: 'flex-start', gap: 8 }}>
          {noteTone(n) === 'warn' && <span style={{ marginTop: 2 }}><IAlert size={14} /></span>}<span>{n}</span>
        </div>
      ))}
    </div>
  )
}

/** The new person, and your way in to them. */
export function PersonNote({ p }: { p: StoryPerson }) {
  const { openPerson } = useApp()
  const best = p.paths[0]
  return (
    <button className="note" onClick={() => openPerson(p.id)}>
      <div className="note-head">
        <Avatar p={{ name: p.name, kind: 'public' }} />
        <div className="grow">
          <div className="small"><span className="strong">{p.name}</span><span className="muted"> · {p.incoming ? 'incoming' : p.change}</span></div>
          {p.bio && <div className="tiny muted clamp2">{p.bio}</div>}
        </div>
        <span className="chev"><IChev size={16} /></span>
      </div>
      {best && (
        <div className="small row" style={{ marginTop: 10, gap: 8, alignItems: 'flex-start' }}>
          <span className="accent" style={{ marginTop: 1 }}><IPath size={16} /></span>
          <div><span className="accent strong">Your way in: {best.contact.name}</span><div className="muted tiny">{best.links[0].text}</div></div>
        </div>
      )}
    </button>
  )
}

/** The one person best placed to explain what happened. */
export function CallNote({ c, label = 'Who can explain this' }: { c: CallSuggestion; label?: string }) {
  const { openPerson } = useApp()
  return (
    <button className="note" onClick={() => openPerson(c.contact.id)}>
      <div className="note-head">
        <Avatar p={c.contact} />
        <div className="grow">
          <div className="eyebrow accent" style={{ color: 'var(--accent)' }}>{label}</div>
          <div className="small"><span className="strong">{c.contact.name}</span><span className="muted">, {c.credential}</span></div>
        </div>
        <span className="accent"><IPhone size={17} /></span>
      </div>
      {c.knows && <div className="small muted" style={{ marginTop: 8 }}>Knows {c.knows}.</div>}
      {c.caution && <div className="tiny warn row" style={{ marginTop: 6, gap: 6 }}><IAlert size={13} />{c.caution}</div>}
    </button>
  )
}

/** One line of the inbox: a headline and a preview. Opens the full story on its own page. */
export function StoryRow({ s, i = 0 }: { s: Story; i?: number }) {
  const { now, go, done } = useApp()
  const cleared = done.has(s.id)
  const person = leadPerson(s)
  const call = s.call?.[0]
  const { title, sub } = storyTitle(s)
  const why = whyItRanks(s)
  // The preview: why it ranks, then the person, the part you'd otherwise have to open it for.
  const who = person?.paths[0] ? `Way in: ${person.paths[0].contact.name}` : person ? `${person.name}, incoming`
    : call ? `Call ${call.contact.name}` : null
  const preview = [why, who].filter(Boolean).join(' · ') || sub || s.filings[0]?.title
  const open = () => { rememberBriefScroll(); go({ tab: 'story', id: s.id }) }

  return (
    <article className={`inbox-row ${cleared ? 'cleared' : ''}`} style={{ '--h': catHue(s.category), '--i': i } as React.CSSProperties}>
      <button className="inbox-head" onClick={open}>
        <span className={`inbox-dot ${cleared ? '' : 'on'}`} aria-label={cleared ? 'Done' : 'Open'} />
        <div className="inbox-body">
          <div className="inbox-meta">
            <span className="sym">{s.symbol}</span>
            <CatTag c={s.category} />
            {s.weight ? <span className="num hide-narrow">{s.weight}% of book</span> : null}
            <span className="grow" />
            {s.reaction?.ret != null && <span className="tiny"><Delta v={s.reaction.ret} d={1} pill /></span>}
            <span className="tiny faint inbox-time">{ago(s.published, now)}</span>
          </div>
          <div className="inbox-title ellipsis">{title}</div>
          {preview && <div className="inbox-preview ellipsis">{preview}</div>}
        </div>
        <span className="chev inbox-chev"><IChev size={16} /></span>
      </button>
    </article>
  )
}

/** The incoming executive worth showing, if the story has one. */
export const leadPerson = (s: Story) => (s.people ?? []).find(p => p.incoming && (p.bio || p.paths.length || p.career.length > 1))

// Where the Brief was scrolled when a story was opened, so "back" lands in the same place.
let briefScroll = 0
let openedFromBrief = false
export const rememberBriefScroll = () => { briefScroll = window.scrollY; openedFromBrief = true }
/** True when the story was opened from the Brief in this session (not a shared link). */
export const cameFromBrief = () => { const v = openedFromBrief; openedFromBrief = false; return v }
export const takeBriefScroll = () => { const y = briefScroll; briefScroll = 0; return y }

export function GlanceRow({ s }: { s: Story }) {
  const { now, go } = useApp()
  return (
    <button className="li top" onClick={() => go({ tab: 'research', symbol: s.symbol })} style={{ padding: '13px 16px' }}>
      <div className="grow">
        <div className="row tiny faint" style={{ gap: 10 }}><span className="sym">{s.symbol}</span><CatTag c={s.category} /><span className="grow" /><span>{ago(s.published, now)}</span></div>
        <div className="small clamp2" style={{ marginTop: 6 }}>{storyTitle(s).title}</div>
      </div>
      <span className="chev" style={{ marginTop: 22 }}><IChev size={16} /></span>
    </button>
  )
}

export function CalRow({ u }: { u: Bundle['brief']['upcoming'][number] }) {
  const d = new Date(u.date)
  return (
    <a className="cal li" href={u.url} target="_blank" rel="noreferrer">
      <div className="cal-date"><div className="m">{d.toLocaleDateString('en-IN', { month: 'short' })}</div><div className="d">{d.getDate()}</div></div>
      <div className="grow">
        <div className="sym">{u.symbol}</div>
        <div className="tiny muted clamp2">{u.what}</div>
      </div>
    </a>
  )
}
