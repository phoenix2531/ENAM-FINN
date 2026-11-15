// Shapes produced by backend/finn/pipeline.py (snapshot) and finn/api.py (live).

export type Tie = { score: number; label: 'strong' | 'medium' | 'weak'; how: string; last: string; touches_12m?: number; last_contact?: string | null }
export type PersonCard = { id: string; name: string; headline: string; city: string; kind: 'contact' | 'public' }
export type Link = { kind: 'worked' | 'studied'; confidence: 'confirmed' | 'likely' | 'possible'; strength: number; text: string }
export type Path = { contact: PersonCard; tie: Tie; links: Link[]; score: number; label: 'strong' | 'medium' | 'weak' }
export type CallSuggestion = { contact: PersonCard; tie: Tie; credential: string; knows: string; caution: string | null; score: number }

export type Position = { org: string; org_id: string | null; symbol: string | null; title: string; from: number | null; to: number | null; current: boolean; function: string }
export type Profile = PersonCard & {
  positions: Position[]
  education: { school: string; degree?: string; year?: number | null }[]
  sources: string[]
  tie?: Tie
  expertise?: [string, number][]
  crossed?: { person: PersonCard; links: Link[] }[]
  paths?: Path[]
}

export type ResultsLine = { metric: string; value: number | null; qoq: number | null; yoy: number | null; prev: number | null; year_ago: number | null }
export type ResultsCard = { period: string; label: string; basis: string; lines: ResultsLine[]; notes: string[]; filing_pdf: string | null; source: string; lender?: boolean }

export type StoryPerson = {
  id: string; name: string; role: string; change: string; incoming: boolean; effective: string; bio: string
  career: Position[]; education: { school: string }[]; sources: string[]; paths: Path[]
}

export type Story = {
  id: string; symbol: string; company: string; weight: number | null; published: string
  category: string; subtype: string; tier: 'act' | 'glance'; score: number; rank: number; why: string[]
  headline: string
  filings: { title: string; excerpt: string; url: string; category: string; published: string }[]
  reaction: { date: string; ret: number | null; volx: number | null } | null
  met: { date: string; with: string } | null
  caution: string | null
  results?: ResultsCard
  people?: StoryPerson[]
  call?: CallSuggestion[]
  transcript?: boolean
}

export type Routine = { symbol: string; company: string; title: string; excerpt: string; url: string; category: string; subtype: string; published: string }
export type DayStat = { date: string; close: number; ret: number | null; vol: number; volx: number | null }
export type Holding = { symbol: string; name: string; weight: number; sector: string; mcap: number | null; price: number | null; ret_1d: number | null; stats: DayStat[] }

export type Notice = { kind: 'path' | 'reconnect' | 'gap' | 'caution'; symbol: string | null; text: string; detail: string; strength: string; person?: string; contact?: string; story?: string }
export type ThemeRow = {
  theme: string; portfolio: string[]; depth: number
  coverage: 'deep' | 'thin' | 'blind spot' | 'outside portfolio'
  people: { contact: PersonCard; score: number; why: string; tie: string }[]
}
export type Reconnect = { contact: PersonCard; months_silent: number; event: { symbol: string; headline: string; category: string; published: string }; tie: Tie; hook: string }

export type AlertRules = { volume_multiple: number; volume_lookback: number; price_move_pct: number; categories: string[] }

export type Bundle = {
  meta: {
    generated_at: string; today: string
    investor: {
      name: string; role: string; fund: string
      positions?: { org: string; title: string; from: string | number | null; to: string | number | null }[]
      education?: { school: string; degree?: string; year?: number | null }[]
    }
    llm: { provider: string | null; total_usd: number; calls: number; tasks: { task: string; model: string; n: number; tin: number; tout: number; cost: number }[] }
    counts: { filings: number; stories: number }
  }
  portfolio: Holding[]
  research: { symbol: string; name: string }[]
  brief: { stories: Story[]; routine: Routine[]; upcoming: { symbol: string; date: string; what: string; url: string }[]; cautions: Record<string, string> }
  alert_rules: AlertRules
  network: { people: Record<string, Profile>; expertise: { themes: ThemeRow[] }; reconnect: Reconnect[]; notices: Notice[]; themes: string[] }
}

export type LedgerRow = { promise: string; made_in: string; quote: string; page: number; topic: string; status: 'delivered' | 'on_track' | 'missed' | 'walked_back' | 'pending' | 'unverifiable'; actual: string }
export type Guidance = {
  status: string; message?: string
  ledger?: LedgerRow[]
  current_guidance?: { metric: string; target: string; horizon: string; quote: string; made_in: string; page: number; change: string }[]
  credibility?: { label: string; summary: string }
  narrative_vs_numbers?: { story: string; numbers: string; verdict: 'agree' | 'partly' | 'diverge'; made_in: string; page: number }[]
  bull?: { point: string; evidence: string; source: string }[]
  bear?: { point: string; evidence: string; source: string }[]
  calls?: { call: string; held: string; url: string; commitments: number }[]
  sources?: Record<string, string>
  tokens_saved_pct?: number
}
export type Flag = { level: 'red' | 'watch' | 'note'; area: string; text: string }
export type Dossier = {
  symbol: string; name: string; sector_path: string[]; about: string; bse_code: string | null
  links: { screener: string; nse: string }
  fundamentals: {
    snapshot: { price: number | null; market_cap_cr: number | null; pe: number | null; pb: number | null; roce: number | null; roe: number | null; dividend_yield: number | null; range_52w: [number | null, number | null]; range_position: number | null }
    financial: { ttm_revenue: number | null; ttm_ebitda: number | null; ttm_pat: number | null; ebitda_margin: number | null; pat_margin: number | null; ebitda_label: string }
    trajectory: { years: string[]; revenue: number[]; ebitda: number[]; pat: number[]; margin: number[]; cagr: { revenue: Record<string, number | null>; pat: Record<string, number | null> }; quarters: { period: string; revenue: number | null; pat: number | null; margin: number | null; rev_yoy: number | null; pat_yoy: number | null; nii?: number | null; nii_yoy?: number | null; gnpa?: number | null; nnpa?: number | null }[]; margin_trend?: string; margin_change_pts?: number }
    balance: { financial_company: boolean; debt_to_equity: [string, number][]; borrowings_cr: number | null; equity_cr: number | null; cwip_to_fixed_assets: number | null; working_capital: Record<string, [string, number][]> }
    cash: { cfo: [string, number][]; pat: [string, number | null][]; fcf: [string, number][]; conversion: [string, number][]; conversion_5y?: number; note?: string }
    holding: { promoters: [string, number][]; fiis: [string, number][] } | null
    flags: Flag[]
    as_of: string; basis: string
  }
  business: { status: string; message?: string; what?: string; segments?: { name: string; share: string; comment: string }[]; kpis?: { name: string; value: string; page: number }[]; source?: { call: string; url: string } }
  guidance: Guidance
  documents: { transcripts: { call: string; held: string; url: string }[]; annual_reports: { year: number; url: string }[] }
  network: { call: CallSuggestion[]; alumni: { contact: PersonCard; title: string; from: number | null; to: number | null; current: boolean; tie: Tie }[]; people: { person: PersonCard; paths: Path[] }[] }
  generated: string
}
