// The two alert lists shown in the sidebar and on the full alerts page, computed in one place.
import { storyTitle } from './insight'
import { allHits, type Hit } from './signals'
import type { AlertRules, Bundle, Profile } from './types'

/** First date of the last n sessions in the price data. */
export const sessionsSince = (b: Bundle, n = 5) => {
  const dates = b.portfolio[0]?.stats.map(s => s.date) ?? []
  return dates[Math.max(0, dates.length - n)]
}

/** Moves that crossed the alert rules in the last 5 sessions, most important first:
 *  size of the move × position weight; a move no filing explains gets a boost. */
export function importantAlerts(b: Bundle, rules: AlertRules): Hit[] {
  const score = (h: Hit) => (Math.abs(h.ret ?? 0) + Math.min(h.volx ?? 0, 10)) * (1 + h.weight / 5) * (h.story ? 1 : 1.5)
  return allHits(b, rules, sessionsSince(b)).sort((a, c) => score(c) - score(a))
}

export type CallReason = { symbol: string; org: string; current: boolean; text: string; move: number | null; date: string; storyId?: string; score: number }
export type CallPick = { p: Profile; best: CallReason; reasons: CallReason[]; more: number; score: number }

/** Friends worth a call because a current or former listed employer just moved past the
 *  alert rules (last 5 sessions) or has an open Brief story (last 7 days). */
export function friendsToCall(b: Bundle, rules: AlertRules, now: Date): CallPick[] {
  const hits = allHits(b, rules, sessionsSince(b))
  const weekAgo = now.getTime() - 168 * 3.6e6
  const stories = b.brief.stories.filter(s => s.tier === 'act' && new Date(s.published).getTime() >= weekAgo)
  const out: CallPick[] = []
  for (const p of Object.values(b.network.people)) {
    if (p.kind !== 'contact' || !p.tie) continue
    const reasons: CallReason[] = []
    for (const pos of p.positions) {
      if (!pos.symbol) continue
      // Insiders know more, but carry trading-window risk; former staff are the safer, often better call.
      const w = pos.current ? 1.1 : 1
      for (const h of hits.filter(x => x.symbol === pos.symbol)) {
        const move = h.ret ?? 0
        reasons.push({ symbol: pos.symbol, org: pos.org, current: pos.current, move, date: h.date,
          text: h.story ? storyTitle(h.story).title : `${Math.abs(move).toFixed(1)}% move${h.volx ? ` on ${h.volx.toFixed(1)}× volume` : ''}, no filing explains it`,
          storyId: h.story?.id, score: (Math.abs(move) + Math.min(h.volx ?? 0, 10)) * w * (h.story ? 1 : 1.3) })
      }
      for (const st of stories.filter(x => x.symbol === pos.symbol)) {
        if (reasons.some(r => r.storyId === st.id)) continue
        reasons.push({ symbol: pos.symbol, org: pos.org, current: pos.current, move: st.reaction?.ret ?? null, date: st.published.slice(0, 10),
          text: storyTitle(st).title, storyId: st.id, score: (4 + Math.abs(st.reaction?.ret ?? 0)) * w })
      }
    }
    if (!reasons.length) continue
    reasons.sort((a, c) => c.score - a.score)
    out.push({ p, best: reasons[0], reasons, more: new Set(reasons.map(x => x.symbol)).size - 1, score: reasons[0].score * (0.5 + p.tie.score) })
  }
  return out.sort((a, c) => c.score - a.score)
}

export const orgShort = (o: string) => o.replace(/ (Ltd|Limited)\.?$/, '')
