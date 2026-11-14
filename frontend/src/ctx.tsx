import { createContext, useContext } from 'react'
import type { AlertRules, Bundle } from './types'

export type Route =
  | { tab: 'brief' }
  | { tab: 'alerts' }
  | { tab: 'research'; symbol?: string; section?: string }
  | { tab: 'network'; theme?: string }

export type Ctx = {
  b: Bundle
  now: Date
  route: Route
  go: (r: Route) => void
  openPerson: (id: string, context?: string) => void
  openAsk: (q?: string) => void
  done: Set<string>
  toggleDone: (id: string) => void
  rules: AlertRules
  setRules: (r: AlertRules) => void
  called: Record<string, string>
  logCall: (id: string) => void
  toast: (msg: string) => void
}

export const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('no app context')
  return c
}

export function toHash(r: Route): string {
  if (r.tab === 'research' && r.symbol) return `#/research/${r.symbol}${r.section ? `/${r.section}` : ''}`
  if (r.tab === 'network' && r.theme) return `#/network/theme/${encodeURIComponent(r.theme)}`
  return `#/${r.tab}`
}

export function fromHash(h: string): { route: Route; person?: string; ask?: string } {
  const [path, query] = h.replace(/^#/, '').split('?')
  const qs = new URLSearchParams(query ?? '')
  const parts = path.split('/').filter(Boolean)
  let route: Route = { tab: 'brief' }
  if (parts[0] === 'alerts') route = { tab: 'alerts' }
  else if (parts[0] === 'research') route = { tab: 'research', symbol: parts[1]?.toUpperCase(), section: parts[2] }
  else if (parts[0] === 'network') route = { tab: 'network', theme: parts[1] === 'theme' ? decodeURIComponent(parts[2] ?? '') : undefined }
  return { route, person: qs.get('p') ?? undefined, ask: qs.has('ask') ? qs.get('ask') ?? '' : undefined }
}
