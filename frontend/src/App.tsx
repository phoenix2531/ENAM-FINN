import { useCallback, useEffect, useMemo, useState } from 'react'
import { checkLive, live, loadBundle } from './api'
import { Ask } from './components/Ask'
import { IAlert, IBrief, ICheck, IMoon, INetwork, IResearch, ISearch, ISliders, ISun } from './components/Icons'
import { Avatar } from './components/People'
import { PersonSheet } from './components/PersonSheet'
import { CalRow } from './components/Cards'
import { bookToday, Delta, Spark } from './components/Viz'
import { AppCtx, type Ctx, fromHash, type Route, toHash, useApp } from './ctx'
import { About } from './screens/About'
import { Alerts } from './screens/Alerts'
import { Brief } from './screens/Brief'
import { Network } from './screens/Network'
import { Portfolio } from './screens/Portfolio'
import { Research } from './screens/Research'
import { StoryPage } from './screens/Story'
import { allHits } from './signals'
import { storyTitle } from './insight'
import { rememberBriefScroll } from './components/Cards'
import { usePersisted } from './store'
import type { AlertRules, Bundle } from './types'

const TABS = [
  { tab: 'brief', label: 'Brief', icon: IBrief, key: 'B' },
  { tab: 'research', label: 'Research', icon: IResearch, key: 'R' },
  { tab: 'network', label: 'Network', icon: INetwork, key: 'N' },
] as const

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export default function App() {
  const [b, setB] = useState<Bundle | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loc, setLoc] = useState(() => fromHash(location.hash))
  const [done, setDone] = usePersisted<string[]>('done', [])
  const [rules, setRulesState] = usePersisted<AlertRules | null>('rules', null)
  const [called, setCalled] = usePersisted<Record<string, string>>('called', {})
  const [theme, setTheme] = usePersisted<'light' | 'dark' | null>('theme', null)
  const [toastMsg, setToast] = useState<string | null>(null)
  const [isLive, setLive] = useState(live)

  useEffect(() => { loadBundle().then(setB).catch(e => setErr(String(e))); checkLive().then(setLive) }, [])
  useEffect(() => {
    const on = () => setLoc(fromHash(location.hash))
    window.addEventListener('hashchange', on)
    const key = (e: KeyboardEvent) => {
      const inField = !!(e.target as HTMLElement).closest('input, textarea')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !inField)) {
        e.preventDefault(); location.hash = `${location.hash.split('?')[0] || '#/brief'}?ask=`
        return
      }
      // g-style single-key jumps when nothing is focused and no overlay is open
      if (inField || e.metaKey || e.ctrlKey || e.altKey || location.hash.includes('?')) return
      const t = TABS.find(x => x.key.toLowerCase() === e.key.toLowerCase())
      if (t) { location.hash = `#/${t.tab}`; window.scrollTo(0, 0) }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('keydown', key) }
  }, [])
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t) }, [toastMsg])
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])

  const toggleTheme = () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(dark ? 'light' : 'dark')
  }

  const go = useCallback((r: Route) => { location.hash = toHash(r); window.scrollTo(0, 0) }, [])
  const openPerson = useCallback((id: string) => { location.hash = `${location.hash.split('?')[0] || '#/brief'}?p=${encodeURIComponent(id)}` }, [])
  const openAsk = useCallback((q = '') => { location.hash = `${location.hash.split('?')[0] || '#/brief'}?ask=${encodeURIComponent(q)}` }, [])
  // Close by replacing the history entry: works the same whether the sheet was
  // opened in-app or from a shared deep link (where "back" would leave the app).
  const closeOverlay = useCallback(() => {
    const to = location.hash.split('?')[0] || '#/brief'
    history.replaceState(null, '', to)
    setLoc(fromHash(to))
  }, [])

  const ctx: Ctx | null = useMemo(() => !b ? null : ({
    b, now: new Date(b.meta.generated_at), route: loc.route, go, openPerson, openAsk,
    done: new Set(done),
    toggleDone: (id: string) => setDone(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]),
    rules: rules ?? b.alert_rules,
    setRules: (r: AlertRules) => setRulesState(r),
    called,
    logCall: (id: string) => setCalled(c => ({ ...c, [id]: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) })),
    toast: setToast,
  }), [b, loc.route, done, rules, called, go, openPerson, openAsk, setDone, setRulesState, setCalled])

  if (err) return (
    <div className="screen"><div className="empty">
      <div className="brand" style={{ justifyContent: 'center' }}><BrandMark />FINN</div>
      <h1 className="h1" style={{ marginTop: 24 }}>FINN couldn't load.</h1><p className="muted">{err}</p>
    </div></div>
  )
  if (!ctx) return <Loading />

  const tab = loc.route.tab
  const activeTab = tab === 'alerts' || tab === 'story' ? 'brief' : tab
  const openCount = ctx.b.brief.stories.filter(s => s.tier === 'act' && !ctx.done.has(s.id) && ctx.now.getTime() - new Date(s.published).getTime() <= 168 * 3.6e6).length
  const dark = theme ? theme === 'dark' : typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  const themeBtn = (
    <button className="icon-btn" onClick={toggleTheme} aria-label={dark ? 'Light mode' : 'Dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <ISun size={18} /> : <IMoon size={18} />}
    </button>
  )

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="side-inner">
            <button className="brand" onClick={() => go({ tab: 'about' })} aria-label="About FINN" title="About FINN"><BrandMark />FINN</button>
            <nav className="nav">
              {TABS.map(t => (
                <button key={t.tab} className={`nav-item ${activeTab === t.tab && tab !== 'alerts' ? 'on' : ''}`} onClick={() => go({ tab: t.tab } as Route)}>
                  <t.icon size={19} />{t.label}
                  {t.tab === 'brief' && openCount > 0 && <span className="badge">{openCount}</span>}
                  <span className="kbd">{t.key}</span>
                </button>
              ))}
              <button className={`nav-item ${tab === 'alerts' ? 'on' : ''}`} onClick={() => go({ tab: 'alerts' })}>
                <ISliders size={19} />Alert rules
              </button>
            </nav>
            <SideCalendar />
            <SideAlerts />
            <div className="side-foot">
              <div className="side-status"><span className={`live-dot ${isLive ? 'on' : ''}`} />{isLive ? 'Live · FINN server' : 'Snapshot'} · {new Date(ctx.b.meta.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        </aside>

        <div className="main-col">
          <header className="topbar">
            <button className="brand" onClick={() => go({ tab: 'about' })} aria-label="About FINN" title="About FINN"><BrandMark />FINN</button>
            <button className="search-trigger" onClick={() => openAsk('')} aria-label="Ask FINN">
              <ISearch size={16} /><span className="ellipsis">Ticker, person, theme…</span><span className="kbd">{isMac ? '⌘K' : '/'}</span>
            </button>
            <span className="grow" style={{ flex: '0 1 auto' }} />
            <span className="hide-desk row" style={{ gap: 6 }}>
              <span className={`live-dot ${isLive ? 'on' : ''}`} title={isLive ? 'Connected to the FINN server' : 'Static snapshot'} />
              {themeBtn}
            </span>
            <span className="show-desk">{themeBtn}</span>
            <button className={`me me-top ${tab === 'portfolio' ? 'on' : ''}`} onClick={() => go({ tab: 'portfolio' })} aria-label="Your portfolio" title="Your portfolio">
              <Avatar p={{ name: ctx.b.meta.investor.name }} />
              <div className="me-text">
                <div className="small strong ellipsis">{ctx.b.meta.investor.name}</div>
                <div className="tiny faint ellipsis">{ctx.b.meta.investor.role}, {ctx.b.meta.investor.fund}</div>
              </div>
            </button>
          </header>
          <Tape />

          <main key={tab + ((loc.route as { symbol?: string }).symbol ?? '') + ((loc.route as { id?: string }).id ?? '')}>
            {tab === 'brief' && <Brief />}
            {tab === 'alerts' && <Alerts />}
            {tab === 'about' && <About />}
            {tab === 'portfolio' && <Portfolio />}
            {loc.route.tab === 'story' && <StoryPage id={loc.route.id} />}
            {tab === 'research' && <Research />}
            {tab === 'network' && <Network />}
          </main>
        </div>

        <aside className="book-rail"><div className="rail-inner"><BookRail /></div></aside>
      </div>

      <nav className="tabbar">
        {TABS.map(t => (
          <button key={t.tab} className={`tab ${activeTab === t.tab ? 'on' : ''}`} onClick={() => go({ tab: t.tab } as Route)} aria-label={t.label}>
            <t.icon size={20} /><span className="tl">{t.label}</span>
            {t.tab === 'brief' && openCount > 0 && <span className="badge">{openCount}</span>}
          </button>
        ))}
      </nav>

      {loc.person && <PersonSheet id={loc.person} onClose={closeOverlay} />}
      {loc.ask !== undefined && <Ask initial={loc.ask} onClose={closeOverlay} />}
      {toastMsg && <div className="toast" role="status"><span className="ok"><ICheck size={12} /></span>{toastMsg}</div>}
    </AppCtx.Provider>
  )
}

/** The whole book scrolling past, like the tape on a desk. */
function Tape() {
  const { b, go } = useApp()
  const items = [...b.portfolio].sort((a, c) => c.weight - a.weight)
  const row = (k: string) => items.map(h => (
    <button key={k + h.symbol} className="tape-item" onClick={() => go({ tab: 'research', symbol: h.symbol })} tabIndex={k === 'b' ? -1 : 0}>
      <span className="s">{h.symbol}</span>
      <span className="p">{h.price?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      <Delta v={h.ret_1d} />
    </button>
  ))
  return <div className="tape" aria-label="Portfolio prices"><div className="tape-track">{row('a')}<span aria-hidden style={{ display: 'contents' }}>{row('b')}</span></div></div>
}

/** Right rail on wide screens: the book at a glance and what's coming. */
function BookRail() {
  const { b, go } = useApp()
  const t = bookToday(b)
  const movers = [...b.portfolio].sort((a, c) => Math.abs(c.ret_1d ?? 0) - Math.abs(a.ret_1d ?? 0)).slice(0, 7)
  return (
    <>
      <div className="card card-pad">
        <div className="row between"><span className="eyebrow">Your book today</span><span className="tiny faint num">{b.portfolio.length} names</span></div>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <span className={`num ${t.ret >= 0 ? 'up' : 'down'}`} style={{ fontSize: 34, letterSpacing: '-0.05em', lineHeight: 1 }}>{t.ret >= 0 ? '+' : '−'}{Math.abs(t.ret).toFixed(2)}%</span>
          <span className="grow" />
          <Spark data={t.idx} w={110} h={36} />
        </div>
        <div className="breadth">
          <span style={{ flex: t.upN, background: 'var(--up)' }} />
          {t.flat > 0 && <span style={{ flex: t.flat, background: 'var(--line-2)' }} />}
          <span style={{ flex: t.downN, background: 'var(--down)' }} />
        </div>
        <div className="row between tiny" style={{ marginTop: 6 }}>
          <span className="up num">{t.upN} up</span><span className="faint">weighted, 1 day · {t.idx.length}d trend</span><span className="down num">{t.downN} down</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="h2">Biggest movers</span></div>
        <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
          {movers.map(h => (
            <button key={h.symbol} className="li" onClick={() => go({ tab: 'research', symbol: h.symbol })} style={{ padding: '10px 16px' }}>
              <div className="grow">
                <div className="sym">{h.symbol}</div>
                <div className="tiny faint">{h.weight}% of book</div>
              </div>
              <Spark data={h.stats.slice(-30).map(s => s.close)} w={64} h={24} dot={false} />
              <Delta v={h.ret_1d} pill className="num" />
            </button>
          ))}
        </div>
      </div>

      <p className="hint" style={{ padding: '18px 4px 0' }}>Prices as of {new Date(b.meta.today).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} close. FINN reads exchange filings and earnings calls; it never trades.</p>
    </>
  )
}

/** Left panel: upcoming board meetings and results dates for the book. */
function SideCalendar() {
  const { b, now } = useApp()
  const upcoming = b.brief.upcoming.filter(u => new Date(u.date) >= new Date(now.toDateString())).slice(0, 4)
  if (!upcoming.length) return null
  return (
    <>
      <div className="side-label eyebrow">On the calendar</div>
      <div className="card list side-cal">
        {upcoming.map(u => <CalRow key={u.symbol + u.date} u={u} />)}
      </div>
    </>
  )
}

/** Left panel: what crossed your alert rules in the last week of sessions, most important first. */
function SideAlerts() {
  const { b, rules, go } = useApp()
  const hits = useMemo(() => {
    const dates = b.portfolio[0]?.stats.map(s => s.date) ?? []
    const since = dates[Math.max(0, dates.length - 5)]
    // Importance: size of the move × position weight; a move no filing explains gets a boost.
    const score = (h: ReturnType<typeof allHits>[number]) =>
      (Math.abs(h.ret ?? 0) + Math.min(h.volx ?? 0, 10)) * (1 + h.weight / 5) * (h.story ? 1 : 1.5)
    return allHits(b, rules, since).sort((a, c) => score(c) - score(a))
  }, [b, rules])
  return (
    <>
      <div className="side-label eyebrow row between">
        <span>Important alerts</span>
        {hits.length > 0 && <span className="side-count num">{hits.length}</span>}
      </div>
      <div className="card list side-alerts">
        {hits.length === 0 && <div className="tiny faint" style={{ padding: '12px' }}>Nothing crossed your rules in the last 5 sessions.</div>}
        {hits.slice(0, 4).map(h => (
          <button key={h.symbol + h.date} className="li side-alert"
            onClick={() => h.story ? (rememberBriefScroll(), go({ tab: 'story', id: h.story.id })) : go({ tab: 'research', symbol: h.symbol })}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="sym">{h.symbol}</span>
                <span className="grow" />
                <Delta v={h.ret} d={1} pill />
              </div>
              <div className="tiny faint" style={{ marginTop: 3 }}>
                {new Date(h.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {h.volx != null && h.volx >= rules.volume_multiple ? ` · ${h.volx.toFixed(1)}× vol` : ''}
              </div>
              <div className={`tiny ellipsis ${h.story ? 'muted' : 'warn'}`} style={{ marginTop: 3 }}>
                {h.story ? storyTitle(h.story).title : <><IAlert size={11} /> No filing explains this</>}
              </div>
            </div>
          </button>
        ))}
        <button className="li side-alert-more tiny" onClick={() => go({ tab: 'alerts' })}>
          <span className="grow">{hits.length > 4 ? `+${hits.length - 4} more` : `${rules.volume_multiple}× · ±${rules.price_move_pct}%`}</span>
          <span className="link">Edit rules</span>
        </button>
      </div>
    </>
  )
}

const BrandMark = () => (
  <span className="brand-mark" aria-hidden>
    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 13V1.5h8.5M3 7h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" /></svg>
  </span>
)

function Loading() {
  return (
    <div className="shell">
      <div className="screen" style={{ paddingTop: 56 }}>
        <div className="brand"><BrandMark />FINN</div>
        <div className="skeleton" style={{ height: 14, marginTop: 40, width: 180 }} />
        <div className="skeleton" style={{ height: 56, marginTop: 14, width: '70%' }} />
        <div className="skeleton" style={{ height: 84, marginTop: 28 }} />
        <div className="skeleton" style={{ height: 180, marginTop: 18 }} />
        <div className="skeleton" style={{ height: 180, marginTop: 14 }} />
      </div>
    </div>
  )
}
