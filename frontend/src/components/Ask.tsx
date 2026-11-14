import { useEffect, useMemo, useRef, useState } from 'react'
import { loadDossier } from '../api'
import { useApp } from '../ctx'
import type { Bundle, CallSuggestion, Profile } from '../types'
import { CallNote } from './Cards'
import { IArrow, IBack, IClose, IMic, INetwork, IPath, IPhone, IRefresh } from './Icons'
import { PathView, PersonLine } from './People'
import { closes, Spark } from './Viz'

// Plain-language aliases for the themes in the expertise map.
const THEME_WORDS: [RegExp, string][] = [
  [/rural|micro ?financ|mfi|grameen/, 'Rural lending & microfinance'], [/gold loan/, 'Rural lending & microfinance'],
  [/speciality|specialty|chem|fluoro/, 'Specialty chemicals'], [/agro|pesticide|crop/, 'Agrochemicals'],
  [/semi|chip|osat|fab\b|silicon/, 'Semiconductors'], [/\bems\b|electronics manuf|contract manuf/, 'Electronics manufacturing (EMS)'],
  [/hospital|healthcare provider/, 'Hospitals'], [/pharma|cdmo|api\b|drug/, 'Pharma & CDMO'], [/aviation|airline|aircraft/, 'Aviation'],
  [/fashion|apparel|value retail|retail/, 'Fashion & value retail'], [/quick ?commerce|q-?comm|food deliver/, 'Quick commerce & food delivery'],
  [/it services|software|tech services/, 'IT services'], [/private bank|banking|\bbank/, 'Private banking'], [/nbfc|consumer lend/, 'Consumer lending (NBFC)'],
  [/insur/, 'Insurance'], [/telecom|telco/, 'Telecom'], [/cable|wire/, 'Cables & wires'], [/paint|coating/, 'Paints'],
  [/infra|construction|metro|epc/, 'Infrastructure & construction'], [/law|legal|insolven|governance|restructur/, 'Corporate law, governance & insolvency'],
  [/environment|pollution|effluent/, 'Environmental regulation'], [/jewel/, 'Jewellery'], [/electrical|transformer|motor|power equip/, 'Electrical equipment & power'],
  [/auto\b|automobile|car maker/, 'Autos'], [/private equity|\bpe\b fund/, 'Private equity'], [/fintech|cyber|security breach/, 'Fintech & cybersecurity'],
]
const STOP = new Set(['india', 'limited', 'ltd', 'industries', 'technologies', 'technology', 'finance', 'bank', 'company', 'enterprise', 'international', 'systems', 'aviation', 'solutions', 'industrial', 'power'])

type Company = { symbol: string; name: string; keys: string[] }

function companies(b: Bundle): Company[] {
  return [...b.portfolio, ...b.research].map(c => {
    const words = c.name.toLowerCase().replace(/[^a-z& ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w))
    const keys = [c.symbol.toLowerCase(), c.name.toLowerCase().replace(/ ltd\.?$/, ''), words.slice(0, 2).join(' '), words[0]].filter(k => k && k.length >= 3)
    if (c.symbol === 'INDIGO') keys.push('indigo', 'interglobe')
    if (c.symbol === 'ETERNAL') keys.push('zomato', 'blinkit')
    if (c.symbol === 'LT') keys.push('l&t', 'larsen')
    if (c.symbol === 'CGPOWER') keys.push('cg power')
    if (c.symbol === 'HDFCBANK') keys.push('hdfc')
    if (c.symbol === 'AUBANK') keys.push('au bank', 'au small')
    return { symbol: c.symbol, name: c.name, keys }
  })
}

function matchPerson(q: string, people: Profile[]): Profile | undefined {
  const s = q.toLowerCase()
  let best: { p: Profile; n: number } | undefined
  for (const p of people) {
    const parts = p.name.toLowerCase().replace(/^(dr|capt|mr|ms)\.?\s+/, '').split(' ')
    const full = parts.join(' ')
    const n = s.includes(full) ? 3 : parts.length > 1 && parts.at(-1)!.length >= 5 && new RegExp(`\\b${parts.at(-1)}\\b`).test(s) ? 2 : 0
    if (n && (!best || n > best.n)) best = { p, n }
  }
  return best?.p
}

function CompanyWho({ symbol, b }: { symbol: string; b: Bundle }) {
  const fromStory = b.brief.stories.find(s => s.symbol === symbol && s.call?.length)?.call
  const [calls, setCalls] = useState<CallSuggestion[] | null>(fromStory ?? null)
  useEffect(() => {
    if (!fromStory) loadDossier(symbol).then(d => setCalls(d.network.call)).catch(() => setCalls([]))
  }, [symbol, fromStory])
  if (calls == null) return <div className="skeleton" style={{ height: 80, margin: '12px 0' }} />
  if (!calls.length) return <div className="hint">Nobody in your network has worked at {symbol}, its competitors or its value chain.</div>
  return <>{calls.slice(0, 3).map(c => <CallNote key={c.contact.id} c={c} label="Call" />)}</>
}

export function Ask({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { b, go, openPerson } = useApp()
  const [q, setQ] = useState(initial)
  const [listening, setListening] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const cos = useMemo(() => companies(b), [b])
  const people = useMemo(() => Object.values(b.network.people), [b])
  const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition

  useEffect(() => { input.current?.focus() }, [])

  const listen = () => {
    if (!SR) return
    const r = new SR()
    r.lang = 'en-IN'
    r.interimResults = true
    r.onresult = (e: SpeechEvent) => setQ(Array.from(e.results).map(x => x[0].transcript).join(''))
    r.onend = () => setListening(false)
    setListening(true)
    r.start()
  }

  const s = q.trim().toLowerCase()
  const person = s ? matchPerson(s, people) : undefined
  const company = s ? cos.find(c => c.keys.some(k => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}([^a-z]|$)`).test(s))) : undefined
  const theme = s ? THEME_WORDS.find(([rx]) => rx.test(s))?.[1] : undefined
  const wantsWho = /\bwho\b|call|explain|talk to|speak|expert/.test(s)
  const wantsReconnect = /reconnect|warm|haven.?t spoken|catch up|cold|lost touch/.test(s)
  const raw = q.trim().toUpperCase()
  const tickerish = /^[A-Z][A-Z0-9&-]{1,14}$/.test(raw) && !company && !person

  const themeRow = theme ? b.network.expertise.themes.find(t => t.theme === theme) : undefined

  const TRY: [string, typeof IPath][] = [['Way in to Anup Bagchi', IPath], ['Who can explain Polycab?', IPhone], ['Who knows rural lending?', INetwork], ['Who should I reconnect with?', IRefresh]]

  return (
    <>
      <div className="palette-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal>
        <div className="palette-head">
          <div className="search">
            <button onClick={onClose} aria-label="Back" className="icon-btn" style={{ width: 30, height: 30 }}><IBack size={19} /></button>
            <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="A ticker, a person, a theme…" autoCorrect="off"
              onKeyDown={e => { if (e.key === 'Escape') onClose() }} />
            {q && <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => { setQ(''); input.current?.focus() }} aria-label="Clear"><IClose size={16} /></button>}
            {SR && <button className={`mic ${listening ? 'on' : ''}`} onClick={listen} aria-label="Speak"><IMic size={19} /></button>}
          </div>
        </div>
        <div className="palette-body">
          {!s && (
            <>
              <div className="eyebrow" style={{ margin: '4px 0 10px' }}>Try asking</div>
              <div className="try">
                {TRY.map(([x, Ic], i) => (
                  <button key={x} className="rise" style={{ '--i': i } as React.CSSProperties} onClick={() => setQ(x)}>
                    <span className="ic"><Ic size={15} /></span><span className="grow">{x}</span><IArrow size={15} />
                  </button>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 18 }}>A ticker, a person, a theme. Ask in plain words{SR ? ', or tap the mic' : ''}.</p>
            </>
          )}

          {wantsReconnect && (
            <section>
              <h2 className="h2">Reasons to reconnect</h2>
              <div className="list">{b.network.reconnect.map(r => <PersonLine key={r.contact.id} p={r.contact} sub={r.hook} right={<span className="tag plain num">{r.months_silent} mo</span>} />)}</div>
            </section>
          )}

          {person && !wantsReconnect && (
            <section style={{ marginBottom: 20 }}>
              <h2 className="h2">{person.kind === 'public' ? `Your way in to ${person.name}` : 'Person'}</h2>
              {person.kind === 'public' ? (
                person.paths?.length ? person.paths.slice(0, 2).map(p => (
                  <div key={p.contact.id} className="card card-pad" style={{ paddingTop: 4, marginBottom: 10 }}><PathView path={p} target={person} /></div>
                )) : <div className="hint">No one in your network has crossed paths with {person.name} yet.</div>
              ) : null}
              {person.kind !== 'public' && <div className="list"><PersonLine p={person} /></div>}
              <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => openPerson(person.id)}>Full profile <IArrow size={15} /></button>
            </section>
          )}

          {company && !person && (
            <section style={{ marginBottom: 20 }}>
              {wantsWho ? <><h2 className="h2">Who can explain {company.symbol}</h2><CompanyWho symbol={company.symbol} b={b} /></> : null}
              <div className="card list" style={{ marginTop: wantsWho ? 16 : 0 }}>
                <button className="li" onClick={() => { onClose(); go({ tab: 'research', symbol: company.symbol }) }}>
                  <div className="grow"><span className="sym">{company.symbol}</span><div className="small muted">{company.name}</div></div>
                  {closes(b, company.symbol).length > 1 && <Spark data={closes(b, company.symbol)} w={80} h={28} />}
                  <span className="chev"><IArrow size={17} /></span>
                </button>
                {!wantsWho && <button className="li small link" onClick={() => setQ(`Who can explain ${company.name.split(' ')[0]}?`)}><IPhone size={15} />Who can explain {company.symbol}?</button>}
              </div>
            </section>
          )}

          {theme && !person && !company && (
            <section>
              <h2 className="h2">{theme}</h2>
              {themeRow?.people.length ? (
                <div className="list">{themeRow.people.map(p => <PersonLine key={p.contact.id} p={p.contact} sub={p.why} />)}</div>
              ) : <div className="hint">Nobody in your network has worked in {theme.toLowerCase()}.</div>}
              <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => { onClose(); go({ tab: 'network', theme }) }}>Open theme <IArrow size={15} /></button>
            </section>
          )}

          {tickerish && (
            <div className="card list">
              <button className="li" onClick={() => { onClose(); go({ tab: 'research', symbol: raw }) }}>
                <div className="grow"><div className="small"><strong>Research {raw}</strong></div><div className="tiny muted">Build a dossier from its filings and transcripts</div></div>
                <span className="chev"><IArrow size={17} /></span>
              </button>
            </div>
          )}

          {s && !person && !company && !theme && !tickerish && !wantsReconnect && (
            <div className="hint">FINN understands tickers, company names, people in your network or in filings, themes ("specialty chemicals"), and "who should I reconnect with". Try one of those.</div>
          )}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">esc</span>close</span>
          <span><span className="kbd">/</span>open anywhere</span>
          <span style={{ marginLeft: 'auto' }}>Answers come from filings and your own network.</span>
        </div>
      </div>
    </>
  )
}

type SpeechEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> }
type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: SpeechEvent) => void; onend: () => void; start: () => void }
