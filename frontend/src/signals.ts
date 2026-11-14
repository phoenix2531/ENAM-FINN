import type { AlertRules, Bundle, DayStat, Holding, Story } from './types'

export type Hit = DayStat & { symbol: string; name: string; weight: number; why: string[]; story?: Story }

export function hitsFor(h: Holding, rules: AlertRules): (DayStat & { why: string[] })[] {
  const out: (DayStat & { why: string[] })[] = []
  for (const s of h.stats) {
    const why: string[] = []
    if (s.volx != null && s.volx >= rules.volume_multiple) why.push(`${s.volx.toFixed(1)}× volume`)
    if (s.ret != null && Math.abs(s.ret) >= rules.price_move_pct) why.push(`${s.ret > 0 ? '+' : '−'}${Math.abs(s.ret).toFixed(1)}% on the day`)
    if (why.length) out.push({ ...s, why })
  }
  return out
}

/** Find the filing that most plausibly explains a move: same company, filed up to
 *  two days before the session (results often land after the close). */
export function explain(b: Bundle, symbol: string, date: string): Story | undefined {
  const d = new Date(date + 'T15:30:00+05:30').getTime()
  return b.brief.stories
    .filter(s => s.symbol === symbol)
    .map(s => ({ s, dt: d - new Date(s.published).getTime() }))
    .filter(x => x.dt >= -6 * 3.6e6 && x.dt <= 2.5 * 86400e3)
    .sort((a, b) => b.s.score - a.s.score)[0]?.s
}

export function allHits(b: Bundle, rules: AlertRules, sinceISO?: string): Hit[] {
  const out: Hit[] = []
  for (const h of b.portfolio) {
    for (const x of hitsFor(h, rules)) {
      if (sinceISO && x.date < sinceISO) continue
      out.push({ ...x, symbol: h.symbol, name: h.name, weight: h.weight, story: explain(b, h.symbol, x.date) })
    }
  }
  return out.sort((a, b) => (b.date.localeCompare(a.date)) || Math.abs(b.ret ?? 0) - Math.abs(a.ret ?? 0))
}
