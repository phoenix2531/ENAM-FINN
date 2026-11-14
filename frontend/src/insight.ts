// Every block on screen opens with its conclusion. These sentences are arithmetic
// over reported numbers, never model output, so they cannot hallucinate.
import { cr } from './format'
import type { Dossier, ResultsCard, Story } from './types'

const word = (v: number) => (v >= 0 ? 'up' : 'down')
const pc = (v: number) => `${Math.abs(v).toFixed(0)}%`

/** "Profit down 70% YoY; revenue down 9%": the result itself, not "Board approved results". */
export function resultsHeadline(r: ResultsCard): string | null {
  const get = (m: string) => r.lines.find(l => l.metric === m)
  // A lender's quarter is judged on net interest income, not revenue.
  const pat = get('PAT'), rev = get('Net interest income') ?? get('Revenue')
  const revWord = rev?.metric === 'Net interest income' ? 'net interest income' : 'revenue'
  const parts: string[] = []
  if (pat?.value != null && pat.value < 0) parts.push(`Net loss of ${cr(Math.abs(pat.value))}`)
  else if (pat?.yoy != null) parts.push(`Profit ${word(pat.yoy)} ${pc(pat.yoy)} YoY`)
  if (rev?.yoy != null) parts.push(`${revWord} ${word(rev.yoy)} ${pc(rev.yoy)}`)
  if (!parts.length) return null
  const s = parts.join('; ')
  return s[0].toUpperCase() + s.slice(1)
}

/** Exchange digests of results are often boilerplate. Lead with the numbers when they are. */
export function storyTitle(s: Story): { title: string; sub?: string } {
  const boiler = !/\d+(\.\d+)?%|crore|billion|lakh|loss|profit/i.test(s.headline)
  // Only when the results are the news; for a CEO exit announced with results, the exit leads.
  const computed = s.category === 'results' && s.results && boiler ? resultsHeadline(s.results) : null
  return computed ? { title: computed, sub: s.headline } : { title: s.headline }
}

// Reasons that are true of every card explain nothing about this one.
const GENERIC = new Set(['category you watch', 'severe language in filing'])
/** The one reason this story outranks the others, if there is a specific one. */
export function whyItRanks(s: Story): string | null {
  return s.why.find(w => !GENERIC.has(w)) ?? null
}

export function revenueTakeaway(d: Dossier): string | null {
  const t = d.fundamentals.trajectory
  const rev = t.revenue.map((v, i) => [t.years[i], v] as const).filter(([, v]) => v != null && v > 0)
  if (rev.length < 2) return null
  const [y0, v0] = rev[0], [y1, v1] = rev[rev.length - 1]
  const x = v1 / v0
  let s = x >= 1.5 ? `Revenue grew ${x.toFixed(1)}× from ${y0} to ${y1}` : x >= 1 ? `Revenue up ${pc((x - 1) * 100)} from ${y0} to ${y1}` : `Revenue fell ${pc((1 - x) * 100)} from ${y0} to ${y1}`
  const m = t.margin.filter((v): v is number => v != null)
  if (!d.fundamentals.balance.financial_company && m.length >= 2) {
    const a = m[0], b = m[m.length - 1]
    s += Math.abs(b - a) < 1 ? `; margin steady near ${b.toFixed(0)}%` : `; margin ${a.toFixed(0)}% → ${b.toFixed(0)}%`
  }
  return s
}

export function cashTakeaway(d: Dossier): { text: string; tone: 'up' | 'down' | 'warn' } | null {
  const c = d.fundamentals.cash
  if (c.note || !c.cfo.length) return null
  const years = c.cfo.slice(-5).map(([y]) => y)
  const pat = c.pat.filter(([y, v]) => years.includes(y) && v != null).reduce((n, [, v]) => n + (v as number), 0)
  const cfo = c.cfo.slice(-5).reduce((n, [, v]) => n + v, 0)
  if (pat <= 0) return null
  if (cfo < 0) return { text: `${cr(pat)} of profit over five years, yet operating cash was ${cr(cfo)}`, tone: 'down' }
  const conv = Math.round((cfo / pat) * 100)
  if (conv >= 80) return { text: `Profits turn into cash: ${conv}% converted over five years`, tone: 'up' }
  return { text: `Only ${conv}% of five years' profit became operating cash`, tone: conv < 60 ? 'down' : 'warn' }
}

export function leverageTakeaway(d: Dossier): string {
  const b = d.fundamentals.balance
  if (b.financial_company) return 'A lender: borrowing is its raw material, not a risk signal on its own'
  const de = b.debt_to_equity.at(-1)?.[1]
  if (de == null) return 'Leverage not reported'
  if (de < 0.1) return 'Almost debt-free'
  if (de < 0.5) return `Low leverage: debt is ${de.toFixed(2)}× equity`
  if (de < 1) return `Moderate leverage: debt is ${de.toFixed(2)}× equity`
  return `High leverage: debt is ${de.toFixed(1)}× equity`
}

/** Asset quality for a lender: where gross NPA is and which way it moved over a year. */
export function assetQualityTakeaway(d: Dossier): { text: string; tone: 'up' | 'down' | 'muted' } | null {
  const q = d.fundamentals.trajectory.quarters.filter(x => x.gnpa != null)
  if (!q.length) return null
  const last = q[q.length - 1]
  const yearAgo = q.find(x => x.period === `${+last.period.slice(0, 4) - 1}${last.period.slice(4)}`)
  const g = last.gnpa as number
  if (!yearAgo) return { text: `Gross NPA ${g.toFixed(2)}% of loans`, tone: 'muted' }
  const bps = Math.round((g - (yearAgo.gnpa as number)) * 100)
  if (Math.abs(bps) < 10) return { text: `Gross NPA steady at ${g.toFixed(2)}% of loans`, tone: 'muted' }
  return bps < 0
    ? { text: `Bad loans falling: gross NPA ${g.toFixed(2)}%, down ${-bps} bps in a year`, tone: 'up' }
    : { text: `Bad loans rising: gross NPA ${g.toFixed(2)}%, up ${bps} bps in a year`, tone: 'down' }
}
