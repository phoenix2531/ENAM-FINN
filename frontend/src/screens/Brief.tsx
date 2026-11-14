import { useMemo, useState } from 'react'
import { GlanceRow, StoryRow } from '../components/Cards'
import { IChev, IDoc, ISliders } from '../components/Icons'
import { bookToday, Delta, Seg, Spark, useCountUp } from '../components/Viz'
import { useApp } from '../ctx'
import { day } from '../format'
import { storyTitle } from '../insight'
import { allHits } from '../signals'
import { usePersisted } from '../store'

const WINDOWS = [
  { key: '24h', label: 'Today', hours: 24 },
  { key: '3d', label: '3 days', hours: 72 },
  { key: '7d', label: 'Week', hours: 168 },
  { key: '30d', label: 'Month', hours: 720 },
]

const TOP = 5 // a brief is finite: the rest is one tap away

export function Brief() {
  const { b, now, done, rules, go } = useApp()
  // Until the investor picks a window: today, or the week if today was quiet.
  const [picked, setWin] = usePersisted<string | null>('window', null)
  const quietToday = useMemo(() => !b.brief.stories.some(s => s.tier === 'act' && now.getTime() - new Date(s.published).getTime() <= 24 * 3.6e6), [b, now])
  const win = picked ?? (quietToday ? '7d' : '24h')
  const [showRoutine, setShowRoutine] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const hours = WINDOWS.find(w => w.key === win)?.hours ?? 24
  const since = new Date(now.getTime() - hours * 3.6e6)

  const { act, glance, calls, routine, weekAct } = useMemo(() => {
    const inWin = b.brief.stories.filter(s => new Date(s.published) >= since)
    const weekStart = new Date(now.getTime() - 168 * 3.6e6)
    return {
      act: inWin.filter(s => s.tier === 'act').sort((a, c) => Number(done.has(a.id)) - Number(done.has(c.id)) || c.rank - a.rank),
      glance: inWin.filter(s => s.tier === 'glance' && s.category !== 'earnings_call'),
      calls: inWin.filter(s => s.category === 'earnings_call'),
      routine: b.brief.routine.filter(r => new Date(r.published) >= since),
      weekAct: b.brief.stories.filter(s => s.tier === 'act' && new Date(s.published) >= weekStart).length,
    }
  }, [b, hours, now, done]) // since is derived from hours and now

  const hits = useMemo(() => allHits(b, rules, since.toISOString().slice(0, 10)), [b, rules, hours, now])
  const openStories = act.filter(s => !done.has(s.id))
  const cleared = act.filter(s => done.has(s.id))
  const open = openStories.length
  const shown = useCountUp(open)
  const book = useMemo(() => bookToday(b), [b])
  const upcoming = b.brief.upcoming.filter(u => new Date(u.date) >= new Date(now.toDateString()))
  const maxMove = Math.max(...hits.slice(0, 5).map(h => Math.abs(h.ret ?? 0)), 1)
  const first = b.meta.investor.name.split(' ')[0]

  return (
    <div className="screen">
      <div className="dateline rise">
        <span>{new Date(b.meta.today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span className="bar" />
        <span>Brief for {first}</span>
      </div>
      <h1 className="h1 rise" style={{ '--i': 1 } as React.CSSProperties}>
        {open > 0
          ? <><em>{Math.round(shown)}</em> {open === 1 ? 'thing needs' : 'things need'} you</>
          : act.length > 0 ? <>You're <em>caught up</em></> : <>Nothing needs you</>}
      </h1>
      <p className="lede rise" style={{ '--i': 2 } as React.CSSProperties}>
        {!picked && quietToday ? 'A quiet day, so here is your week. ' : ''}
        Ranked by what moves your book: weight, severity, and whether the market noticed.
      </p>

      <div className="card book hide-wide rise" style={{ '--i': 3 } as React.CSSProperties}>
        <div>
          <div className="eyebrow">Book today</div>
          <div className={`v ${book.ret >= 0 ? 'up' : 'down'}`}>{book.ret >= 0 ? '+' : '−'}{Math.abs(book.ret).toFixed(2)}%</div>
          <div style={{ marginTop: 6 }}><Spark data={book.idx} w={120} h={22} dot={false} /></div>
        </div>
        <div>
          <div className="eyebrow">Breadth</div>
          <div className="v"><span className="up">{book.upN}</span><span className="faint">/</span><span className="down">{book.downN}</span></div>
          <div className="breadth"><span style={{ flex: book.upN, background: 'var(--up)' }} /><span style={{ flex: Math.max(book.flat, 0.0001), background: 'var(--line-2)' }} /><span style={{ flex: book.downN, background: 'var(--down)' }} /></div>
        </div>
        <button onClick={() => go({ tab: 'alerts' })} style={{ textAlign: 'left' }}>
          <div className="eyebrow">Unusual moves</div>
          <div className="v">{hits.length}</div>
          <div className="sub">{rules.volume_multiple}× vol · ±{rules.price_move_pct}%</div>
        </button>
        <div>
          <div className="eyebrow">Next event</div>
          {upcoming[0] ? <>
            <div className="v" style={{ fontSize: 18, marginTop: 6 }}>{upcoming[0].symbol}</div>
            <div className="sub">{new Date(upcoming[0].date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          </> : <div className="v faint">—</div>}
        </div>
      </div>

      <Seg items={WINDOWS.map(w => [w.key, w.label] as const)} value={win} onChange={setWin} style={{ marginTop: 26 }} />

      {act.length === 0 && weekAct > 0 && hours < 168 && (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="takeaway" style={{ fontSize: 22 }}>A quiet stretch.</div>
          <button className="link small" onClick={() => setWin('7d')}>See the {weekAct} that needed you this week →</button>
        </div>
      )}

      {/* An inbox: every open story as one scannable row, then what you've cleared. Tap a row to read it. */}
      {act.length > 0 && (
        <div className="card inbox rise" style={{ '--i': 4 } as React.CSSProperties}>
          {(showAll ? act : [...openStories.slice(0, TOP), ...cleared]).map((s, i) => (
            <StoryRow key={s.id} s={s} i={i} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
          ))}
          {openStories.length > TOP && (
            <button className="inbox-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `${openStories.length - TOP} more, lower priority`}
            </button>
          )}
        </div>
      )}

      {hits.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2 className="h2">Unusual moves <span className="count num">{hits.length}</span></h2>
            <button className="tag plain" onClick={() => go({ tab: 'alerts' })}><ISliders size={13} />{rules.volume_multiple}× · ±{rules.price_move_pct}%</button>
          </div>
          <div className="card list">
            {hits.slice(0, 5).map(h => (
              <button key={h.symbol + h.date} className="move li" onClick={() => go({ tab: 'research', symbol: h.symbol })}>
                <div>
                  <div className="sym">{h.symbol}</div>
                  <div className="tiny faint">{day(h.date)}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={`small clamp2 ${h.story ? '' : 'warn'}`}>{h.story ? storyTitle(h.story).title : 'No filing explains this move'}</div>
                  {h.volx ? <div className="tiny faint num" style={{ marginTop: 2 }}>{h.volx.toFixed(1)}× average volume</div> : null}
                </div>
                <div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}><Delta v={h.ret} d={1} pill /></div>
                  <div className="move-bar">
                    <span className="axis" />
                    <span className={`fill ${(h.ret ?? 0) >= 0 ? 'up' : 'down'}`} style={{ width: `${(Math.abs(h.ret ?? 0) / maxMove) * 50}%` }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {calls.length > 0 && (
        <div className="section">
          <h2 className="h2">Earnings calls, read for you</h2>
          <div className="card card-pad">
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {calls.map(c => (
                <button key={c.id} className="toggle" onClick={() => go({ tab: 'research', symbol: c.symbol, section: 'promises' })}>
                  <IDoc size={14} /><span className="sym">{c.symbol}</span>
                </button>
              ))}
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>Every promise in these calls has been checked against the reported numbers. Their ledgers are updated.</p>
          </div>
        </div>
      )}

      {glance.length > 0 && (
        <div className="section">
          <h2 className="h2">Worth a glance <span className="count num">{glance.length}</span></h2>
          <div className="card list">{glance.map(s => <GlanceRow key={s.id} s={s} />)}</div>
        </div>
      )}

      {routine.length > 0 && (
        <div className="section">
          <div className="card">
            <button className="li" style={{ padding: '14px 16px' }} onClick={() => setShowRoutine(!showRoutine)}>
              <span className="grow small"><span className="num strong">{routine.length}</span> <span className="muted">routine filings filed away so you don't have to read them</span></span>
              <span className="chev" style={{ transform: showRoutine ? 'rotate(90deg)' : undefined }}><IChev size={16} /></span>
            </button>
            {showRoutine && (
              <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
                {routine.map(r => (
                  <a key={r.url} className="li" href={r.url} target="_blank" rel="noreferrer" style={{ padding: '10px 16px' }}>
                    <span className="sym" style={{ width: 92, flex: 'none' }}>{r.symbol}</span>
                    <span className="small muted grow ellipsis">{r.excerpt || r.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
