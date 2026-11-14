import { useEffect, useState } from 'react'
import { Hit, loadCompanies, matchCompanies, searchCompanies } from '../api'
import { IArrow, IChev, ISearch } from '../components/Icons'
import { Delta, Spark } from '../components/Viz'
import { useApp } from '../ctx'
import { Dossier } from './Dossier'

export function Research() {
  const { b, route, go } = useApp()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const [list, setList] = useState<[string, string][]>([])
  const [sort, setSort] = useState<'weight' | 'move'>('weight')

  useEffect(() => { loadCompanies().then(setList) }, [])

  // Autocomplete: instant from the bundled NSE list. Only when that finds
  // nothing (e.g. a BSE-only name) ask the backend, debounced.
  useEffect(() => {
    const term = q.trim()
    setActive(0)
    if (!term) { setHits([]); setSearching(false); return }
    const local = matchCompanies(list, term)
    setHits(local)
    if (local.length || term.length < 3) { setSearching(false); return }
    setSearching(true)
    let stale = false
    const t = setTimeout(async () => {
      const r = await searchCompanies(term)
      if (!stale) { setHits(r); setSearching(false) }
    }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [q, list])

  if (route.tab === 'research' && route.symbol) return <Dossier symbol={route.symbol} section={route.section} />

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const s = q.trim().toUpperCase().replace(/\.(NS|BO)$/, '')
    if (!s) return
    // Exact ticker wins; otherwise the best name match; otherwise try it as typed.
    const pick = hits[active] ?? hits.find(h => h.symbol === s)
    go({ tab: 'research', symbol: pick ? pick.symbol : s })
  }

  const maxW = Math.max(...b.portfolio.map(h => h.weight))
  const book = [...b.portfolio].sort((a, c) => sort === 'weight' ? c.weight - a.weight : Math.abs(c.ret_1d ?? 0) - Math.abs(a.ret_1d ?? 0))

  return (
    <div className="screen">
      <div className="dateline rise"><span>Research</span><span className="bar" /><span>{list.length ? `${list.length.toLocaleString('en-IN')} listed companies` : 'NSE · BSE'}</span></div>
      <h1 className="h1 rise" style={{ '--i': 1 } as React.CSSProperties}>What did they <em>actually</em> say?</h1>
      <p className="lede rise" style={{ '--i': 2 } as React.CSSProperties}>From the company's own reports and earnings calls. Nothing else. Every promise checked against the numbers.</p>

      <div style={{ position: 'relative' }} className="rise">
        <form onSubmit={submit} className="hero-search">
          <ISearch size={20} />
          <input value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, hits.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
              else if (e.key === 'Escape') setQ('')
            }}
            role="combobox" aria-expanded={hits.length > 0} aria-autocomplete="list" placeholder="Company name or NSE ticker" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          {searching ? <span className="spinner" /> : q.trim() ? <span className="kbd">↵</span> : null}
        </form>

        {q.trim() && (hits.length > 0 || (!searching && q.trim().length >= 2)) && (
          <div className="dropdown">
            <div className="list suggest" role="listbox">
              {hits.map((h, i) => (
                <button key={h.symbol} className="li" role="option" aria-selected={i === active}
                  onMouseEnter={() => setActive(i)} onClick={() => go({ tab: 'research', symbol: h.symbol })}>
                  <span className="sym" style={{ width: 110, flex: 'none' }}>{h.symbol}</span>
                  <span className="small muted grow ellipsis">{h.name}</span>
                  {h.exchange === 'BSE' && <span className="tag plain">BSE</span>}
                  {i === active && <span className="accent"><IArrow size={16} /></span>}
                </button>
              ))}
              {!searching && !hits.length && (
                <p className="small muted" style={{ margin: 0, padding: '10px 12px' }}>
                  No listed company matches "{q.trim()}". It may be private or unlisted (for example Cars24), or try its ticker.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="h2">Your portfolio <span className="count num">{b.portfolio.length}</span></h2>
          <div className="row" style={{ gap: 6 }}>
            <button className={`toggle ${sort === 'weight' ? 'on' : ''}`} onClick={() => setSort('weight')} style={{ height: 28 }}>Weight</button>
            <button className={`toggle ${sort === 'move' ? 'on' : ''}`} onClick={() => setSort('move')} style={{ height: 28 }}>Move</button>
          </div>
        </div>
        <div className="tiles">
          {book.map((h, i) => (
            <button key={h.symbol} className="tile rise" style={{ '--i': Math.min(i, 12) } as React.CSSProperties} onClick={() => go({ tab: 'research', symbol: h.symbol })}>
              <div className="row between">
                <span className="sym">{h.symbol}</span>
                <Delta v={h.ret_1d} className="tiny" />
              </div>
              <div className="tiny muted ellipsis" style={{ marginTop: -4 }}>{h.name.replace(/ (Ltd|Limited)\.?$/, '')}</div>
              <Spark data={h.stats.slice(-60).map(s => s.close)} w={200} h={38} fluid />
              <div className="row between">
                <span className="num small">₹{h.price?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                <span className="num tiny faint">{h.weight}%</span>
              </div>
              <div className="wbar"><span style={{ width: `${(h.weight / maxW) * 100}%` }} /></div>
            </button>
          ))}
        </div>
      </div>

      {b.research.length > 0 && (
        <div className="section">
          <h2 className="h2">Watching <span className="count num">{b.research.length}</span></h2>
          <div className="card list">
            {b.research.map(r => (
              <button key={r.symbol} className="li" onClick={() => go({ tab: 'research', symbol: r.symbol })}>
                <span className="sym" style={{ width: 110, flex: 'none' }}>{r.symbol}</span>
                <span className="small muted grow ellipsis">{r.name}</span>
                <span className="chev"><IChev size={16} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
