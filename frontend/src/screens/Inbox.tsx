import { useMemo } from 'react'
import { type CallPick, friendsToCall, importantAlerts, orgShort } from '../alertLists'
import { rememberBriefScroll } from '../components/Cards'
import { IAlert, IBack, IChev, ISliders } from '../components/Icons'
import { Avatar } from '../components/People'
import { Delta, Seg, Tie } from '../components/Viz'
import { useApp } from '../ctx'
import { storyTitle } from '../insight'
import type { Hit } from '../signals'

const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** One price/volume alert. Opens the story that explains it, or the company when nothing does. */
export function MoveAlert({ h, compact, rank }: { h: Hit; compact?: boolean; rank?: number }) {
  const { rules, go } = useApp()
  const open = () => h.story ? (rememberBriefScroll(), go({ tab: 'story', id: h.story.id })) : go({ tab: 'research', symbol: h.symbol })
  const vol = h.volx != null && h.volx >= rules.volume_multiple ? `${h.volx.toFixed(1)}× vol` : ''
  if (compact) return (
    <button className="li side-alert" onClick={open}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="sym">{h.symbol}</span>
          <span className="grow" />
          <Delta v={h.ret} d={1} pill />
        </div>
        <div className="tiny faint" style={{ marginTop: 3 }}>
          {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{vol ? ` · ${vol}` : ''}
        </div>
        <div className={`tiny ellipsis ${h.story ? 'muted' : 'warn'}`} style={{ marginTop: 3 }}>
          {h.story ? storyTitle(h.story).title : <><IAlert size={11} /> No filing explains this</>}
        </div>
      </div>
    </button>
  )
  return (
    <button className="li ib-row" onClick={open}>
      <span className="num tiny faint ib-rank">{rank}</span>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="sym">{h.symbol}</span>
          <span className="tiny faint ellipsis">{h.name.replace(/ (Ltd|Limited)\.?$/, '')} · {h.weight}% of book</span>
        </div>
        <div className={`small ${h.story ? '' : 'warn'}`} style={{ marginTop: 4 }}>
          {h.story ? storyTitle(h.story).title : <><IAlert size={13} /> No filing explains this move</>}
        </div>
        <div className="tiny faint" style={{ marginTop: 3 }}>{day(h.date)}{h.why.length ? ` · ${h.why.join(', ')}` : ''}</div>
      </div>
      <Delta v={h.ret} d={1} pill />
      <span className="chev"><IChev size={15} /></span>
    </button>
  )
}

/** One friend worth calling, with the reasons. */
export function CallAlert({ c, compact }: { c: CallPick; compact?: boolean }) {
  const { openPerson, go } = useApp()
  const { p, best, more, reasons } = c
  const insider = <span className="side-insider" title="Current employee: possible insider. Check the trading window before discussing.">insider</span>
  if (compact) return (
    <button className="li side-call" onClick={() => openPerson(p.id)}>
      <Avatar p={p} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="small strong ellipsis">{p.name}</span>
          <span className="grow" />
          {best.move != null && <Delta v={best.move} d={1} pill />}
        </div>
        <div className="tiny side-call-org ellipsis">
          {best.current ? 'At ' : 'Ex-'}{orgShort(best.org)}{more > 0 ? ` · +${more} more` : ''}
          {best.current && insider}
        </div>
        <div className="tiny muted ellipsis" style={{ marginTop: 2 }}>{best.text}</div>
        <div className="tiny faint ellipsis" style={{ marginTop: 2 }}>{p.tie?.last}</div>
      </div>
    </button>
  )
  return (
    <div className="ib-call">
      <button className="ib-call-head" onClick={() => openPerson(p.id)}>
        <Avatar p={p} />
        <div style={{ minWidth: 0 }} className="grow">
          <div className="row" style={{ gap: 8 }}>
            <span className="strong">{p.name}</span>
            <Tie tie={p.tie} />
            <span className="tiny faint">{p.tie?.last}</span>
          </div>
          <div className="tiny muted ellipsis">{p.headline}{p.tie?.how ? ` · ${p.tie.how}` : ''}</div>
        </div>
        <span className="link small">Profile</span>
      </button>
      <div className="ib-reasons">
        {reasons.map((r, i) => (
          <button key={r.symbol + r.date + i} className="ib-reason" onClick={() => r.storyId ? (rememberBriefScroll(), go({ tab: 'story', id: r.storyId })) : go({ tab: 'research', symbol: r.symbol })}>
            <div style={{ minWidth: 0 }}>
              <div className="tiny side-call-org">
                {r.current ? 'At ' : 'Ex-'}{orgShort(r.org)} <span className="sym faint" style={{ marginLeft: 4 }}>{r.symbol}</span>
                {r.current && insider}
              </div>
              <div className="small" style={{ marginTop: 2 }}>{r.text}</div>
              <div className="tiny faint">{day(r.date)}</div>
            </div>
            {r.move != null ? <Delta v={r.move} d={1} pill /> : <span />}
            <span className="chev"><IChev size={14} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Every alert in one place: moves past your rules, and friends you have a reason to call. */
export function Inbox({ kind }: { kind: 'moves' | 'friends' }) {
  const { b, now, rules, go } = useApp()
  const moves = useMemo(() => importantAlerts(b, rules), [b, rules])
  const calls = useMemo(() => friendsToCall(b, rules, now), [b, rules, now])

  return (
    <div className="screen">
      <button className="back" onClick={() => go({ tab: 'brief' })}><IBack size={17} /> Brief</button>
      <div className="dateline" style={{ marginTop: 16 }}><span>Alerts</span><span className="bar" /><span>Last 5 sessions</span></div>
      <h1 className="h1">{kind === 'moves' ? <>What crossed <em>your lines</em></> : <>Who to <em>call</em>, and why</>}</h1>
      <p className="lede">
        {kind === 'moves'
          ? 'Every move in your portfolio past your alert rules, most important first: move size × position weight, with unexplained moves ranked higher.'
          : 'Friends whose current or former employer just moved past your rules or has an open story. Former staff are usually the safer call; current staff are possible insiders.'}
      </p>

      <div className="row between" style={{ marginTop: 22, gap: 12, flexWrap: 'wrap' }}>
        <Seg items={[['moves', `Moves · ${moves.length}`], ['friends', `Friends to call · ${calls.length}`]] as const}
          value={kind} onChange={k => go({ tab: 'inbox', kind: k })} />
        <button className="tag plain" onClick={() => go({ tab: 'alerts' })}><ISliders size={13} />{rules.volume_multiple}× · ±{rules.price_move_pct}%</button>
      </div>

      {kind === 'moves' ? (
        <div className="card list" style={{ marginTop: 16 }}>
          {moves.length === 0 && <div className="small muted card-pad">Nothing crossed your rules in the last 5 sessions.</div>}
          {moves.map((h, i) => <MoveAlert key={h.symbol + h.date} h={h} rank={i + 1} />)}
        </div>
      ) : (
        <div className="ib-calls" style={{ marginTop: 16 }}>
          {calls.length === 0 && <div className="card small muted card-pad">No friend has a fresh reason to call.</div>}
          {calls.map(c => <CallAlert key={c.p.id} c={c} />)}
        </div>
      )}
    </div>
  )
}
