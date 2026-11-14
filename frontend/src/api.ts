import type { Bundle, Dossier } from './types'

// Live API when one is reachable; otherwise the static snapshot shipped with
// the app. The UI never needs to know which one answered, except to say so.
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export let live = false

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  const ct = r.headers.get('content-type') ?? ''
  if (!ct.includes('json')) throw new Error('not json')
  return r.json() as Promise<T>
}

let probe: Promise<boolean> | null = null

/** Is the FINN server reachable? Asked in the background, never before first
 *  paint: a free-tier server can take ~50s to wake, and the snapshot can't. */
export function checkLive(): Promise<boolean> {
  probe ??= fetch(`${API}/api/health`, { signal: AbortSignal.timeout(90_000) })
    .then(r => r.json()).then(j => (live = !!j?.ok)).catch(() => false)
  return probe
}

/** The snapshot is the same data the server would send, so the app paints from it at once. */
export async function loadBundle(): Promise<Bundle> {
  void checkLive()
  return getJSON<Bundle>(`${import.meta.env.BASE_URL}data/bundle.json`)
}

const cache = new Map<string, Promise<Dossier>>()

export class NeedsLive extends Error {}

export function loadDossier(symbol: string): Promise<Dossier> {
  const s = symbol.toUpperCase()
  if (!cache.has(s)) {
    const p = (async () => {
      try {
        return await getJSON<Dossier>(`${import.meta.env.BASE_URL}data/dossier/${s}.json`)
      } catch {
        if (!(await checkLive())) throw new NeedsLive(s)
        return getJSON<Dossier>(`${API}/api/dossier/${encodeURIComponent(s)}`)
      }
    })()
    p.catch(() => cache.delete(s))
    cache.set(s, p)
  }
  return cache.get(s)!
}

export type Hit = { symbol: string; name: string; exchange?: string }

// Every NSE-listed company ([symbol, name]), shipped with the app. Loaded once.
let companies: Promise<[string, string][]> | null = null
export function loadCompanies(): Promise<[string, string][]> {
  companies ??= getJSON<[string, string][]>(`${import.meta.env.BASE_URL}data/companies.json`)
    .catch(() => { companies = null; return [] })
  return companies
}

/** Rank listed companies against what was typed: exact ticker, ticker prefix,
 *  name prefix, word prefix, then substring. Every query word must match. */
export function matchCompanies(list: [string, string][], q: string, limit = 8): Hit[] {
  const u = q.trim().toUpperCase()
  if (!u) return []
  const words = u.split(/\s+/)
  const scored: [number, Hit][] = []
  for (const [symbol, name] of list) {
    const n = name.toUpperCase()
    if (!words.every(w => symbol.includes(w) || n.includes(w))) continue
    const score =
      symbol === u ? 0
      : symbol.startsWith(u) ? 1
      : n.startsWith(u) ? 2
      : words.every(w => n.split(/[\s&.()-]+/).some(t => t.startsWith(w))) ? 3
      : symbol.includes(u) ? 4 : 5
    scored.push([score + name.length / 1000, { symbol, name }])
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1])
}

/** Company name or partial ticker -> listed companies. Live API only; the
 *  static snapshot has no search, so callers fall back to their own list. */
export async function searchCompanies(q: string): Promise<Hit[]> {
  if (!live || !q.trim()) return []
  try {
    return await getJSON<Hit[]>(`${API}/api/search?q=${encodeURIComponent(q.trim())}`)
  } catch {
    return []
  }
}
