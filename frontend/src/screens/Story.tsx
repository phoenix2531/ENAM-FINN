import { CallNote, CatTag, cameFromBrief, leadPerson, PersonNote, Reaction, Results } from '../components/Cards'
import { IAlert, IArrow, IBack, ICheck, IDoc, IExt } from '../components/Icons'
import { PriceChart } from '../components/PriceChart'
import { useApp } from '../ctx'
import { ago, day } from '../format'
import { storyTitle, whyItRanks } from '../insight'

/** One story from the Brief, on its own page. */
export function StoryPage({ id }: { id: string }) {
  const { b, now, go, done, toggleDone } = useApp()
  const s = b.brief.stories.find(x => x.id === id)

  // Back to the Brief: a real history step when we came from there, so scroll position is kept.
  const back = () => { if (cameFromBrief() && history.length > 1) history.back(); else go({ tab: 'brief' }) }
  const backBtn = <button className="back" onClick={back}><IBack size={17} /> Brief</button>

  if (!s) return (
    <div className="screen">
      {backBtn}
      <h1 className="h1" style={{ marginTop: 24 }}>Story not found.</h1>
      <p className="lede">It may have dropped out of the current snapshot.</p>
    </div>
  )

  const cleared = done.has(s.id)
  const person = leadPerson(s)
  const others = (s.people ?? []).filter(p => p !== person && (p.bio || p.paths.length))
  const { title, sub } = storyTitle(s)
  const why = whyItRanks(s)
  const h = b.portfolio.find(x => x.symbol === s.symbol)

  return (
    <div className="screen story-page">
      {backBtn}

      <div className="story-page-meta">
        <span className="sym">{s.symbol}</span>
        <CatTag c={s.category} />
        {s.weight ? <span className="tiny faint num">{s.weight}% of book</span> : null}
        <span className="grow" />
        <span className="tiny faint">{ago(s.published, now)}</span>
      </div>
      <h1 className="story-page-title">{title}</h1>
      {sub && <p className="lede">{sub}</p>}

      {h && h.stats.length > 1 && (
        <div className="card card-pad story-page-chart">
          <PriceChart stats={h.stats} eventDate={s.published} />
        </div>
      )}

      <div className="card card-pad story-page-card">
        <div className="story-head" style={{ marginTop: 0 }}>
          <div>
            <div className="small strong">{s.company}</div>
            {(why || s.reaction?.ret != null) && (
              <div className="story-why">
                {why && <span>{why}</span>}
                {s.reaction?.ret != null && <span><Reaction r={s.reaction} /></span>}
              </div>
            )}
          </div>
        </div>

        {s.results && <Results r={s.results} />}
        {person && <PersonNote p={person} />}
        {others.map(p => <PersonNote key={p.id} p={p} />)}
        {!person && s.call?.map((c, i) => <CallNote key={c.contact.id} c={c} label={i === 0 ? 'Who can explain this' : 'Also knows this'} />)}
        {s.caution && <div className="flag watch" style={{ marginTop: 12 }}><span className="warn"><IAlert size={16} /></span><span>{s.caution}</span></div>}

        <div className="story-actions">
          <button className={`act-btn ${cleared ? 'done' : ''}`} onClick={() => toggleDone(s.id)}><ICheck size={15} />{cleared ? 'Done' : 'Mark done'}</button>
          <a className="act-btn" href={s.filings[0].url} target="_blank" rel="noreferrer"><IDoc size={15} />Filing</a>
          <button className="act-btn primary" onClick={() => go({ tab: 'research', symbol: s.symbol, section: s.transcript ? 'promises' : undefined })}>
            Research {s.symbol} <IArrow size={15} />
          </button>
        </div>
      </div>

      <div className="section">
        <h2 className="h2">{s.filings.length === 1 ? 'The filing' : `The filings`} <span className="count num">{s.filings.length}</span></h2>
        <div className="card list">
          {s.filings.map(f => (
            <a key={f.url + f.title} className="li top" href={f.url} target="_blank" rel="noreferrer" style={{ padding: '13px 16px' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row tiny faint" style={{ gap: 10 }}><CatTag c={f.category} /><span className="grow" /><span>{day(f.published)}</span></div>
                <div className="small strong" style={{ marginTop: 6 }}>{f.title}</div>
                {f.excerpt && <div className="small muted" style={{ marginTop: 4 }}>{f.excerpt}</div>}
              </div>
              <span className="faint" style={{ marginTop: 22 }}><IExt size={15} /></span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
