import { IBack, IBrief, IChev, INetwork, IResearch, ISearch, ISliders } from '../components/Icons'
import { type Route, useApp } from '../ctx'

type Feature = { title: string; body: string; try?: { label: string; route?: Route; ask?: string } }

const LAYERS: { icon: (p: { size?: number }) => JSX.Element; name: string; line: string; features: Feature[] }[] = [
  {
    icon: IBrief, name: 'Brief', line: 'What changed in your portfolio, ranked, with a next step.',
    features: [
      { title: 'A finite brief', body: 'Opens with a count ("8 things need you"), shows the top stories and ends with "you\'re caught up". When the last day was quiet it says so and opens on the week. Clear a card once you have dealt with it.', try: { label: 'Open the Brief', route: { tab: 'brief' } } },
      { title: 'Ranked by what matters', body: 'Every exchange filing is sorted into a category and scored for materiality × position size. Each card shows why it ranks, e.g. "₹7,000 cr ≈ 7% of market cap". Routine filings are folded away.' },
      { title: 'Stories, not filings', body: 'A board meeting can produce three filings at once (results, a CEO exit, a divestment). FINN merges filings for one company within 36 hours into one story.' },
      { title: 'Results cards', body: 'Revenue, EBITDA, PBT and PAT with QoQ and YoY changes, plus warnings such as "other income is 35% of PBT". Banks and NBFCs get NII and bad-loan (NPA) figures instead.' },
      { title: 'Market reaction', body: 'Each story shows how the stock moved in the first session after the filing, with the volume multiple.' },
      { title: 'Unusual moves & alert rules', body: 'Price and volume moves past your thresholds, each linked to the filing that explains it, or flagged "No filing explains this move". Drag the thresholds to see how many alerts you would have had over the last 90 sessions.', try: { label: 'Set alert rules', route: { tab: 'alerts' } } },
    ],
  },
  {
    icon: IResearch, name: 'Research', line: 'What the company actually said, checked against what it delivered.',
    features: [
      { title: 'Company dossiers', body: 'Key numbers (market cap, P/E, ROCE, margin; P/B and ROE for lenders), charts of revenue, margin, profit and operating cash, and a balance-sheet verdict. Every chart has a one-line takeaway above it.', try: { label: 'Open Research', route: { tab: 'research' } } },
      { title: 'Promised vs delivered', body: 'Every checkable commitment from earnings calls, judged against reported numbers. Missed promises are listed first, and each row links to the transcript page it came from.', try: { label: 'See Kaynes', route: { tab: 'research', symbol: 'KAYNES' } } },
      { title: 'Any NSE ticker', body: 'Holdings come from the snapshot. Any other NSE ticker is fetched live from the server.' },
    ],
  },
  {
    icon: INetwork, name: 'Network', line: 'Who you know who can explain it.',
    features: [
      { title: 'A person on every card', body: 'When an event happens, FINN names the one person best placed to explain it, or your way in to a new executive (e.g. a batchmate who worked under them). People notes carry a thin blue rule.' },
      { title: 'What it noticed', body: 'Paths to newly appointed directors, reasons to reconnect, and themes you own with thin coverage in your network.', try: { label: 'Open Network', route: { tab: 'network' } } },
      { title: 'Compliance sense', body: 'If a company has closed its trading window, FINN warns you not to call current insiders until results. Anyone currently at a company carries a SEBI insider-trading reminder.' },
    ],
  },
]

const SHORTCUTS: [string, string][] = [['/ or ⌘K', 'Ask FINN'], ['B', 'Brief'], ['R', 'Research'], ['N', 'Network'], ['Esc', 'Close a sheet']]

export function About() {
  const { b, go, openAsk } = useApp()
  const people = Object.keys(b.network.people).length
  const facts: [string, string][] = [
    [String(b.portfolio.length), 'holdings'],
    [String(b.meta.counts.filings), 'filings read'],
    [String(people), 'people in network'],
  ]
  const runTry = (t: NonNullable<Feature['try']>) => t.route ? go(t.route) : openAsk(t.ask)

  return (
    <div className="screen about">
      <button className="back" onClick={() => go({ tab: 'brief' })}><IBack size={17} /> Brief</button>
      <div className="dateline" style={{ marginTop: 16 }}><span>About</span><span className="bar" /><span>FINN</span></div>
      <h1 className="h1">Less information, <em>ranked</em>, with a next step.</h1>
      <p className="lede">
        FINN is a financial investment agent. It reads NSE exchange filings, earnings-call transcripts and financials for your
        portfolio, then tells you what changed, what the company actually said, and who you know who can explain it.
      </p>

      <div className="card book about-facts">
        {facts.map(([v, l]) => <div key={l}><div className="eyebrow">{l}</div><div className="v">{v}</div></div>)}
      </div>

      {LAYERS.map(L => (
        <section key={L.name} className="about-layer">
          <div className="about-layer-head">
            <span className="about-icon"><L.icon size={18} /></span>
            <div>
              <h2 className="about-name">{L.name}</h2>
              <p className="small muted" style={{ margin: 0 }}>{L.line}</p>
            </div>
          </div>
          <div className="card list">
            {L.features.map(f => (
              <div key={f.title} className="about-feature">
                <div className="strong">{f.title}</div>
                <p className="small muted">{f.body}</p>
                {f.try && <button className="link small about-try" onClick={() => runTry(f.try!)}>{f.try.label}<IChev size={14} /></button>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="about-layer">
        <div className="about-layer-head">
          <span className="about-icon"><ISearch size={18} /></span>
          <div>
            <h2 className="about-name">Ask</h2>
            <p className="small muted" style={{ margin: 0 }}>Answers are objects, not paragraphs.</p>
          </div>
        </div>
        <div className="card about-feature">
          <p className="small muted" style={{ marginTop: 0 }}>
            Search for a ticker, person or theme. FINN returns a dossier, a path to a person or a list of experts. Voice input works on supported browsers.
          </p>
          <div className="about-chips">
            {['way in to Anup Bagchi', 'who knows rural lending?', 'who can explain Polycab?'].map(q => (
              <button key={q} className="tag" onClick={() => openAsk(q)}>{q}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="about-layer">
        <div className="about-layer-head">
          <span className="about-icon"><ISliders size={18} /></span>
          <div><h2 className="about-name">Shortcuts</h2></div>
        </div>
        <div className="card list">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="row between about-feature" style={{ padding: '10px 16px' }}>
              <span className="small">{v}</span><span className="kbd">{k}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="hint" style={{ marginTop: 28 }}>
        Data as of {new Date(b.meta.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
        The investor and their network are fictional, overlaid on real executives named in filings. FINN reads; it never trades.
      </p>
    </div>
  )
}
